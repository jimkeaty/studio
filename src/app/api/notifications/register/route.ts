/**
 * POST /api/notifications/register
 * Saves an FCM token for the authenticated user to Firestore (server-side).
 * Called by the usePushNotifications hook after permission is granted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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

  let body: { token?: string; platform?: string; userAgent?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { token: fcmToken, platform = 'web', userAgent = '' } = body;
  if (!fcmToken || typeof fcmToken !== 'string') {
    return jsonError(400, 'Missing or invalid token field');
  }

  try {
    await adminDb.collection('fcmTokens').doc(uid).set(
      {
        token: fcmToken,
        userId: uid,
        updatedAt: FieldValue.serverTimestamp(),
        platform,
        userAgent,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[FCM register] Firestore write failed:', err);
    return jsonError(500, 'Failed to save token');
  }
}
