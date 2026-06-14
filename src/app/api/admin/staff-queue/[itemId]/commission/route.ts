/**
 * POST /api/admin/staff-queue/[itemId]/commission
 * Staff marks a closed transaction's commission as processed.
 * Notifies the agent that their commission is ready.
 *
 * Body: {
 *   commissionMethod: 'check_front_desk' | 'direct_deposit',
 *   commissionAmount?: number,
 *   staffNotes?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }
  if (!(await isStaff(decoded.uid))) return jsonErr(403, 'Forbidden');

  const body = await req.json();
  const { commissionMethod, commissionAmount, staffNotes } = body;

  if (!commissionMethod) return jsonErr(400, 'commissionMethod is required');

  const ref = adminDb.collection('staffQueue').doc(params.itemId);
  const snap = await ref.get();
  if (!snap.exists) return jsonErr(404, 'Staff queue item not found');
  const item = snap.data()!;

  const now = new Date().toISOString();

  // Update the staff queue item
  await ref.update({
    status: 'completed',
    commissionProcessed: true,
    commissionProcessedAt: now,
    commissionProcessedBy: decoded.uid,
    commissionMethod,
    commissionAmount: commissionAmount || item.gci || null,
    staffNotes: staffNotes || item.staffNotes || null,
    updatedAt: now,
  });

  // Also update the transaction if we have a transactionId
  if (item.transactionId) {
    await adminDb.collection('transactions').doc(item.transactionId).update({
      commissionProcessed: true,
      commissionProcessedAt: now,
      updatedAt: now,
    }).catch(() => {}); // non-fatal
  }

  // Notify the agent
  const agentUid = item.agentUid || null;
  let recipientUid = agentUid;

  // If we don't have agentUid directly, look it up from agentId
  if (!recipientUid && item.agentId) {
    const profileSnap = await adminDb.collection('agentProfiles').doc(item.agentId).get();
    if (profileSnap.exists) {
      recipientUid = profileSnap.data()?.firebaseUid || null;
    }
  }

  if (recipientUid) {
    const methodLabel = commissionMethod === 'direct_deposit'
      ? 'via direct deposit to your account'
      : 'waiting for you at the front desk';

    const amountStr = commissionAmount
      ? ` ($${Number(commissionAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : '';

    await sendNotification(adminDb, {
      type: 'staff_queue_resolved',
      recipientUids: [recipientUid],
      title: '🎉 Commission Processed!',
      body: `Your commission${amountStr} for ${item.address || 'your recent closing'} has been processed and is ${methodLabel}. Great work!`,
      url: '/dashboard',
    });
  }

  return NextResponse.json({ ok: true, message: 'Commission marked as processed and agent notified.' });
}
