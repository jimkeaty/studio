import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const DOC = 'tvConfig';
const COL = 'appConfig';

const DEFAULT_CONFIG = {
  rotationIntervalSeconds: 30,
  enabledPages: ['activity', 'leaderboard', 'open-houses', 'buyer-needs', 'coming-soon'],
};

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

export async function GET() {
  try {
    const snap = await adminDb.collection(COL).doc(DOC).get();
    const config = snap.exists ? snap.data() : DEFAULT_CONFIG;
    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const ref = adminDb.collection(COL).doc(DOC);
    await ref.set({ ...body, updatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
