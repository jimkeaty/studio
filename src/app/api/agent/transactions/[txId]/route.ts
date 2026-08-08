// PATCH /api/agent/transactions/[txId]
// Allows an agent to update their own active/pending transaction.
// If resubmitToTc=true (status changing to pending), creates a new tcIntakes document.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAllStaffUids, getTcUids, getStaffUidsForAgent } from '@/lib/notifications/getRecipientUids';
import { splitCoAgentTransaction } from '@/lib/transactions/splitCoAgentTransaction';
import { resolveGCI } from '@/lib/commissions';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// Fields an agent is allowed to update on their own transaction
const AGENT_ALLOWED_FIELDS = new Set([
  'status',
  'propertyAddress',
  'salePrice',
  'listPrice',
  'contractDate',
  'closingDate',
  'closedDate',
  'listingDate',
  'listingExpirationDate',
  // Seller
  'sellerName', 'sellerEmail', 'sellerPhone',
  'seller2Name', 'seller2Email', 'seller2Phone',
  'seller3Name', 'seller3Email', 'seller3Phone',
  'seller4Name', 'seller4Email', 'seller4Phone',
  // Buyer
  'buyerName', 'buyerEmail', 'buyerPhone',
  'buyer2Name', 'buyer2Email', 'buyer2Phone',
  'buyer3Name', 'buyer3Email', 'buyer3Phone',
  'buyer4Name', 'buyer4Email', 'buyer4Phone',
  // Other agent
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherAgentBrokerage',
  // Client
  'clientName', 'clientEmail', 'clientPhone', 'clientType',
  'client2Name', 'client2Email', 'client2Phone',
  // Lender
  'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
  'lenderOffice',
  // Title
  'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
  'titleOffice', 'titleAttorney',
  // Key dates
  'optionExpiration', 'inspectionDeadline', 'projectedCloseDate',
  'appraisalDeadline', 'surveyDeadline', 'titleDeadline',
  'finalLoanCommitmentDeadline', 'loanApplicationDeadline',
  // Financial
  'earnestMoney', 'depositHolder', 'depositHolderOther',
  'buyerClosingCostTotal', 'buyerBringToClosing',
  // Commission
  'commissionPercent', 'commissionBasePrice', 'gci', 'transactionFee',
  'sellerCommissionPct', 'buyerCommissionPct',
  'sellerPayingListingAgent', 'sellerPayingBuyerAgent',
  // Additional transaction info
  'warrantyAtClosing', 'warrantyAmount', 'warrantyPaidBy',
  'shortageInCommission', 'shortageAmount',
  'occupancyAgreement', 'occupancyDates',
  'txComplianceFee', 'txComplianceFeeAmount', 'txComplianceFeePaidBy',
  // Referrals
  'hasOutboundReferral', 'outboundReferralRecipient', 'outboundReferralPercent',
  'outboundReferralFee', 'outboundReferralDollar',
  'hasInboundReferral', 'inboundReferral', 'inboundReferralAgentName', 'inboundReferralBrokerage',
  'inboundReferralFeePercent', 'inboundReferralFee', 'inboundReferralEmail', 'inboundReferralPhone',
  'outboundReferral', 'outboundReferralAgentName', 'outboundReferralBrokerage',
  // Buyer inspection
  'inspectionOrdered', 'targetInspectionDate', 'inspectorName',
  'inspectionTypes', 'tcScheduleInspections', 'tcScheduleInspectionsOther',
  // Pre-listing inspection
  'preListingInspectionOrdered', 'preListingTargetInspectionDate', 'preListingInspectorName',
  'preListingInspectionTypes', 'preListingTcScheduleInspections', 'preListingTcScheduleInspectionsOther',
  // Media order
  'mediaRequested', 'mediaTypes', 'mediaRequestedDate', 'mediaNotes',
  // Sign order
  'signOrderRequested', 'signServiceType', 'signInstallDate', 'signOwnerName',
  'signRider', 'signAdditionalOptions', 'signSpecialRequests',
  // ShowingTime
  'showingTimeRequested', 'showingApptType', 'showingNewOrChange',
  'showingApptHandling', 'showingLeadTime', 'showingLeadTimeSuggested',
  'showingMaxApptLength', 'showingApptOverlaps', 'showingNoSameDayAppts',
  'showingVirtualPreference', 'showingShareAgentInfo',
  'showingAccessType', 'showingAccessDoor', 'showingLockboxCode',
  'showingAlarmCode', 'showingDisarmCode', 'showingPasscode', 'showingAlarmNotes',
  'showingAccessNotes', 'showingNotesToAgent', 'showingNotesToStaff',
  'showingCallOrder1Name', 'showingCallOrder1Mobile', 'showingCallOrder1AltPhone',
  'showingCallOrder1Email', 'showingCallOrder1Type', 'showingCallOrder1Confirm', 'showingCallOrder1Notify',
  'showingCallOrder2Name', 'showingCallOrder2Mobile', 'showingCallOrder2AltPhone',
  'showingCallOrder2Email', 'showingCallOrder2Type', 'showingCallOrder2Confirm', 'showingCallOrder2Notify',
  'showingCallOrder3Name', 'showingCallOrder3Mobile', 'showingCallOrder3AltPhone',
  'showingCallOrder3Email', 'showingCallOrder3Type', 'showingCallOrder3Confirm', 'showingCallOrder3Notify',
  // Commission mode & seller paying unknown
  'commissionMode', 'sellerPayingListingAgentUnknown',
  // Inbound referral dollar (missing from whitelist)
  'inboundReferralFeeDollar',
  // Outbound referral fields (normalized names)
  'outboundReferralBrokerName', 'outboundReferralContactName',
  // MLS
  'mlsNumber', 'mlsDescription',
  // Seller 3/4 paying fields
  'seller3PayingListingAgent', 'seller3PayingBuyerAgent',
  'seller4PayingListingAgent', 'seller4PayingBuyerAgent',
  // Buyer 3/4 contacts
  // (already in whitelist above)
  // Commercial fields
  'commercialForSale', 'commercialSalePrice',
  'commercialForLease', 'commercialLeaseMonthly', 'commercialLeasePricePerSqft',
  'commercialLeaseTerm', 'commercialTotalLeaseValue', 'commercialLeaseGci',
  'commercialLeaseCommissionMode', 'commercialLeaseCommissionPct',
  'commercialLeaseCommissionFlat', 'commercialLeaseEffectivePct',
  // ShowingTime missing fields
  'showingNotesToAgentOther', 'showingArmCode', 'showingLeadTimeRequired',
  // Sign order
  'signRiderExt', 'signRequestedDate',
  // Deal source
  'dealSource',
  // Notes
  'notes', 'additionalComments',
  // Documents (Purchase Agreement, Listing Paperwork, etc.)
  'documents',
  // Deal / transaction type — agents must be able to correct a misclassified deal type
  'dealType', 'transactionType',
  // TC flag — agents must be able to toggle "Working with TC" on/off when editing
  'workingWithTc',
  // Inspection row data (per-inspector details from add-transaction form)
  'inspectionRowData',
  // Staging consult fields
  'stagingConsultRequested', 'stagingServiceType', 'stagingConsultationDate',
  'stagingConsultationTime', 'stagingStagerName', 'stagingStagerEmail',
  'stagingStagerPhone', 'stagingNotes', 'stagingTcSchedule',
  // ShowingTime lockbox/alarm fields missing from earlier whitelist
  'showingLockboxType', 'showingLockboxLocation',
]);

