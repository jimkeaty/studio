/**
 * POST /api/cron/coming-soon-auto-activate
 *
 * Runs daily. Finds all transactions with status === 'coming_soon' whose
 * listingDate (or createdAt as fallback) is 30+ days ago and automatically
 * transitions them to 'active'.
 *
 * Secured by CRON_SECRET header (same secret used by transaction-reminders).
 *
 * For each auto-activated transaction:
 *   1. Updates the transaction status to 'active'
 *   2. Stamps autoActivatedAt and autoActivatedReason on the transaction
 *   3. Notifies all staff: "Coming Soon listing auto-activated — update MLS"
 *   4. Notifies the agent: "Your Coming Soon listing has gone Active"
 *   5. Notifies TC (if workingWithTc=true)
 *
 * Cloud Scheduler should call this once per day, e.g.:
 *   POST https://<your-domain>/api/cron/coming-soon-auto-activate
 *   Headers: x-cron-secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { getAllStaffUids, getStaffUidsForAgent } from '@/lib/notifications/getRecipientUids';

const CRON_SECRET = process.env.CRON_SECRET || '';
const COMING_SOON_MAX_DAYS = 30;

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  // Authenticate the cron caller
  const secret = req.headers.get('x-cron-secret') || '';
  if (!CRON_SECRET || secret !== CRON_SECRET) return jsonErr(401, 'Unauthorized');

  const now = new Date();
  const cutoff = new Date(now.getTime() - COMING_SOON_MAX_DAYS * 24 * 60 * 60 * 1000);

  let activated = 0;
  let errors = 0;
  const results: { txId: string; address: string; status: 'activated' | 'error'; reason?: string }[] = [];

  try {
    // Fetch all coming_soon transactions
    const snap = await adminDb
      .collection('transactions')
      .where('status', '==', 'coming_soon')
      .get();

    for (const doc of snap.docs) {
      const txId = doc.id;
      const tx = doc.data() as any;
      const address = tx.propertyAddress || tx.address || txId;

      // Determine the listing date to measure against
      // Priority: listingDate → createdAt → skip
      let listingDateStr: string | null =
        tx.listingDate || tx.createdAt || null;

      if (!listingDateStr) {
        // No date to measure against — skip
        results.push({ txId, address, status: 'error', reason: 'no listingDate or createdAt' });
        continue;
      }

      let listingDate: Date;
      try {
        // Handle Firestore Timestamp objects
        if (typeof listingDateStr === 'object' && typeof (listingDateStr as any).toDate === 'function') {
          listingDate = (listingDateStr as any).toDate();
        } else {
          listingDate = new Date(listingDateStr as string);
        }
        if (isNaN(listingDate.getTime())) throw new Error('invalid date');
      } catch {
        results.push({ txId, address, status: 'error', reason: 'unparseable listingDate' });
        continue;
      }

      // Only auto-activate if 30+ days have passed
      if (listingDate > cutoff) continue;

      try {
        // Update the transaction
        await adminDb.collection('transactions').doc(txId).update({
          status: 'active',
          autoActivatedAt: now.toISOString(),
          autoActivatedReason: `Coming Soon auto-activated after ${COMING_SOON_MAX_DAYS} days (listing date: ${listingDate.toISOString().split('T')[0]})`,
          updatedAt: now.toISOString(),
        });

        // Resolve agent display name
        const agentId = tx.agentId || '';
        let agentName = tx.agentDisplayName || 'Unknown Agent';
        try {
          const profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
          if (profileSnap.exists) {
            agentName = profileSnap.data()?.displayName || agentName;
          }
        } catch { /* non-fatal */ }

        // ── Staff notification ─────────────────────────────────────────────
        const staffUids = await getAllStaffUids(adminDb);
        if (staffUids.length > 0) {
          await sendNotification(adminDb, {
            type: 'staff_queue_new',
            recipientUids: staffUids,
            title: 'Coming Soon Auto-Activated — Update MLS to Active',
            body: `${agentName}'s Coming Soon listing at ${address} has automatically gone Active after ${COMING_SOON_MAX_DAYS} days. Please update MLS status to Active.`,
            url: '/dashboard/admin/staff-queue',
            data: { transactionId: txId },
          });
        }

        // ── Agent notification ─────────────────────────────────────────────
        // Find the agent's Firebase UID to send them a notification
        let agentFirebaseUid: string | null = null;
        try {
          // Try direct doc lookup
          const profileDirect = await adminDb.collection('agentProfiles').doc(agentId).get();
          if (profileDirect.exists) {
            agentFirebaseUid = profileDirect.data()?.firebaseUid || null;
          }
          // Fallback: query by agentId field
          if (!agentFirebaseUid) {
            const byField = await adminDb.collection('agentProfiles')
              .where('agentId', '==', agentId)
              .limit(1)
              .get();
            if (!byField.empty) {
              agentFirebaseUid = byField.docs[0].data()?.firebaseUid || null;
            }
          }
        } catch { /* non-fatal */ }

        if (agentFirebaseUid) {
          await sendNotification(adminDb, {
            type: 'tx_status_change',
            recipientUids: [agentFirebaseUid],
            title: 'Your Coming Soon Listing is Now Active',
            body: `Your Coming Soon listing at ${address} has automatically gone Active after ${COMING_SOON_MAX_DAYS} days. Staff has been notified to update MLS.`,
            url: '/dashboard/my-transactions',
            data: { transactionId: txId },
          });
        }

        // ── TC notification (if working with TC) ──────────────────────────
        if (tx.workingWithTc) {
          const tcRecipients = await getStaffUidsForAgent(adminDb, agentId);
          if (tcRecipients.length > 0) {
            await sendNotification(adminDb, {
              type: 'tx_status_change',
              recipientUids: tcRecipients,
              title: 'Coming Soon Listing Auto-Activated',
              body: `${agentName}'s Coming Soon listing at ${address} has automatically gone Active after ${COMING_SOON_MAX_DAYS} days.`,
              url: '/dashboard/admin/tc',
              data: { transactionId: txId },
            });
          }
        }

        activated++;
        results.push({ txId, address, status: 'activated' });
      } catch (txErr: any) {
        errors++;
        results.push({ txId, address, status: 'error', reason: txErr.message });
        console.error(`[coming-soon-auto-activate] Failed to activate tx ${txId}:`, txErr);
      }
    }
  } catch (err: any) {
    console.error('[coming-soon-auto-activate] Fatal error:', err);
    return jsonErr(500, err.message || 'Internal server error');
  }

  return NextResponse.json({
    ok: true,
    activated,
    errors,
    total: activated + errors,
    results,
    runAt: now.toISOString(),
  });
}
