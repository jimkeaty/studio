// GET + PATCH /api/admin/tc/[id] — admin reads or updates a single TC intake
// Supports: approve/reject/in_review/update actions (transactionIntakes)
// Also supports: checklist workflow, TC assignment, status updates (tcIntakes)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike, isStaff, getStaffRole } from '@/lib/auth/staffAccess';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { resolveGCI } from '@/lib/commissions';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function toOptStr(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

type Params = { params: Promise<{ id: string }> };

// ── Helper: check both collections for the intake ─────────────────────────
async function findIntake(id: string) {
  // Try transactionIntakes first (existing workflow)
  const txDoc = await adminDb.collection('transactionIntakes').doc(id).get();
  if (txDoc.exists) {
    return { doc: txDoc, collection: 'transactionIntakes' as const };
  }
  // Try tcIntakes (new workflow)
  const tcDoc = await adminDb.collection('tcIntakes').doc(id).get();
  if (tcDoc.exists) {
    return { doc: tcDoc, collection: 'tcIntakes' as const };
  }
  return null;
}

// // ── GET single intake ──────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    // TC staff (tc, tc_admin, office_admin) can all view intake details
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden');

    const { id } = await params;
    const result = await findIntake(id);
    if (!result) return jsonError(404, 'Intake not found');

    const { doc, collection } = result;

    // Fetch checklist subcollection (works for both collections)
    let checklist: any[] = [];
    try {
      const checklistSnap = await adminDb
        .collection(collection)
        .doc(id)
        .collection('checklist')
        .get();

      checklist = checklistSnap.docs.map((d) => ({
        id: d.id,
        ...serializeFirestore(d.data()),
      }));

      // Sort client-side by order
      checklist.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch {
      // Checklist subcollection may not exist
    }

    return NextResponse.json({
      ok: true,
      intake: {
        id: doc.id,
        ...serializeFirestore(doc.data()!),
      },
      checklist,
    });
  } catch (err: any) {
    console.error('[GET /api/admin/tc/[id]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── PATCH — update, approve, reject, checklist, or assign TC ────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    // TC role (tc, tc_admin, office_admin) can all update and approve intakes
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden');
    const callerRole = await getStaffRole(decoded.uid);

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action || '').trim(); // 'update' | 'approve' | 'reject' | 'in_review' | '' (for workflow updates)

    const result = await findIntake(id);
    if (!result) return jsonError(404, 'Intake not found');

    const { doc, collection } = result;
    const docRef = adminDb.collection(collection).doc(id);
    const intake = doc.data()!;
    const now = new Date();

    // ── Workflow updates (no action specified — checklist, status, TC assignment) ──
    if (!action) {
      const updates: Record<string, any> = { updatedAt: now };

      // Update status if provided
      if (body.status) {
        const validStatuses = ['submitted', 'in_review', 'approved', 'rejected'];
        if (!validStatuses.includes(body.status)) {
          return jsonError(400, `Invalid status: ${body.status}`);
        }
        updates.status = body.status;
        updates.reviewedAt = now;
        updates.reviewedBy = decoded.email || decoded.uid;
      }

      // Update assigned TC profile if provided
      if (body.assignedTcProfileId !== undefined) {
        updates.assignedTcProfileId = body.assignedTcProfileId;
      }

      await docRef.update(updates);

      // Update checklist items if provided
      if (body.checklist && Array.isArray(body.checklist)) {
        const batch = adminDb.batch();
        for (const item of body.checklist) {
          if (!item.itemId) continue;
          const itemRef = docRef.collection('checklist').doc(item.itemId);
          batch.update(itemRef, {
            completed: !!item.completed,
            completedBy: item.completed ? (item.completedBy || decoded.email || decoded.uid) : null,
            completedAt: item.completed ? (item.completedAt ? new Date(item.completedAt) : now) : null,
          });
        }
        await batch.commit();
      }

      return NextResponse.json({ ok: true, status: updates.status || 'updated' });
    }

    // ── REJECT ──────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const rejectionReason = toOptStr(body.rejectionReason) || 'No reason provided';
      await docRef.update({
        status: 'rejected',
        rejectionReason,
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    // ── IN_REVIEW ────────────────────────────────────────────────────────────
    if (action === 'in_review') {
      await docRef.update({
        status: 'in_review',
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'in_review' });
    }

    // ── UPDATE (save edits without changing status) ──────────────────────────
    if (action === 'update') {
      const updates: Record<string, any> = { updatedAt: now };
      const editableFields = [
        // Core
        'closingType', 'dealType', 'address', 'clientName', 'dealSource',
        // Financial
        'listPrice', 'salePrice', 'commissionPercent', 'commissionBasePrice', 'gci',
        'transactionFee', 'earnestMoney', 'depositHolderOther',
        'brokerPct', 'brokerGci', 'agentPct', 'agentDollar',
        // Dates
        'listingDate', 'contractDate', 'optionExpiration', 'inspectionDeadline',
        'surveyDeadline', 'projectedCloseDate', 'closedDate',
        'loanApplicationDeadline', 'appraisalDeadline', 'titleDeadline', 'finalLoanCommitmentDeadline',
        // Client contact
        'clientEmail', 'clientPhone', 'clientNewAddress',
        'client2Name', 'client2Email', 'client2Phone',
        // Buyer contact
        'buyerName', 'buyerEmail', 'buyerPhone',
        'buyer2Name', 'buyer2Email', 'buyer2Phone',
        // Seller contact
        'sellerName', 'sellerEmail', 'sellerPhone',
        'seller2Name', 'seller2Email', 'seller2Phone',
        // Other agent
        'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherBrokerage',
        // Lender
        'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone', 'lenderOffice',
        // Title
        'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
        'titleAttorney', 'titleOffice',
        // Inspection
        'targetInspectionDate', 'inspectionTypes', 'tcScheduleInspectionsOther', 'inspectorName',
        // Seller commission
        'sellerPayingListingAgent', 'sellerPayingListingAgentUnknown', 'sellerPayingBuyerAgent',
        // Buyer closing costs
        'buyerClosingCostTotal', 'buyerClosingCostAgentCommission',
        'buyerClosingCostTxFee', 'buyerClosingCostOther',
        // Compliance / warranty
        'warrantyPaidBy', 'txComplianceFeeAmount', 'txComplianceFeePaidBy',
        'occupancyDates', 'shortageAmount', 'buyerBringToClosing',
        // Notes
        'notes', 'additionalComments',
        // Co-agent
        'hasCoAgent', 'coAgentId', 'coAgentDisplayName', 'coAgentRole',
        'primaryAgentSplitPercent', 'coAgentSplitPercent',
      ];
      for (const field of editableFields) {
        if (field in body) {
          const val = body[field];
          updates[field] = val === '' || val === null ? null : val;
        }
      }
      await docRef.update(updates);
      return NextResponse.json({ ok: true, status: 'updated' });
    }

    // ── APPROVE → create transaction ─────────────────────────────────────────
    if (action === 'approve') {
      if (intake.status === 'approved') {
        return jsonError(400, 'Intake is already approved');
      }

      const agentId = String(intake.agentId || '').trim();
      const agentDisplayName = String(intake.agentDisplayName || '').trim();

      if (!agentId) return jsonError(400, 'Intake has no agentId — cannot approve');

      // Determine GCI for split calculation
      const rawGci = resolveGCI({
        commissionBasePrice: intake.commissionBasePrice,
        salePrice: intake.salePrice,
        commissionPercent: intake.commissionPercent,
        gci: intake.gci,
      });
      const rawAgentDollar = intake.agentDollar ? toNum(intake.agentDollar) : null;
      const rawBrokerGci = intake.brokerGci ? toNum(intake.brokerGci) : null;

      let splitSnapshot: Record<string, any>;
      let creditSnapshot: Record<string, any>;
      let agentType = 'independent';
      let calculationModel = 'individual';
      let pendingCoAgentData: Record<string, any> | null = null;
      let pendingPrimarySplitPct: number | null = null;

      // ── Commission override: if TC/Admin set an explicit override, use it directly ──
      if (intake.commissionOverride && (rawAgentDollar !== null || intake.agentPct != null)) {
        const grossCommission = rawGci > 0 ? rawGci : 0;
        const overrideAgentDollar = rawAgentDollar !== null ? rawAgentDollar : (intake.agentPct ? grossCommission * (toNum(intake.agentPct) / 100) : 0);
        const overrideBrokerGci = rawBrokerGci !== null ? rawBrokerGci : Math.max(0, grossCommission - overrideAgentDollar);

        splitSnapshot = {
          primaryTeamId: null, teamPlanId: null, memberPlanId: null,
          grossCommission,
          agentSplitPercent: intake.agentPct ? toNum(intake.agentPct) : null,
          companySplitPercent: intake.brokerPct ? toNum(intake.brokerPct) : null,
          agentNetCommission: overrideAgentDollar,
          leaderStructurePercent: null, leaderStructureGross: null,
          memberPercentOfLeaderSide: null, memberPaid: null, leaderRetainedAfterMember: null,
          companyRetained: overrideBrokerGci,
          commissionOverride: true,
          commissionOverrideBy: intake.commissionOverrideBy || null,
          commissionOverrideAt: intake.commissionOverrideAt || null,
        };

        creditSnapshot = {
          leaderboardAgentId: agentId,
          leaderboardAgentDisplayName: agentDisplayName,
          progressionMemberAgentId: null,
          progressionLeaderAgentId: null,
          progressionTeamId: null,
          progressionCompanyDollarCredit: overrideBrokerGci,
        };
        agentType = 'independent';
        calculationModel = 'override';
      } else if (rawAgentDollar !== null && rawAgentDollar > 0) {
        // ── Historical / manual override: use supplied numbers directly ──────
        const grossCommission = rawGci > 0 ? rawGci : 0;
        const companyRetained =
          rawBrokerGci !== null && rawBrokerGci > 0
            ? rawBrokerGci
            : Math.max(0, grossCommission - rawAgentDollar);

        splitSnapshot = {
          primaryTeamId: null,
          teamPlanId: null,
          memberPlanId: null,
          grossCommission,
          agentSplitPercent: intake.agentPct ? toNum(intake.agentPct) : null,
          companySplitPercent: intake.brokerPct ? toNum(intake.brokerPct) : null,
          agentNetCommission: rawAgentDollar,
          leaderStructurePercent: null,
          leaderStructureGross: null,
          memberPercentOfLeaderSide: null,
          memberPaid: null,
          leaderRetainedAfterMember: null,
          companyRetained,
        };

        creditSnapshot = {
          leaderboardAgentId: agentId,
          leaderboardAgentDisplayName: agentDisplayName,
          progressionMemberAgentId: null,
          progressionLeaderAgentId: null,
          progressionTeamId: null,
          progressionCompanyDollarCredit: companyRetained,
        };
      } else {
        // ── Live calculation via team resolver ────────────────────────────────────────
        const commission = rawGci;

        // If co-agent is present, split the gross first then calculate each agent independently
        const hasCoAgent = !!intake.hasCoAgent;
        const coAgentId = hasCoAgent ? String(intake.coAgentId || '').trim() : '';
        const coAgentDisplayName = hasCoAgent ? String(intake.coAgentDisplayName || '').trim() : '';
        const primarySplitPct = hasCoAgent ? toNum(intake.primaryAgentSplitPercent ?? 50) : 100;
        const coSplitPct = hasCoAgent ? toNum(intake.coAgentSplitPercent ?? 50) : 0;

        const primaryShare = hasCoAgent && coAgentId ? commission * (primarySplitPct / 100) : commission;
        const coShare = hasCoAgent && coAgentId ? commission * (coSplitPct / 100) : 0;

        const calc = await resolveTransactionCalculation({ agentId, agentDisplayName, commission: primaryShare });
        splitSnapshot = calc.splitSnapshot as any;
        creditSnapshot = calc.creditSnapshot as any;
        agentType = calc.agentType;
        calculationModel = calc.calculationModel;

        // Co-agent calculation
        if (hasCoAgent && coAgentId && coAgentDisplayName) {
          let coSplitSnapshot: any = null;
          let coCreditSnapshot: any = null;
          try {
            const coCalc = await resolveTransactionCalculation({
              agentId: coAgentId,
              agentDisplayName: coAgentDisplayName,
              commission: coShare,
            });
            coSplitSnapshot = coCalc.splitSnapshot;
            coCreditSnapshot = coCalc.creditSnapshot;
          } catch {
            coSplitSnapshot = {
              primaryTeamId: null, teamPlanId: null, memberPlanId: null,
              grossCommission: coShare,
              agentSplitPercent: null, companySplitPercent: null,
              agentNetCommission: 0,
              leaderStructurePercent: null, leaderStructureGross: null,
              memberPercentOfLeaderSide: null, memberPaid: null,
              leaderRetainedAfterMember: null,
              companyRetained: 0,
            };
          }
          if (!coCreditSnapshot) {
            coCreditSnapshot = {
              leaderboardAgentId: coAgentId,
              leaderboardAgentDisplayName: coAgentDisplayName,
              progressionMemberAgentId: coAgentId,
              progressionLeaderAgentId: null,
              progressionTeamId: null,
              progressionCompanyDollarCredit: coShare,
            };
          }
          // Store co-agent data in outer-scope variables to be merged into txPayload below
          pendingCoAgentData = {
            agentId: coAgentId,
            agentDisplayName: coAgentDisplayName,
            role: intake.coAgentRole || 'other',
            splitPercent: coSplitPct,
            sideCredit: coSplitPct / 100,
            splitSnapshot: coSplitSnapshot,
            creditSnapshot: coCreditSnapshot,
          };
          pendingPrimarySplitPct = primarySplitPct;
        }
      }

      // Determine year from dates
      const closedDate = toOptStr(intake.closedDate);
      const contractDate = toOptStr(intake.contractDate);
      const dateForYear = closedDate || contractDate || new Date().toISOString();
      const year = new Date(dateForYear).getFullYear() || new Date().getFullYear();

      // Map deal type → transactionType (for existing schema compatibility)
      const dealType = toOptStr(intake.dealType) || 'residential_sale';
      const txTypeMap: Record<string, string> = {
        residential_sale: 'residential_sale',
        residential_lease: 'rental',
        land: 'residential_sale',
        commercial_sale: 'commercial_sale',
        commercial_lease: 'commercial_lease',
      };
      const transactionType = txTypeMap[dealType] || 'residential_sale';

      const txPayload: Record<string, any> = {
        agentId,
        agentDisplayName,
        agentType,
        calculationModel,

        status: closedDate ? 'closed' : 'pending',
        transactionType,
        closingType: toOptStr(intake.closingType),
        dealType,

        address: intake.address,
        clientName: toOptStr(intake.clientName),
        dealSource: toOptStr(intake.dealSource),

        listPrice: intake.listPrice ?? null,
        dealValue: intake.salePrice ? toNum(intake.salePrice) : intake.listPrice ? toNum(intake.listPrice) : null,
        commissionPercent: intake.commissionPercent ?? null,
        transactionFee: intake.transactionFee ?? null,
        earnestMoney: intake.earnestMoney ?? null,

        listingDate: toOptStr(intake.listingDate),
        contractDate: toOptStr(intake.contractDate),
        optionExpiration: toOptStr(intake.optionExpiration),
        inspectionDeadline: toOptStr(intake.inspectionDeadline),
        surveyDeadline: toOptStr(intake.surveyDeadline),
        projectedCloseDate: toOptStr(intake.projectedCloseDate),
        closedDate,

        // Extended dates
        loanApplicationDeadline: toOptStr(intake.loanApplicationDeadline),
        appraisalDeadline: toOptStr(intake.appraisalDeadline),
        titleDeadline: toOptStr(intake.titleDeadline),
        finalLoanCommitmentDeadline: toOptStr(intake.finalLoanCommitmentDeadline),

        // Client contact
        clientEmail: toOptStr(intake.clientEmail),
        clientPhone: toOptStr(intake.clientPhone),
        clientNewAddress: toOptStr(intake.clientNewAddress),
        client2Name: toOptStr(intake.client2Name),
        client2Email: toOptStr(intake.client2Email),
        client2Phone: toOptStr(intake.client2Phone),

        // Buyer contact
        buyerName: toOptStr(intake.buyerName),
        buyerEmail: toOptStr(intake.buyerEmail),
        buyerPhone: toOptStr(intake.buyerPhone),
        buyer2Name: toOptStr(intake.buyer2Name),
        buyer2Email: toOptStr(intake.buyer2Email),
        buyer2Phone: toOptStr(intake.buyer2Phone),

        // Seller contact
        sellerName: toOptStr(intake.sellerName),
        sellerEmail: toOptStr(intake.sellerEmail),
        sellerPhone: toOptStr(intake.sellerPhone),
        seller2Name: toOptStr(intake.seller2Name),
        seller2Email: toOptStr(intake.seller2Email),
        seller2Phone: toOptStr(intake.seller2Phone),

        // Other agent
        otherAgentName: toOptStr(intake.otherAgentName),
        otherAgentEmail: toOptStr(intake.otherAgentEmail),
        otherAgentPhone: toOptStr(intake.otherAgentPhone),
        otherBrokerage: toOptStr(intake.otherBrokerage),

        // Lender
        mortgageCompany: toOptStr(intake.mortgageCompany),
        loanOfficer: toOptStr(intake.loanOfficer),
        loanOfficerEmail: toOptStr(intake.loanOfficerEmail),
        loanOfficerPhone: toOptStr(intake.loanOfficerPhone),
        lenderOffice: toOptStr(intake.lenderOffice),

        // Title
        titleCompany: toOptStr(intake.titleCompany),
        titleOfficer: toOptStr(intake.titleOfficer),
        titleOfficerEmail: toOptStr(intake.titleOfficerEmail),
        titleOfficerPhone: toOptStr(intake.titleOfficerPhone),
        titleAttorney: toOptStr(intake.titleAttorney),
        titleOffice: toOptStr(intake.titleOffice),

        // Compliance / warranty
        warrantyPaidBy: toOptStr(intake.warrantyPaidBy),
        txComplianceFeeAmount: intake.txComplianceFeeAmount ?? null,
        txComplianceFeePaidBy: toOptStr(intake.txComplianceFeePaidBy),
        occupancyDates: toOptStr(intake.occupancyDates),
        shortageAmount: intake.shortageAmount ?? null,
        buyerBringToClosing: intake.buyerBringToClosing ?? null,

        // Commission override metadata
        commissionOverride: !!intake.commissionOverride,
        commissionOverrideBy: intake.commissionOverride ? toOptStr(intake.commissionOverrideBy) : null,
        commissionOverrideAt: intake.commissionOverride ? intake.commissionOverrideAt : null,

        notes: toOptStr(intake.notes),
        additionalComments: toOptStr(intake.additionalComments),

        splitSnapshot,
        creditSnapshot,

        year,
        source: 'tc_form',
        intakeId: id,
        createdAt: now,
        updatedAt: now,
      };

      // Merge co-agent data into payload
      if (pendingCoAgentData) {
        txPayload.hasCoAgent = true;
        txPayload.primaryAgentSplitPercent = pendingPrimarySplitPct;
        txPayload.primaryAgentSideCredit = pendingPrimarySplitPct != null ? pendingPrimarySplitPct / 100 : null;
        txPayload.coAgent = pendingCoAgentData;
      } else {
        txPayload.hasCoAgent = !!intake.hasCoAgent;
      }

      const txRef = await adminDb.collection('transactions').add(txPayload);

      // Mark intake approved
      await docRef.update({
        status: 'approved',
        approvedTransactionId: txRef.id,
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });

      // Rebuild rollups for primary agent
      try {
        const { rebuildAgentRollup } = await import('@/lib/rollups/rebuildAgentRollup');
        await rebuildAgentRollup(adminDb, agentId, year);
        // Also rebuild co-agent rollup if present
        if (pendingCoAgentData?.agentId) {
          await rebuildAgentRollup(adminDb, pendingCoAgentData.agentId, year);
        }
      } catch (rollupErr) {
        console.warn('[TC approve] Rollup rebuild failed (non-fatal):', rollupErr);
      }

      return NextResponse.json({
        ok: true,
        status: 'approved',
        transactionId: txRef.id,
      });
    }

    // ── COMMISSION OVERRIDE ────────────────────────────────────────────────────
    if (action === 'commission_override') {
      // TC/Admin can manually set commission split fields and flag the override
      const overrideFields: Record<string, any> = {
        updatedAt: now,
        commissionOverride: true,
        commissionOverrideBy: decoded.email || decoded.uid,
        commissionOverrideAt: now,
      };
      const financialFields = ['brokerPct', 'brokerGci', 'agentPct', 'agentDollar', 'gci', 'commissionPercent', 'salePrice'];
      for (const field of financialFields) {
        if (field in body) {
          const val = body[field];
          overrideFields[field] = val === '' || val === null ? null : val;
        }
      }
      await docRef.update(overrideFields);
      return NextResponse.json({ ok: true, status: 'commission_override_saved' });
    }

    // ── ARCHIVE (remove from active queue, keep record) ──────────────────────
    if (action === 'archive') {
      await docRef.update({
        status: 'archived',
        archivedAt: now,
        archivedBy: decoded.email || decoded.uid,
        archiveReason: toOptStr(body.archiveReason) || 'Manually archived',
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, status: 'archived' });
    }

    // ── REMOVE (hard-delete from queue — admin only) ─────────────────────────
    if (action === 'remove') {
      await docRef.delete();
      return NextResponse.json({ ok: true, status: 'removed' });
    }

    return jsonError(400, `Unknown action: "${action}". Use: update, approve, reject, in_review, commission_override, archive, remove`);
  } catch (err: any) {
    console.error('[PATCH /api/admin/tc/[id]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