// Statuses an agent is allowed to set
const AGENT_ALLOWED_STATUSES = new Set(['active', 'coming_soon', 'temp_off_market', 'pending', 'closed', 'cancelled', 'canceled', 'expired']);

// Listing-specific status changes that always trigger a Staff Queue notification
const LISTING_STATUS_TRIGGERS = new Set(['active', 'temp_off_market', 'pending', 'closed', 'cancelled', 'canceled', 'expired', 'coming_soon']);

// For buyer/referral transactions, only 'closed' triggers a Staff Queue notification
const BUYER_STATUS_TRIGGERS = new Set(['closed']);

// Closing types that are considered "listing" transactions
const LISTING_CLOSING_TYPES = new Set(['listing', 'dual']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  try {
    const { txId } = await params;
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!txId) return jsonError(400, 'Missing transaction ID');

    // Fetch the existing transaction
    const txRef = adminDb.collection('transactions').doc(txId);
    const txSnap = await txRef.get();
    if (!txSnap.exists) return jsonError(404, 'Transaction not found');
    const txData = txSnap.data() || {};

    // Block agents from editing closed transactions (server-side enforcement)
    // Admins and staff use a different route and are not subject to this restriction.
    const isAdminCheck = await isAdminLike(uid);
    if (!isAdminCheck && txData.status === 'closed') {
      return jsonError(403, 'Closed transactions cannot be edited by agents. Contact your admin or staff if a correction is needed.');
    }

    // Verify ownership — agent can only edit their own transactions
    // Team leaders can also edit any transaction belonging to their team.
    // Admins can edit any transaction.
    const isAdmin = isAdminCheck; // reuse the check done above
    if (!isAdmin) {
      // Resolve all possible agentId values for this user.
      // The transaction's agentId field may be stored as:
      //   (a) the Firebase UID directly,
      //   (b) the agentProfiles document ID (slug),
      //   (c) a custom agentId field value.
      // We collect ALL of these into ownIds so any match grants access.
      const ownIds = new Set<string>([uid]);
      let callerTeamId: string | null = null;
      try {
        // Strategy 1: direct doc lookup by Firebase UID
        const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
        if (byDocId.exists) {
          const d = byDocId.data() || {};
          if (d.agentId) ownIds.add(String(d.agentId));
          if (d.firebaseUid) ownIds.add(String(d.firebaseUid));
          ownIds.add(byDocId.id); // the doc ID itself is a valid agentId
          if (d.teamRole === 'leader' && d.primaryTeamId) callerTeamId = String(d.primaryTeamId);
        }
        // Strategy 2: agentId slug field matches Firebase UID
        const byField = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
        if (!byField.empty) {
          ownIds.add(byField.docs[0].id);
          const fd = byField.docs[0].data() || {};
          if (fd.agentId) ownIds.add(String(fd.agentId));
          if (fd.firebaseUid) ownIds.add(String(fd.firebaseUid));
          if (!callerTeamId && fd.teamRole === 'leader' && fd.primaryTeamId) callerTeamId = String(fd.primaryTeamId);
        }
        // Strategy 3: firebaseUid field matches Firebase UID
        const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
        if (!byFbUid.empty) {
          const fd = byFbUid.docs[0].data() || {};
          ownIds.add(byFbUid.docs[0].id); // doc ID is a valid agentId
          if (fd.agentId) ownIds.add(String(fd.agentId));
          if (fd.firebaseUid) ownIds.add(String(fd.firebaseUid));
          if (!callerTeamId && fd.teamRole === 'leader' && fd.primaryTeamId) callerTeamId = String(fd.primaryTeamId);
        }
        // Strategy 4: the transaction itself may store agentId as the Firebase UID
        // (transactions submitted directly by the agent before profile normalization).
        // If the transaction's agentId matches the caller's Firebase UID, that is sufficient.
        // This is handled implicitly because uid is already in ownIds from initialization.
      } catch (_) {}

      const txAgentId = String(txData.agentId || '');
      const txTeamId = String(txData.splitSnapshot?.primaryTeamId || txData.primaryTeamId || '');

      // Check flat co-agent fields (coAgent1Id, coAgent2Id, coAgent3Id) and legacy coAgent.agentId
      const isCoAgentTx =
        (txData.coAgent1Id && ownIds.has(String(txData.coAgent1Id))) ||
        (txData.coAgent2Id && ownIds.has(String(txData.coAgent2Id))) ||
        (txData.coAgent3Id && ownIds.has(String(txData.coAgent3Id))) ||
        // Legacy nested co-agent schema: coAgent.agentId
        (txData.coAgent?.agentId && ownIds.has(String(txData.coAgent.agentId)));

      // Allow if: (a) it's the agent's own transaction, OR
      //           (b) the caller is a co-agent on this transaction, OR
      //           (c) the caller is a team leader and the transaction belongs to their team
      const isOwnTx = ownIds.has(txAgentId) || !!isCoAgentTx;
      const isTeamLeaderEdit = !!(callerTeamId && (txTeamId === callerTeamId || (() => {
        // Also allow if the transaction's agent is a member of the caller's team
        return false; // resolved below via async check if needed
      })()));

      if (!isOwnTx && !isTeamLeaderEdit) {
        // Last check: is the transaction's agent a member of the caller's team?
        let isTeamMember = false;
        if (callerTeamId && txAgentId) {
          try {
            const memberSnap = await adminDb.collection('agentProfiles')
              .where('primaryTeamId', '==', callerTeamId)
              .where('agentId', '==', txAgentId)
              .limit(1).get();
            if (!memberSnap.empty) isTeamMember = true;
            if (!isTeamMember) {
              // Also check by doc ID
              const memberByDocSnap = await adminDb.collection('agentProfiles').doc(txAgentId).get();
              if (memberByDocSnap.exists && memberByDocSnap.data()?.primaryTeamId === callerTeamId) isTeamMember = true;
            }
            if (!isTeamMember) {
              // Also check by firebaseUid
              const memberByFbSnap = await adminDb.collection('agentProfiles')
                .where('primaryTeamId', '==', callerTeamId)
                .where('firebaseUid', '==', txAgentId)
                .limit(1).get();
              if (!memberByFbSnap.empty) isTeamMember = true;
            }
          } catch (_) {}
        }
        if (!isTeamMember) {
          return jsonError(403, 'You do not have permission to edit this transaction');
        }
      }
    }

    const body = await req.json();
    const { resubmitToTc, notifyPendingContract, _replaceDocuments, ...rawUpdates } = body;

    // Validate status
    if (rawUpdates.status && !AGENT_ALLOWED_STATUSES.has(rawUpdates.status)) {
      return jsonError(400, `Agents cannot set status to "${rawUpdates.status}"`);
    }

    // Filter to only allowed fields
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawUpdates)) {
      if (AGENT_ALLOWED_FIELDS.has(k)) {
        updates[k] = v;
      }
    }
    updates.updatedAt = new Date().toISOString();
    updates.lastUpdatedBy = uid;

    // Keep dealType and transactionType in sync — both fields are used in different parts
    // of the codebase; updating one must always update the other.
    if (updates.dealType !== undefined) {
      updates.transactionType = updates.dealType;
    } else if (updates.transactionType !== undefined) {
      updates.dealType = updates.transactionType;
    }

    // ── Auto-calculate GCI and splitSnapshot whenever commission-relevant fields change ──
    // Triggered when: salePrice, listPrice, commissionPercent, commissionBasePrice, gci, or status changes.
    // Status-aware base price:
    //   - Active / Coming Soon / Temp Off Market → listPrice is the fallback base
    //   - Pending / Closed / any other → salePrice is the base
    // When going active→pending and salePrice is now set, auto-update commissionBasePrice.
    const commissionFieldsChanged = (
      updates.salePrice !== undefined ||
      updates.listPrice !== undefined ||
      updates.commissionPercent !== undefined ||
      updates.commissionBasePrice !== undefined ||
      updates.gci !== undefined ||
      (updates.status !== undefined && updates.status !== txData.status)
    );

    // Auto-set commissionBasePrice to salePrice when going pending (if not manually set)
    const isGoingPending = updates.status === 'pending' && txData.status !== 'pending';
    if (isGoingPending) {
      const sp = Number(updates.salePrice ?? txData.salePrice) || 0;
      const cbp = Number(updates.commissionBasePrice ?? txData.commissionBasePrice) || 0;
      if (sp > 0 && cbp === 0) {
        updates.commissionBasePrice = sp;
      }
    }

    if (commissionFieldsChanged) {
      try {
        const mergedForCalc = { ...txData, ...updates };
        const effectiveStatus = String(mergedForCalc.status ?? txData.status ?? '');
        const rawGci = resolveGCI({
          commissionBasePrice: mergedForCalc.commissionBasePrice ?? null,
          salePrice: mergedForCalc.salePrice ?? null,
          listPrice: mergedForCalc.listPrice ?? null,
          status: effectiveStatus,
          commissionPercent: mergedForCalc.commissionPercent ?? null,
          gci: mergedForCalc.gci ?? null,
        });
        // Tag the GCI as estimated when it's based on list price (active listing, no sale price)
        const { isEstimatedCommission } = await import('@/lib/commissions');
        updates.commissionIsEstimated = isEstimatedCommission({
          commissionBasePrice: mergedForCalc.commissionBasePrice ?? null,
          salePrice: mergedForCalc.salePrice ?? null,
          status: effectiveStatus,
        });
        if (rawGci > 0) {
          // Store the computed GCI on the transaction so the ledger can display it
          updates.gci = rawGci;
          // Resolve the full split snapshot (agent tier, broker split, etc.)
          const agentIdForCalc = String(txData.agentId || uid);
          const agentDisplayNameForCalc = String(txData.agentDisplayName || '');
          const txDate = mergedForCalc.closedDate || mergedForCalc.contractDate || null;
          try {
            const calc = await resolveTransactionCalculation({
              agentId: agentIdForCalc,
              agentDisplayName: agentDisplayNameForCalc,
              commission: rawGci,
              transactionDate: txDate,
            });
            updates.splitSnapshot = calc.splitSnapshot;
            updates.creditSnapshot = calc.creditSnapshot;
            // Store top-level convenience fields so the ledger can sort/filter by them
            updates.grossCommission = calc.splitSnapshot.grossCommission ?? rawGci;
            updates.agentNetCommission = calc.splitSnapshot.agentNetCommission ?? null;
            updates.companyRetained = calc.splitSnapshot.companyRetained ?? null;
          } catch (calcErr: any) {
            // Non-fatal: commission profile may not exist yet — save GCI but skip split
            console.warn('[agent PATCH] resolveTransactionCalculation failed (non-fatal):', calcErr?.message);
          }
        }
      } catch (gciErr: any) {
        console.warn('[agent PATCH] GCI calculation failed (non-fatal):', gciErr?.message);
      }
    }

    // ── Recalculate year field when closedDate changes ──
    // The year field drives the transaction ledger year filter and leaderboard rollups.
    if (updates.closedDate) {
      try {
        const yr = new Date(updates.closedDate).getFullYear();
        if (yr >= 2000 && yr <= 2100) updates.year = yr;
      } catch (_) {}
    }

    // ── Documents: merge (append) new documents instead of replacing the array ──
    // When _replaceDocuments=true (delete/archive), use the provided array as-is.
    // Otherwise append new documents to existing ones (never lose existing docs).
    if (Array.isArray(updates.documents)) {
      if (!_replaceDocuments) {
        // Append mode: merge new docs with existing, deduplicating by storagePath
        const existingDocs: any[] = Array.isArray(txData.documents) ? txData.documents : [];
        const existingPaths = new Set(existingDocs.map((d: any) => d.storagePath).filter(Boolean));
        const newDocs = (updates.documents as any[]).filter((d: any) => !existingPaths.has(d.storagePath));
        updates.documents = [...existingDocs, ...newDocs];
      }
      // else: _replaceDocuments=true — use the provided array as-is (for delete/archive)
    }
    // Save updates to the transaction document
    await txRef.update(updates);

    // ── TC Queue sync: if this transaction has a linked tcIntakes record, mirror key field
    //    changes back so the TC queue always shows current data without requiring a re-approval.
    //    Only sync non-workflow fields (never overwrite TC queue status, checklist, etc.).
    void (async () => {
      try {
        const linkedIntakeSnap = await adminDb
          .collection('tcIntakes')
          .where('approvedTransactionId', '==', txId)
          .limit(1)
          .get();
        if (!linkedIntakeSnap.empty) {
          const TC_SYNC_FIELDS = new Set([
            'address', 'propertyAddress', 'listPrice', 'salePrice', 'commissionPercent',
            'gci', 'transactionFee', 'earnestMoney', 'closingType', 'dealType',
            'listingDate', 'contractDate', 'closingDate', 'closedDate', 'optionExpiration',
            'inspectionDeadline', 'projectedCloseDate',
            'sellerName', 'sellerEmail', 'sellerPhone',
            'seller2Name', 'seller2Email', 'seller2Phone',
            'buyerName', 'buyerEmail', 'buyerPhone',
            'buyer2Name', 'buyer2Email', 'buyer2Phone',
            'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherAgentBrokerage',
            'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
            'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
            'inspectionTypes', 'inspectorName', 'targetInspectionDate', 'tcScheduleInspections',
            'mediaTypes', 'mediaRequestedDate', 'mediaOrderNotes',
            'notes', 'additionalComments', 'documents',
            'status',
          ]);
          const intakeSyncUpdates: Record<string, any> = { updatedAt: new Date().toISOString() };
          for (const [k, v] of Object.entries(updates)) {
            if (TC_SYNC_FIELDS.has(k)) intakeSyncUpdates[k] = v;
          }
          if (Object.keys(intakeSyncUpdates).length > 1) {
            await linkedIntakeSnap.docs[0].ref.update(intakeSyncUpdates);
          }
        }
      } catch (syncErr) {
        console.error('[agent PATCH] tcIntakes sync error (non-fatal):', syncErr);
      }
    })();

    // ── Staff Queue: notify staff based on transaction type and status change ──
    // Rules:
    //   - Listing/dual transactions: notify on any MLS status change
    //     (active, pending, coming_soon, temp_off_market, canceled, expired, closed)
    //   - Buyer/referral transactions: notify ONLY when status changes to 'closed'
    const previousStatus = txData.status;
    const newStatus = updates.status;
    const txClosingType = String(txData.closingType || txData.transactionType || '');
    const isListingTx = LISTING_CLOSING_TYPES.has(txClosingType);
    const triggerSet = isListingTx ? LISTING_STATUS_TRIGGERS : BUYER_STATUS_TRIGGERS;
    const shouldNotifyStaff = newStatus && newStatus !== previousStatus && triggerSet.has(newStatus);

    if (shouldNotifyStaff) {
      const agentProfile = await adminDb.collection('agentProfiles').doc(txData.agentId || uid).get().catch(() => null);
      const agentName = agentProfile?.data()?.displayName || txData.agentDisplayName || 'Unknown Agent';
      const staffQueueItem: Record<string, any> = {
        transactionId: txId,
        tcIntakeId: null,
        agentId: txData.agentId || uid,
        agentName,
        submittedBy: uid,
        submittedByName: agentName,
        actionType: newStatus === 'closed' && !isListingTx ? 'closed_buyer' : 'status_change',
        closingType: txClosingType || null,
        previousStatus,
        newStatus,
        notes: updates.notes || txData.notes || null,
        tcWorking: !!txData.workingWithTc,
        status: 'pending_review',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        staffNotes: null,
        address: txData.propertyAddress || txData.address || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await adminDb.collection('staffQueue').add(staffQueueItem);
    }

    // If agent is moving from active → pending AND is working with TC, re-submit to TC queue.
    // Any transaction type (buyer, listing, dual) with workingWithTc=true goes to the TC queue.
    // Transactions without TC (workingWithTc=false) never create a tcIntake on status change.
    // IMPORTANT: check updates.workingWithTc first (the value being saved in this request) because
    // the agent may be toggling TC on at the same time as changing the status. Fall back to the
    // existing txData value if the field was not included in this update.
    const effectiveWorkingWithTc =
      updates.workingWithTc !== undefined ? !!updates.workingWithTc : !!txData.workingWithTc;
    // Auto-resubmit to TC queue when:
    //   1. Agent explicitly sends resubmitToTc=true, OR
    //   2. Status is changing to 'pending' (or 'under_contract') AND workingWithTc=true
    //      (this handles the case where the agent changes status from the detail page
    //       without explicitly clicking a "resubmit" button)
    const isStatusChangeToPending = !!(newStatus && ['pending', 'under_contract'].includes(newStatus) && newStatus !== previousStatus);
    const shouldResubmitToTc = effectiveWorkingWithTc && (!!resubmitToTc || isStatusChangeToPending);
    if (shouldResubmitToTc) {
      const mergedData = { ...txData, ...updates };
      const intake: Record<string, any> = {
        // Workflow status (TC queue status, not listing status)
        status: 'submitted',
        listingStatus: 'pending',
        submittedAt: new Date().toISOString(),
        submittedBy: uid,
        isResubmission: true,
        originalTransactionId: txId,

        // Agent info
        agentId: mergedData.agentId,
        agentDisplayName: mergedData.agentDisplayName,

        // Property — normalize address to both fields so TC queue and approval route both work
        address: mergedData.address || mergedData.propertyAddress || null,
        propertyAddress: mergedData.propertyAddress || mergedData.address || null,
        closingType: mergedData.closingType ?? null,
        dealType: mergedData.dealType ?? null,
        dealSource: mergedData.dealSource ?? null,
        transactionType: mergedData.transactionType ?? null,
        listPrice: mergedData.listPrice ?? null,
        salePrice: mergedData.salePrice ?? null,
        commissionPercent: mergedData.commissionPercent ?? null,
        gci: mergedData.gci ?? null,
        transactionFee: mergedData.transactionFee ?? null,
        earnestMoney: mergedData.earnestMoney ?? null,

        // Dates
        listingDate: mergedData.listingDate ?? null,
        contractDate: mergedData.contractDate ?? null,
        closingDate: mergedData.closingDate ?? mergedData.closedDate ?? null,
        closedDate: mergedData.closedDate ?? mergedData.closingDate ?? null,
        optionExpiration: mergedData.optionExpiration ?? null,
        inspectionDeadline: mergedData.inspectionDeadline ?? null,
        projectedCloseDate: mergedData.projectedCloseDate ?? null,

        // Client contact
        clientType: mergedData.clientType ?? null,
        clientName: mergedData.clientName ?? null,
        clientEmail: mergedData.clientEmail ?? null,
        clientPhone: mergedData.clientPhone ?? null,

        // Seller
        sellerName: mergedData.sellerName ?? null,
        sellerEmail: mergedData.sellerEmail ?? null,
        sellerPhone: mergedData.sellerPhone ?? null,
        seller2Name: mergedData.seller2Name ?? null,
        seller2Email: mergedData.seller2Email ?? null,
        seller2Phone: mergedData.seller2Phone ?? null,
        seller3Name: mergedData.seller3Name ?? null,
        seller3Email: mergedData.seller3Email ?? null,
        seller3Phone: mergedData.seller3Phone ?? null,
        seller4Name: mergedData.seller4Name ?? null,
        seller4Email: mergedData.seller4Email ?? null,
        seller4Phone: mergedData.seller4Phone ?? null,

        // Buyer
        buyerName: mergedData.buyerName ?? null,
        buyerEmail: mergedData.buyerEmail ?? null,
        buyerPhone: mergedData.buyerPhone ?? null,
        buyer2Name: mergedData.buyer2Name ?? null,
        buyer2Email: mergedData.buyer2Email ?? null,
        buyer2Phone: mergedData.buyer2Phone ?? null,
        buyer3Name: mergedData.buyer3Name ?? null,
        buyer3Email: mergedData.buyer3Email ?? null,
        buyer3Phone: mergedData.buyer3Phone ?? null,
        buyer4Name: mergedData.buyer4Name ?? null,
        buyer4Email: mergedData.buyer4Email ?? null,
        buyer4Phone: mergedData.buyer4Phone ?? null,

        // Other agent
        otherAgentName: mergedData.otherAgentName ?? null,
        otherAgentEmail: mergedData.otherAgentEmail ?? null,
        otherAgentPhone: mergedData.otherAgentPhone ?? null,
        otherAgentBrokerage: mergedData.otherAgentBrokerage ?? null,

        // Lender
        mortgageCompany: mergedData.mortgageCompany ?? null,
        loanOfficer: mergedData.loanOfficer ?? null,
        loanOfficerEmail: mergedData.loanOfficerEmail ?? null,
        loanOfficerPhone: mergedData.loanOfficerPhone ?? null,

        // Title
        titleCompany: mergedData.titleCompany ?? null,
        titleOfficer: mergedData.titleOfficer ?? null,
        titleOfficerEmail: mergedData.titleOfficerEmail ?? null,
        titleOfficerPhone: mergedData.titleOfficerPhone ?? null,

        // Commission
        sellerCommissionPct: mergedData.sellerCommissionPct ?? null,
        buyerCommissionPct: mergedData.buyerCommissionPct ?? null,

        // Notes
        notes: mergedData.notes ?? null,
        additionalComments: mergedData.additionalComments ?? null,

        // Documents
        documents: Array.isArray(mergedData.documents) ? mergedData.documents : [],
      };

      // IMPORTANT: set approvedTransactionId so that if a TC coordinator approves
      // this resubmission, the TC approval route UPDATES the existing transaction
      // instead of creating a brand-new duplicate transaction.
      intake.approvedTransactionId = txId;

      await adminDb.collection('tcIntakes').add(intake);
    }

    // ── Notifications ────────────────────────────────────────────────────────
    void (async () => {
      try {
        const txAddress = String(txData.propertyAddress || txData.address || 'your transaction');
        const agentName = String(txData.agentDisplayName || 'Agent');
        const agentUid = txData.agentId || uid;

        // ── Check if this transaction has a linked approved TC intake ──────────
        // Once a TC has approved a file, they stay in the loop for ALL subsequent
        // changes — regardless of the workingWithTc flag on the transaction.
        let hasLinkedTcIntake = false;
        try {
          const linkedIntakeCheck = await adminDb
            .collection('tcIntakes')
            .where('approvedTransactionId', '==', txId)
            .limit(1)
            .get();
          hasLinkedTcIntake = !linkedIntakeCheck.empty;
        } catch {
          // Non-fatal — fall back to workingWithTc flag only
        }
        const isTcManaged = effectiveWorkingWithTc || hasLinkedTcIntake;

        // ── Status change notifications ─────────────────────────────────────────
        // Rules:
        //   STAFF: always notified on any listing status change, regardless of TC
        //   TC:    notified on any status change when workingWithTc=true OR a TC
        //          has already approved an intake for this transaction
        //   Both get specific rich messages for key transitions (active→pending, etc.)
        const isStatusChange = !!(newStatus && newStatus !== previousStatus);

        if (isStatusChange) {
          // Human-readable status labels
          const STATUS_LABELS: Record<string, string> = {
            active: 'Active',
            pending: 'Pending',
            closed: 'Closed',
            canceled: 'Canceled',
            coming_soon: 'Coming Soon',
            temp_off_market: 'Temporarily Off Market',
            back_on_market: 'Back on Market',
            expired: 'Expired',
          };
          const prevLabel = STATUS_LABELS[previousStatus ?? ''] ?? previousStatus ?? 'Unknown';
          const newLabel = STATUS_LABELS[newStatus] ?? newStatus;

          const isComingSoon = newStatus === 'coming_soon';
          const isComingSoonToPending = newStatus === 'pending' && previousStatus === 'coming_soon';
          const isActiveToPending = newStatus === 'pending' && previousStatus !== 'pending';
          const isPendingToClosed = newStatus === 'closed' && previousStatus === 'pending';
          const isPendingToCanceled = newStatus === 'canceled' && previousStatus === 'pending';
          const isPendingToBackOnMarket = newStatus === 'back_on_market' && previousStatus === 'pending';

          // ── Staff notifications (always fire for listing status changes) ──────
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            let staffTitle = 'Transaction Status Updated';
            let staffBody = `${agentName} changed ${txAddress} from ${prevLabel} to ${newLabel}.`;
            let staffUrl = '/dashboard/admin/staff-queue';

            if (isComingSoon) {
              staffTitle = 'New Coming Soon Listing — Add to MLS as Coming Soon';
              staffBody = `${agentName} added ${txAddress} as Coming Soon. Please add to MLS with Coming Soon status. Auto-activates in 30 days if not changed.`;
            } else if (isComingSoonToPending) {
              staffTitle = 'Coming Soon Listing Under Contract — Action Required';
              staffBody = `${agentName}'s Coming Soon listing at ${txAddress} is now Pending. Contract details submitted. Please update MLS.`;
            } else if (isActiveToPending) {
              staffTitle = 'Listing Under Contract — Action Required';
              staffBody = `${agentName}'s listing at ${txAddress} is now Pending. Contract details submitted. Please update MLS.`;
            } else if (isPendingToClosed) {
              staffTitle = 'Listing Closed';
              staffBody = `${agentName}'s listing at ${txAddress} has been marked Closed.`;
            } else if (isPendingToCanceled) {
              staffTitle = 'Listing Canceled';
              staffBody = `${agentName}'s listing at ${txAddress} has been marked Canceled.`;
            } else if (isPendingToBackOnMarket) {
              staffTitle = 'Listing Back on Market';
              staffBody = `${agentName}'s listing at ${txAddress} is back on market (was Pending).`;
            }

            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: staffTitle,
              body: staffBody,
              url: staffUrl,
              data: { transactionId: txId },
            });
          }

          // ── TC notifications (when TC-managed: workingWithTc=true OR linked intake) ──
          if (isTcManaged) {
            // Resolve TC recipients:
            // 1. Try agentProfiles by Firebase UID (uid) — most reliable
            // 2. Try agentProfiles by agentId slug (agentUid from txData.agentId)
            // 3. Fall back to all TC coordinators
            let tcRecipients = await getStaffUidsForAgent(adminDb, uid);
            if (tcRecipients.length === 0 && agentUid !== uid) {
              tcRecipients = await getStaffUidsForAgent(adminDb, agentUid);
            }
            if (tcRecipients.length === 0) {
              // Hard fallback: notify all TC coordinators
              const { getTcUids } = await import('@/lib/notifications/getRecipientUids');
              tcRecipients = await getTcUids(adminDb);
            }
            if (tcRecipients.length > 0) {
              let tcTitle = 'Transaction Status Updated';
              let tcBody = `${agentName} changed ${txAddress} from ${prevLabel} to ${newLabel}.`;
              let tcUrl = '/dashboard/admin/tc';

              if (isComingSoon) {
                tcTitle = 'New Coming Soon Listing — Add to MLS as Coming Soon';
                tcBody = `${agentName} added ${txAddress} as Coming Soon. Please add to MLS with Coming Soon status.`;
              } else if (isComingSoonToPending) {
                tcTitle = 'Coming Soon Listing Under Contract — TC Review';
                tcBody = `${agentName}'s Coming Soon listing at ${txAddress} is now Pending. Contract details submitted for your review.`;
              } else if (isActiveToPending) {
                tcTitle = 'Listing Under Contract — TC Review';
                tcBody = `${agentName}'s listing at ${txAddress} is now Pending. Contract details submitted for your review.`;
              } else if (isPendingToClosed) {
                tcTitle = 'Transaction Closed';
                tcBody = `${agentName}'s transaction at ${txAddress} has been marked Closed.`;
              } else if (isPendingToCanceled) {
                tcTitle = 'Transaction Canceled';
                tcBody = `${agentName}'s transaction at ${txAddress} has been marked Canceled. Please update your records.`;
              } else if (isPendingToBackOnMarket) {
                tcTitle = 'Transaction Back on Market';
                tcBody = `${agentName}'s transaction at ${txAddress} is back on market (was Pending). Please update MLS.`;
              }

              await sendNotification(adminDb, {
                type: isActiveToPending ? 'tc_new_intake' : 'tx_status_change',
                recipientUids: tcRecipients,
                title: tcTitle,
                body: tcBody,
                url: tcUrl,
                data: { transactionId: txId },
              });
            }
          }

          // ── Notify agent on every status change ───────────────────────────────
          let agentTitle = 'Transaction Status Updated';
          let agentBody = `${txAddress} has been updated from ${prevLabel} to ${newLabel}.`;
          if (isActiveToPending) {
            agentTitle = 'Listing Under Contract';
            agentBody = `${txAddress} has been marked as Pending. Contract details have been submitted for staff review.`;
          } else if (isPendingToClosed) {
            agentTitle = 'Transaction Closed';
            agentBody = `${txAddress} has been marked as Closed.`;
          } else if (isPendingToCanceled) {
            agentTitle = 'Transaction Canceled';
            agentBody = `${txAddress} has been marked as Canceled.`;
          } else if (isPendingToBackOnMarket) {
            agentTitle = 'Listing Back on Market';
            agentBody = `${txAddress} is back on market.`;
          }
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: [agentUid],
            title: agentTitle,
            body: agentBody,
            url: '/dashboard/my-transactions',
            data: { transactionId: txId },
          });
        }

        // ── TC resubmission notification ─────────────────────────────────────
        if (shouldResubmitToTc) {
          const tcUids = await getTcUids(adminDb);
          if (tcUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: tcUids,
              title: 'Transaction Resubmitted to TC',
              body: `${agentName} resubmitted ${txAddress} for TC review (status: pending).`,
              url: '/dashboard/admin/tc',
              data: { transactionId: txId },
            });
          }
        }

        // ── Document uploaded: notify staff always + TC when TC-managed ────────────
        if (updates.documents !== undefined && !_replaceDocuments) {
          const prevDocs: any[] = Array.isArray(txData.documents) ? txData.documents : [];
          const newDocs: any[] = Array.isArray(updates.documents) ? updates.documents : [];
          if (newDocs.length > prevDocs.length) {
            const addedCount = newDocs.length - prevDocs.length;
            const docBody = `${agentName} uploaded ${addedCount === 1 ? 'a document' : `${addedCount} documents`} to ${txAddress}.`;
            // Staff always notified on document uploads
            const staffUids = await getAllStaffUids(adminDb);
            if (staffUids.length > 0) {
              await sendNotification(adminDb, {
                type: 'tc_document_uploaded',
                recipientUids: staffUids,
                title: 'New Document Uploaded',
                body: docBody,
                url: '/dashboard/admin/staff-queue',
                data: { transactionId: txId },
              });
            }
            // TC also notified when TC-managed
            if (isTcManaged) {
              const tcUids = await getTcUids(adminDb);
              // Exclude UIDs already notified as staff to avoid duplicates
              const staffSet = new Set(staffUids);
              const tcOnly = tcUids.filter(u => !staffSet.has(u));
              if (tcOnly.length > 0) {
                await sendNotification(adminDb, {
                  type: 'tc_document_uploaded',
                  recipientUids: tcOnly,
                  title: 'New Document Uploaded',
                  body: docBody,
                  url: '/dashboard/admin/tc',
                  data: { transactionId: txId },
                });
              }
            }
          }
        }

        // ── TC: meaningful field change ──────────────────────────────────────
        const TC_WATCHED_FIELDS = new Set([
          'propertyAddress', 'address',
          'salePrice', 'listPrice', 'commissionPercent', 'commissionBasePrice', 'gci',
          'transactionFee', 'sellerCommissionPct', 'buyerCommissionPct',
          'closingDate', 'closedDate', 'contractDate', 'listingDate',
          'optionExpiration', 'inspectionDeadline', 'projectedCloseDate',
          'clientName', 'clientEmail', 'clientPhone',
          'sellerName', 'sellerEmail', 'sellerPhone',
          'buyerName', 'buyerEmail', 'buyerPhone',
          'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
          'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
          'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherAgentBrokerage',
          'notes', 'additionalComments',
          'dealType', 'transactionType', 'closingType',
        ]);
        // Human-readable labels for watched fields
        const FIELD_LABELS: Record<string, string> = {
          propertyAddress: 'Property Address', address: 'Property Address',
          salePrice: 'Sale Price', listPrice: 'List Price',
          commissionPercent: 'Commission %', commissionBasePrice: 'Commission Base Price',
          gci: 'GCI', transactionFee: 'Transaction Fee',
          sellerCommissionPct: 'Seller Commission %', buyerCommissionPct: 'Buyer Commission %',
          closingDate: 'Closing Date', closedDate: 'Closed Date',
          contractDate: 'Contract Date', listingDate: 'Listing Date',
          optionExpiration: 'Option Expiration', inspectionDeadline: 'Inspection Deadline',
          projectedCloseDate: 'Projected Close Date',
          clientName: 'Client Name', clientEmail: 'Client Email', clientPhone: 'Client Phone',
          sellerName: 'Seller Name', sellerEmail: 'Seller Email', sellerPhone: 'Seller Phone',
          buyerName: 'Buyer Name', buyerEmail: 'Buyer Email', buyerPhone: 'Buyer Phone',
          mortgageCompany: 'Mortgage Company', loanOfficer: 'Loan Officer',
          loanOfficerEmail: 'Loan Officer Email', loanOfficerPhone: 'Loan Officer Phone',
          titleCompany: 'Title Company', titleOfficer: 'Title Officer',
          titleOfficerEmail: 'Title Officer Email', titleOfficerPhone: 'Title Officer Phone',
          otherAgentName: 'Co-Agent Name', otherAgentEmail: 'Co-Agent Email',
          otherAgentPhone: 'Co-Agent Phone', otherAgentBrokerage: 'Co-Agent Brokerage',
          notes: 'Notes', additionalComments: 'Additional Comments',
          dealType: 'Deal Type', transactionType: 'Transaction Type', closingType: 'Closing Type',
        };
        const watchedFieldsChanged = Object.keys(updates).some(k => TC_WATCHED_FIELDS.has(k));
        // Only fire when no status change and no document change (those are handled above)
        if (
          watchedFieldsChanged &&
          !isStatusChange &&
          updates.documents === undefined
        ) {
          const changedKeys = Object.keys(updates).filter(k => TC_WATCHED_FIELDS.has(k));
          const changedLabels = changedKeys
            .slice(0, 4)
            .map(k => FIELD_LABELS[k] || k)
            .join(', ');
          const moreCount = changedKeys.length - 4;
          const fieldBody = `${agentName} updated the following on ${txAddress}: ${changedLabels}${moreCount > 0 ? ` and ${moreCount} more field${moreCount > 1 ? 's' : ''}` : ''}.`;
          // Staff always notified on field changes
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_field_update',
              recipientUids: staffUids,
              title: 'Transaction Details Updated',
              body: fieldBody,
              url: '/dashboard/admin/staff-queue',
              data: { transactionId: txId },
            });
          }
          // TC also notified when TC-managed
          if (isTcManaged) {
            const tcUids = await getTcUids(adminDb);
            const staffSet = new Set(staffUids);
            const tcOnly = tcUids.filter(u => !staffSet.has(u));
            if (tcOnly.length > 0) {
              await sendNotification(adminDb, {
                type: 'tc_field_update',
                recipientUids: tcOnly,
                title: 'Transaction Details Updated',
                body: fieldBody,
                url: '/dashboard/admin/tc',
                data: { transactionId: txId },
              });
            }
          }
        }
      } catch (notifErr) {
        console.error('[agent PATCH] notification error:', notifErr);
      }
    })();

    // ── Co-agent split on close ─────────────────────────────────────────────
    // If this transaction has a co-agent and is now being marked closed,
    // split it into two individual transactions (one per agent) and delete the original.
    if (updates.status === 'closed' && previousStatus !== 'closed') {
      const freshSnap = await txRef.get();
      const freshData = freshSnap.data() as any;
      if (freshData?.hasCoAgent && freshData?.coAgent?.agentId && freshData?.source !== 'co_agent_split') {
        try {
          const splitResult = await splitCoAgentTransaction(txId);
          if (splitResult) {
            return NextResponse.json({
              ok: true,
              split: true,
              primaryTransactionId: splitResult.primaryTransactionId,
              coAgentTransactionId: splitResult.coAgentTransactionId,
            });
          }
        } catch (splitErr: any) {
          console.warn('[api/agent/transactions] Co-agent split failed (non-fatal):', splitErr?.message);
        }
      }
    }

    // ── Rebuild leaderboard rollup when transaction is closed or commission changes on a closed tx ──
    // This keeps the agent's YTD GCI, volume, and tier progression in sync immediately
    // without waiting for a nightly job, matching what TC approval does.
    const isNowClosed = updates.status === 'closed';
    const wasAlreadyClosed = txData.status === 'closed' && commissionFieldsChanged;
    if (isNowClosed || wasAlreadyClosed) {
      void (async () => {
        try {
          const { rebuildAgentRollup } = await import('@/lib/rollups/rebuildAgentRollup');
          const freshSnap2 = await txRef.get();
          const freshData2 = freshSnap2.data() as any;
          const rollupAgentId = String(freshData2?.agentId || txData.agentId || uid);
          const rollupYear = Number(
            freshData2?.year ||
            (freshData2?.closedDate ? new Date(freshData2.closedDate).getFullYear() : null) ||
            new Date().getFullYear()
          );
          if (rollupAgentId && rollupYear >= 2000) {
            await rebuildAgentRollup(adminDb as any, rollupAgentId, rollupYear);
          }
        } catch (rollupErr: any) {
          console.warn('[agent PATCH] rollup rebuild failed (non-fatal):', rollupErr?.message);
        }
      })();
    }

    // ── Agent-change alert: set banner on active checklists and notify staff ────
    // Fires on any field edit or document upload (regardless of TC assignment)
    void (async () => {
      try {
        const isDocUpload = updates.documents !== undefined && !_replaceDocuments;
        const isFieldEdit = Object.keys(updates).some(k =>
          !['status', 'documents', 'updatedAt', 'lastUpdatedBy'].includes(k)
        );
        if (isDocUpload || isFieldEdit) {
          const txAddress = String(txData.propertyAddress || txData.address || 'a transaction');
          const agentName = String(txData.agentDisplayName || 'Agent');
          // Use clear, distinct language for document uploads vs transaction field edits
          const changeDesc = isDocUpload && !isFieldEdit
            ? 'uploaded a new document'
            : isFieldEdit && !isDocUpload
            ? 'updated the transaction details'
            : 'updated the transaction and uploaded a document';

          // Set agentUpdateBanner on all active checklists for this transaction
          const checklistSnap = await adminDb.collection('transactionChecklists')
            .where('transactionId', '==', txId)
            .where('status', '==', 'active')
            .get();
          const bannerUpdate = {
            agentUpdateBanner: true,
            agentUpdateAt: new Date().toISOString(),
            agentUpdateDescription: `${agentName} ${changeDesc}`,
            updatedAt: new Date().toISOString(),
          };
          for (const cl of checklistSnap.docs) {
            await cl.ref.update(bannerUpdate);
          }

          // Notify all staff
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'agent_tx_updated',
              recipientUids: staffUids,
              title: 'Transaction Updated — Please Review',
              body: `${agentName} ${changeDesc} on ${txAddress}.`,
              url: '/dashboard/admin/staff-queue',
              data: { transactionId: txId },
            });
          }

          // Also notify TC if working with TC
          if (effectiveWorkingWithTc) {
            const tcUids = await getTcUids(adminDb);
            if (tcUids.length > 0) {
              await sendNotification(adminDb, {
                type: 'agent_tx_updated',
                recipientUids: tcUids,
                title: 'Transaction Updated — Please Review',
                body: `${agentName} ${changeDesc} on ${txAddress}.`,
                url: '/dashboard/admin/tc',
                data: { transactionId: txId },
              });
            }
          }
        }
      } catch (alertErr) {
        console.error('[agent PATCH] agent-change alert error:', alertErr);
      }
    })();

    return NextResponse.json({ ok: true, updated: Object.keys(updates), resubmitted: shouldResubmitToTc });
  } catch (err: any) {
    console.error('[api/agent/transactions/[txId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// GET /api/agent/transactions/[txId]
// Returns a single transaction for the authenticated agent (or admin).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return jsonError(401, 'Unauthorized');

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  const { txId } = await params;
  const docRef = adminDb.collection('transactions').doc(txId);
  const snap = await docRef.get();
  if (!snap.exists) return jsonError(404, 'Transaction not found');

  const data = snap.data()!;
  const isAdmin = await isAdminLike(uid);
  if (!isAdmin) {
    // Build the caller's full identity set (Firebase UID + agentProfiles doc ID + agentId field)
    const getIds = new Set<string>([uid]);
    try {
      const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
      if (byDocId.exists) {
        const d = byDocId.data() || {};
        if (d.agentId) getIds.add(String(d.agentId));
        if (d.firebaseUid) getIds.add(String(d.firebaseUid));
        getIds.add(byDocId.id);
      }
      const byField = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
      if (!byField.empty) {
        const fd = byField.docs[0].data() || {};
        getIds.add(byField.docs[0].id);
        if (fd.agentId) getIds.add(String(fd.agentId));
        if (fd.firebaseUid) getIds.add(String(fd.firebaseUid));
      }
      const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
      if (!byFbUid.empty) {
        const fd = byFbUid.docs[0].data() || {};
        getIds.add(byFbUid.docs[0].id);
        if (fd.agentId) getIds.add(String(fd.agentId));
        if (fd.firebaseUid) getIds.add(String(fd.firebaseUid));
      }
    } catch (_) {}

    // Check primary agent ownership
    const isOwner = getIds.has(String(data.agentId || ''));
    // Check flat co-agent fields (coAgent1Id, coAgent2Id, coAgent3Id)
    const isCoAgent =
      (data.coAgent1Id && getIds.has(String(data.coAgent1Id))) ||
      (data.coAgent2Id && getIds.has(String(data.coAgent2Id))) ||
      (data.coAgent3Id && getIds.has(String(data.coAgent3Id))) ||
      // Legacy nested co-agent schema: coAgent.agentId
      (data.coAgent?.agentId && getIds.has(String(data.coAgent.agentId)));

    if (!isOwner && !isCoAgent) return jsonError(403, 'Forbidden');
  }

  return NextResponse.json({ ok: true, transaction: { id: snap.id, ...data } });
}
