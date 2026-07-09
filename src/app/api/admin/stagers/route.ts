// GET  /api/admin/stagers        — list all stagers
// POST /api/admin/stagers        — create a new stager
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  // Agents can read stagers (needed for the staging request dropdown)
  try {
    const snap = await adminDb.collection('stagers').orderBy('name').get();
    const stagers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, stagers });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isAdminLike(uid))) return jsonError(403, 'Forbidden');
  try {
    const body = await req.json();
    const { name, email, phone, company } = body;
    if (!name?.trim()) return jsonError(400, 'Name is required');
    const doc = await adminDb.collection('stagers').add({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      company: company?.trim() || null,
      active: true,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
