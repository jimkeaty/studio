/**
 * GET  /api/notifications       — fetch notifications for the current user
 * POST /api/notifications       — mark notifications as read
 *
 * Query strategy: Firestore has a composite index on (recipientUid, read, createdAt).
 * We use two targeted queries — unread first, then recent read — and merge them.
 * This avoids needing a separate (recipientUid, createdAt) index which may not exist.
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

function serializeNotif(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    ...data,
    createdAt: (data.createdAt as { toDate?: () => Date } | null)?.toDate?.()?.toISOString() ?? null,
  };
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

  try {
    // ── Strategy: use the existing (recipientUid, read, createdAt) composite index ──
    // Query 1: all unread notifications (no limit — we need the full unread count)
    const unreadSnap = await adminDb
      .collection('notifications')
      .where('recipientUid', '==', uid)
      .where('read', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    // Query 2: recent read notifications to fill the display list
    const readSnap = await adminDb
      .collection('notifications')
      .where('recipientUid', '==', uid)
      .where('read', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    // Merge: unread first, then recent read, deduplicate, cap at limit
    const seen = new Set<string>();
    const merged: ReturnType<typeof serializeNotif>[] = [];

    for (const d of unreadSnap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push(serializeNotif(d));
      }
    }
    for (const d of readSnap.docs) {
      if (!seen.has(d.id) && merged.length < limit) {
        seen.add(d.id);
        merged.push(serializeNotif(d));
      }
    }

    // Sort merged list by createdAt descending
    merged.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      return tb - ta;
    });

    const unreadCount = unreadSnap.size;

    return NextResponse.json({ ok: true, notifications: merged, unreadCount });
  } catch (err: any) {
    console.error('[api/notifications GET]', err?.message || err);
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0 });
  }
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
    try {
      const snap = await adminDb
        .collection('notifications')
        .where('recipientUid', '==', uid)
        .where('read', '==', false)
        .get();

      const batch = adminDb.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: new Date() }));
      await batch.commit();
      return NextResponse.json({ ok: true, updated: snap.size });
    } catch (err: any) {
      console.error('[api/notifications POST mark_all_read]', err?.message || err);
      return NextResponse.json({ ok: true, updated: 0 });
    }
  }

  return jsonError(400, 'Unknown action');
}
