// GET  /api/admin/accepted-duplicates  — fetch all accepted duplicate keys
// POST /api/admin/accepted-duplicates  — add one or more keys
// DELETE /api/admin/accepted-duplicates — remove a key

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const COLLECTION = 'acceptedDuplicates';

function getBearerToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

async function requireAdmin(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const snap = await adminDb.collection(COLLECTION).get();
    // Return the stored `key` field (plain text), NOT d.id which is base64-encoded
    const keys = snap.docs.map(d => {
      const data = d.data();
      // Prefer the stored key field; fall back to decoding the doc ID for legacy docs
      if (data.key && typeof data.key === 'string') return data.key;
      try { return Buffer.from(d.id, 'base64url').toString('utf8'); } catch { return d.id; }
    });
    return NextResponse.json({ ok: true, keys });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    // Accept either { key: string } or { keys: string[] }
    const keys: string[] = Array.isArray(body.keys)
      ? body.keys
      : body.key
      ? [body.key]
      : [];

    if (keys.length === 0) {
      return NextResponse.json({ ok: false, error: 'No keys provided' }, { status: 400 });
    }

    const batch = adminDb.batch();
    for (const key of keys) {
      const docRef = adminDb.collection(COLLECTION).doc(
        // Firestore doc IDs can't contain '/' — encode the key
        Buffer.from(key).toString('base64url')
      );
      batch.set(docRef, {
        key,
        acceptedBy: user.uid,
        acceptedAt: new Date().toISOString(),
      }, { merge: true });
    }
    await batch.commit();

    return NextResponse.json({ ok: true, added: keys.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const key: string = body.key;
    if (!key) return NextResponse.json({ ok: false, error: 'No key provided' }, { status: 400 });

    const docId = Buffer.from(key).toString('base64url');
    await adminDb.collection(COLLECTION).doc(docId).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
