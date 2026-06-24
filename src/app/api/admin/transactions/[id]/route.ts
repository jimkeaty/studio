// GET  /api/admin/transactions/[id] — fetch a single transaction by Firestore doc ID
// PATCH /api/admin/transactions/[id] — update documents array on a transaction
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // Next.js 15+: params is a Promise and must be awaited
    const { id } = await context.params;
    if (!id) return jsonError(400, 'Transaction id is required');

    const doc = await adminDb.collection('transactions').doc(id).get();
    if (!doc.exists) return jsonError(404, 'Transaction not found');

    const transaction = serializeFirestore({ id: doc.id, ...doc.data() });
    return NextResponse.json({ ok: true, transaction });
  } catch (err: any) {
    console.error('[api/admin/transactions/[id] GET]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH — update documents array (used by the Documents section on the edit page)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { id } = await context.params;
    if (!id) return jsonError(400, 'Transaction id is required');

    const body = await req.json();
    const update: Record<string, any> = {};
    if (Array.isArray(body.documents)) update.documents = body.documents;
    if (Object.keys(update).length === 0) return jsonError(400, 'No valid fields to update');

    await adminDb.collection('transactions').doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[api/admin/transactions/[id] PATCH]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
