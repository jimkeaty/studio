// PATCH /api/agent/transactions/[txId]
// Allows an agent to update their own active/pending transaction.
// If resubmitToTc=true (status changing to pending), creates a new tcIntakes document.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAllStaffUids, getTcUids } from '@/lib/notifications/getRecipientUids';
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
  // Lender
  'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
  // Title
  'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
  // Dates
  'optionExpiration', 'inspectionDeadline', 'projectedCloseDate',
  // Commission
  'commissionPercent', 'commissionBasePrice', 'gci', 'transactionFee',
  'sellerCommissionPct', 'buyerCommissionPct',
  // Notes
  'notes', 'additionalComments',
  // Documents (Purchase Agreement, Listing Paperwork, etc.)
  'documents',
]);

// Statuses an agent is allowed to set
const AGENT_ALLOWED_STATUSES = new Set(['active', 'temp_off_market', 'pending', 'closed', 'cancelled', 'canceled', 'expired']);

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

    // Verify ownership — agent can only edit their own transactions
    // Team leaders can also edit any transaction belonging to their team.
    // Admins can edit any transaction.
    const isAdmin = await isAdminLike(uid);
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

      // Allow if: (a) it's the agent's own transaction, OR
      //           (b) the caller is a team leader and the transaction belongs to their team
      const isOwnTx = ownIds.has(txAgentId);
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
    const { resubmitToTc, notifyPendingContract, ...rawUpdates } = body;

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

    // Keep dealValue in sync with salePrice so volume metrics stay accurate.
    // When salePrice is edited, dealValue must also be updated or old value persists in charts.
    if (updates.salePrice !== undefined) {
      const sp = Number(updates.salePrice);
      if (!isNaN(sp) && sp > 0) {
        updates.dealValue = sp;
      }
    }

    // ── Auto-calculate GCI and splitSnapshot whenever commission-relevant fields change ──
    // Triggered when: salePrice, commissionPercent, commissionBasePrice, or gci is edited.
    // This mirrors what the TC approval route does so the transaction ledger always shows
    // the correct commission breakdown without requiring a TC to re-approve.
    const commissionFieldsChanged = (
      updates.salePrice !== undefined ||
      updates.commissionPercent !== undefined ||
      updates.commissionBasePrice !== undefined ||
      updates.gci !== undefined
    );
    if (commissionFieldsChanged) {
      try {
        const mergedForCalc = { ...txData, ...updates };
        const rawGci = resolveGCI({
          commissionBasePrice: mergedForCalc.commissionBasePrice ?? null,
          salePrice: mergedForCalc.salePrice ?? null,
          commissionPercent: mergedForCalc.commissionPercent ?? null,
          gci: mergedForCalc.gci ?? null,
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

    // Save updates to the transaction document
    await txRef.update(updates);

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
    // Only listings (closingType = 'listing' or 'dual') with workingWithTc=true go to the TC queue.
    // Buyer/referral transactions and listings without TC never create a tcIntake on status change.
    const shouldResubmitToTc = !!resubmitToTc && isListingTx && !!txData.workingWithTc;
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
        // Notify TC/staff about the status change
        if (newStatus && newStatus !== previousStatus) {
          const workingWithTc = !!txData.workingWithTc;
          const recipientUids = workingWithTc
            ? await getTcUids(adminDb)
            : await getAllStaffUids(adminDb);
          if (recipientUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tx_status_change',
              recipientUids,
              title: 'Transaction Status Updated',
              body: `${agentName} changed ${txAddress} from ${previousStatus ?? 'unknown'} to ${newStatus}.`,
              url: '/dashboard/admin/transactions',
            });
          }
        }
        // Notify TC about resubmission (only if listing + workingWithTc)
        if (shouldResubmitToTc) {
          const tcUids = await getTcUids(adminDb);
          if (tcUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: tcUids,
              title: 'Transaction Resubmitted to TC',
              body: `${agentName} resubmitted ${txAddress} for TC review (status: pending).`,
              url: '/dashboard/admin/tc',
            });
          }
        }
        // Active → Pending listing with contract details: notify agent + all staff + assigned TC
        if (notifyPendingContract && newStatus === 'pending' && previousStatus !== 'pending') {
          // Notify the agent themselves
          const agentUid = txData.agentId || uid;
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: [agentUid],
            title: 'Listing Under Contract',
            body: `${txAddress} has been marked as Pending. Contract details have been submitted for staff review.`,
            url: '/dashboard',
          });
          // Notify all staff
          const staffUids = await getAllStaffUids(adminDb);
          if (staffUids.length > 0) {
            await sendNotification(adminDb, {
              type: 'staff_queue_new',
              recipientUids: staffUids,
              title: 'Listing Under Contract — Action Required',
              body: `${agentName}'s listing at ${txAddress} is now Pending. Contract details submitted. Please update MLS.`,
              url: '/dashboard/admin/staff-queue',
            });
          }
          // Notify TC only if assigned to this specific agent
          const agentProfileDoc = await adminDb.collection('agentProfiles').doc(txData.agentId || uid).get().catch(() => null);
          const assignedTcUid = agentProfileDoc?.data()?.assignedTcUid as string | undefined;
          if (assignedTcUid) {
            await sendNotification(adminDb, {
              type: 'tc_new_intake',
              recipientUids: [assignedTcUid],
              title: 'Listing Under Contract — TC Review',
              body: `${agentName}'s listing at ${txAddress} is now Pending. Contract details submitted for your review.`,
              url: '/dashboard/admin/tc',
            });
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

    return NextResponse.json({ ok: true, updated: Object.keys(updates), resubmitted: shouldResubmitToTc });
  } catch (err: any) {
    console.error('[api/agent/transactions/[txId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
