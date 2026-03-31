// GET + PATCH /api/admin/tc/[id] — admin reads or updates a single TC intake
// Supports: approve/reject/in_review/update actions (transactionIntakes)
// Also supports: checklist workflow, TC assignment, status updates (tcIntakes)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { resolveGCI } from '@/lib/commissions';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
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

// ── GET single intake ───────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

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
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

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
        'closingType', 'dealType', 'address', 'clientName',
        'listPrice', 'salePrice', 'commissionPercent', 'gci',
        'transactionFee', 'earnestMoney', 'brokerPct', 'brokerGci', 'agentPct', 'agentDollar',
        'listingDate', 'contractDate', 'optionExpiration', 'inspectionDeadline',
        'surveyDeadline', 'projectedCloseDate', 'closedDate',
        'dealSource', 'mortgageCompany', 'loanOfficer', 'titleCompany', 'titleOfficer',
        'otherAgentName', 'otherBrokerage', 'notes',
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

      if (rawAgentDollar !== null && rawAgentDollar > 0) {
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
        // ── Live calculation via team resolver ───────────────────────────────
        const commission = rawGci;
        const calc = await resolveTransactionCalculation({ agentId, agentDisplayName, commission });
        splitSnapshot = calc.splitSnapshot as any;
        creditSnapshot = calc.creditSnapshot as any;
        agentType = calc.agentType;
        calculationModel = calc.calculationModel;
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

        mortgageCompany: toOptStr(intake.mortgageCompany),
        loanOfficer: toOptStr(intake.loanOfficer),
        titleCompany: toOptStr(intake.titleCompany),
        titleOfficer: toOptStr(intake.titleOfficer),
        otherAgentName: toOptStr(intake.otherAgentName),
        otherBrokerage: toOptStr(intake.otherBrokerage),

        notes: toOptStr(intake.notes),

        splitSnapshot,
        creditSnapshot,

        year,
        source: 'tc_form',
        intakeId: id,
        createdAt: now,
        updatedAt: now,
      };

      const txRef = await adminDb.collection('transactions').add(txPayload);

      // Mark intake approved
      await docRef.update({
        status: 'approved',
        approvedTransactionId: txRef.id,
        reviewedAt: now,
        reviewedBy: decoded.email,
        updatedAt: now,
      });

      return NextResponse.json({
        ok: true,
        status: 'approved',
        transactionId: txRef.id,
      });
    }

    return jsonError(400, `Unknown action: "${action}". Use: update, approve, reject, in_review`);
  } catch (err: any) {
    console.error('[PATCH /api/admin/tc/[id]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
