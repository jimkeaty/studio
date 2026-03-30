// GET /api/admin/notifications — fetch in-app notifications for the current user
// PATCH /api/admin/notifications — mark notification(s) as read
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);

    const snap = await adminDb
      .collection('notifications')
      .where('recipientUid', '==', decoded.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
    }));

    return NextResponse.json({ ok: true, notifications });
  } catch (err: any) {
    console.error('[GET /api/admin/notifications]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);

    const body = await req.json();
    const { notificationIds, markAllRead } = body;

    if (markAllRead) {
      // Mark all unread notifications for this user as read
      const snap = await adminDb
        .collection('notifications')
        .where('recipientUid', '==', decoded.uid)
        .where('read', '==', false)
        .get();
      const batch = adminDb.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
      return NextResponse.json({ ok: true, updated: snap.size });
    }

    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      const batch = adminDb.batch();
      for (const id of notificationIds) {
        batch.update(adminDb.collection('notifications').doc(id), { read: true });
      }
      await batch.commit();
      return NextResponse.json({ ok: true, updated: notificationIds.length });
    }

    return jsonError(400, 'Provide notificationIds array or markAllRead: true');
  } catch (err: any) {
    console.error('[PATCH /api/admin/notifications]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
