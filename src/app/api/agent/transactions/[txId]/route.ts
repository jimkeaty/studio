// PATCH /api/agent/transactions/[txId]
// Allows an agent to update their own active/pending transaction.
// If resubmitToTc=true (status changing to pending), creates a new tcIntakes document.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAllStaffUids, getTcUids } from '@/lib/notifications/getRecipientUids';
import { splitCoAgentTransaction } from '@/lib/transactions/splitCoAgentTransaction';

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
  'sellerCommissionPct', 'buyerCommissionPct',
  // Notes
  'notes', 'additionalComments',
  // Documents (Purchase Agreement, Listing Paperwork, etc.)
  'documents',
]);

// Statuses an agent is allowed to set
const AGENT_ALLOWED_STATUSES = new Set(['active', 'temp_off_market', 'pending', 'closed', 'cancelled', 'canceled', 'expired', 'sold']);

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
    // (admins can also use this endpoint)
    const isAdmin = await isAdminLike(uid);
    if (!isAdmin) {
      // Resolve all possible agentId values for this user
      const ownIds = new Set<string>([uid]);
      try {
        const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
        if (byDocId.exists) {
          const d = byDocId.data() || {};
          if (d.agentId) ownIds.add(String(d.agentId));
        }
        const byField = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
        if (!byField.empty) ownIds.add(byField.docs[0].id);
      } catch (_) {}

      const txAgentId = String(txData.agentId || '');
      if (!ownIds.has(txAgentId)) {
        return jsonError(403, 'You do not have permission to edit this transaction');
      }
    }

    const body = await req.json();
    const { resubmitToTc, ...rawUpdates } = body;

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

    // If agent is moving from active → pending, re-submit to TC queue
    if (resubmitToTc) {
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
        // Notify TC about resubmission
        if (resubmitToTc) {
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

    return NextResponse.json({ ok: true, updated: Object.keys(updates), resubmitted: !!resubmitToTc });
  } catch (err: any) {
    console.error('[api/agent/transactions/[txId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
