// GET  /api/notifications/preferences — load current user's notification preferences
// PATCH /api/notifications/preferences — save current user's notification preferences
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const DEFAULT_PREFS = {
  in_app: true,
  push: true,
  email: true,
  sms: false,
  events: {},
};

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? (userDoc.data() as Record<string, any>) : {};
    const prefs = userData.notificationPrefs ?? DEFAULT_PREFS;

    return NextResponse.json({ ok: true, prefs });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const { prefs } = body;
    if (!prefs || typeof prefs !== 'object') {
      return jsonError(400, 'Invalid preferences payload');
    }

    // Merge into the users/{uid} document
    await adminDb.collection('users').doc(uid).set(
      { notificationPrefs: prefs, updatedAt: new Date().toISOString() },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
