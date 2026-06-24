/**
 * PATCH /api/admin/open-house-submissions/[id]
 * Actions:
 *   mark_email_sent  — marks all done, notifies agent
 *   update_checklist — saves intermediate checklist progress
 *   cancel           — cancels the submission
 *
 * DELETE /api/admin/open-house-submissions/[id]
 *   Hard-deletes the submission (admin only).
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }
  if (!(await isStaff(decoded.uid))) return jsonErr(403, 'Forbidden');

  const body = await req.json();
  const { action, staffNotes, checklist } = body;

  const ref = adminDb.collection('openHouseSubmissions').doc(params.id);
  const snap = await ref.get();
  if (!snap.exists) return jsonErr(404, 'Not found');
  const data = snap.data()!;
  const now = new Date().toISOString();

  // ── update_checklist: save progress without marking done ──────────────────
  if (action === 'update_checklist') {
    const cl = checklist ?? data.checklist ?? { mls: false, boomtown: false, email: false };
    await ref.update({ checklist: cl, updatedAt: now });
    return NextResponse.json({ ok: true, message: 'Checklist saved.' });
  }

  // ── mark_email_sent: all done, notify agent ───────────────────────────────
  if (action === 'mark_email_sent') {
    const cl = checklist ?? data.checklist ?? { mls: false, boomtown: false, email: false };
    await ref.update({
      status: 'email_sent',
      checklist: cl,
      emailSentAt: now,
      emailSentBy: decoded.uid,
      staffNotes: staffNotes || data.staffNotes || null,
      updatedAt: now,
    });

    // Update the corresponding staff queue item
    const sqSnap = await adminDb.collection('staffQueue')
      .where('submissionId', '==', params.id)
      .limit(1).get();
    if (!sqSnap.empty) {
      await sqSnap.docs[0].ref.update({
        status: 'completed',
        reviewedBy: decoded.uid,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    // Build agent notification body based on what was completed
    const completedItems: string[] = [];
    if (cl.mls) completedItems.push('MLS');
    if (cl.boomtown) completedItems.push('Boomtown');
    if (cl.email) completedItems.push('email blast');
    const completedStr = completedItems.length > 0
      ? ` Staff completed: ${completedItems.join(', ')}.`
      : '';

    // Notify the agent
    const agentUid = data.agentUid || data.agentId;
    if (agentUid) {
      await sendNotification(adminDb, {
        type: 'staff_queue_resolved',
        recipientUids: [agentUid],
        title: '✅ Open House Live!',
        body: `Your open house${data.propertyAddress ? ' at ' + data.propertyAddress : ''} on ${data.openHouseDate} has been processed.${completedStr}`,
        url: '/dashboard/open-house',
      });
    }
    return NextResponse.json({ ok: true, message: 'Marked as done and agent notified.' });
  }

  // ── cancel ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    await ref.update({
      status: 'cancelled',
      staffNotes: staffNotes || null,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, message: 'Submission cancelled.' });
  }

  return jsonErr(400, 'Unknown action. Valid actions: mark_email_sent, update_checklist, cancel');
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }
  if (!(await isStaff(decoded.uid))) return jsonErr(403, 'Forbidden');
  await adminDb.collection('openHouseSubmissions').doc(params.id).delete();
  return NextResponse.json({ ok: true });
}
