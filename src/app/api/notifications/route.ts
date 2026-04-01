/**
 * GET  /api/notifications       — fetch notifications for the current user
 * POST /api/notifications       — mark notifications as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Missing authorization token');

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const snap = await adminDb
    .collection('notifications')
    .where('recipientUid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const notifications = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      ...data,
      createdAt: (data.createdAt as { toDate?: () => Date } | null)?.toDate?.()?.toISOString() ?? null,
    };
  });

  const unreadCount = notifications.filter((n) => !(n as { read?: boolean }).read).length;

  return NextResponse.json({ ok: true, notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Missing authorization token');

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  const body = await req.json();
  const { action, notificationIds } = body;

  if (action === 'mark_read') {
    const ids: string[] = notificationIds || [];
    const batch = adminDb.batch();

    for (const id of ids) {
      const ref = adminDb.collection('notifications').doc(id);
      batch.update(ref, { read: true, readAt: new Date() });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (action === 'mark_all_read') {
    const snap = await adminDb
      .collection('notifications')
      .where('recipientUid', '==', uid)
      .where('read', '==', false)
      .get();

    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: new Date() }));
    await batch.commit();
    return NextResponse.json({ ok: true, updated: snap.size });
  }

  return jsonError(400, 'Unknown action');
}
