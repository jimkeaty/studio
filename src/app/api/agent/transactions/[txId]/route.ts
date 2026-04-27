// PATCH /api/agent/transactions/[txId]
// Allows an agent to update their own active/pending transaction.
// If resubmitToTc=true (status changing to pending), creates a new tcIntakes document.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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
  'sellerName', 'sellerEmail', 'sellerPhone',
  'seller2Name', 'seller2Email', 'seller2Phone',
  'buyerName', 'buyerEmail', 'buyerPhone',
  'buyer2Name', 'buyer2Email', 'buyer2Phone',
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherAgentBrokerage',
  'sellerCommissionPct', 'buyerCommissionPct',
  'notes',
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
  { params }: { params: { txId: string } }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { txId } = params;
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

        // Property
        propertyAddress: mergedData.propertyAddress ?? null,
        dealType: mergedData.dealType ?? null,
        transactionType: mergedData.transactionType ?? null,
        listPrice: mergedData.listPrice ?? null,
        salePrice: mergedData.salePrice ?? null,

        // Dates
        listingDate: mergedData.listingDate ?? null,
        contractDate: mergedData.contractDate ?? null,
        closingDate: mergedData.closingDate ?? mergedData.closedDate ?? null,

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

        // Buyer
        buyerName: mergedData.buyerName ?? null,
        buyerEmail: mergedData.buyerEmail ?? null,
        buyerPhone: mergedData.buyerPhone ?? null,
        buyer2Name: mergedData.buyer2Name ?? null,
        buyer2Email: mergedData.buyer2Email ?? null,
        buyer2Phone: mergedData.buyer2Phone ?? null,

        // Other agent
        otherAgentName: mergedData.otherAgentName ?? null,
        otherAgentEmail: mergedData.otherAgentEmail ?? null,
        otherAgentPhone: mergedData.otherAgentPhone ?? null,
        otherAgentBrokerage: mergedData.otherAgentBrokerage ?? null,

        // Commission
        sellerCommissionPct: mergedData.sellerCommissionPct ?? null,
        buyerCommissionPct: mergedData.buyerCommissionPct ?? null,

        // Notes
        notes: mergedData.notes ?? null,
      };

      await adminDb.collection('tcIntakes').add(intake);
    }

    return NextResponse.json({ ok: true, updated: Object.keys(updates), resubmitted: !!resubmitToTc });
  } catch (err: any) {
    console.error('[api/agent/transactions/[txId]]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
