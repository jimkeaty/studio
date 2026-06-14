/**
 * PATCH /api/admin/open-house-submissions/[id]
 * Staff marks an open house submission as email_sent.
 * Notifies the agent that their open house was included in the blast.
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
  const { action, staffNotes } = body;
  // action: 'mark_email_sent' | 'cancel'

  const ref = adminDb.collection('openHouseSubmissions').doc(params.id);
  const snap = await ref.get();
  if (!snap.exists) return jsonErr(404, 'Not found');
  const data = snap.data()!;

  const now = new Date().toISOString();

  if (action === 'mark_email_sent') {
    await ref.update({
      status: 'email_sent',
      emailSentAt: now,
      emailSentBy: decoded.uid,
      staffNotes: staffNotes || null,
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

    // Notify the agent
    if (data.agentUid) {
      await sendNotification(adminDb, {
        type: 'staff_queue_resolved',
        recipientUids: [data.agentUid],
        title: '✅ Open House Email Sent!',
        body: `Your open house${data.propertyAddress ? ' at ' + data.propertyAddress : ''} on ${data.openHouseDate} has been included in the email blast to all agents and clients. The MLS and Boomtown open house statuses have also been updated.`,
        url: '/dashboard',
      });
    }

    return NextResponse.json({ ok: true, message: 'Marked as email sent and agent notified.' });
  }

  if (action === 'cancel') {
    await ref.update({
      status: 'cancelled',
      staffNotes: staffNotes || null,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, message: 'Submission cancelled.' });
  }

  return jsonErr(400, 'Unknown action');
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
