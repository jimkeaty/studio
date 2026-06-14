/**
 * GET  /api/admin/open-house-submissions  — staff fetches all submissions
 * PATCH /api/admin/open-house-submissions — bulk update (not used currently)
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return jsonErr(401, 'Unauthorized');
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(tok); } catch { return jsonErr(401, 'Invalid token'); }
  if (!(await isStaff(decoded.uid))) return jsonErr(403, 'Forbidden');

  const url = new URL(req.url);
  const weekOf = url.searchParams.get('weekOf');
  const statusFilter = url.searchParams.get('status');

  let query: FirebaseFirestore.Query = adminDb.collection('openHouseSubmissions').limit(200);
  if (weekOf) query = adminDb.collection('openHouseSubmissions').where('weekOf', '==', weekOf).limit(200);
  else if (statusFilter && statusFilter !== 'all') {
    query = adminDb.collection('openHouseSubmissions').where('status', '==', statusFilter).limit(200);
  }

  const snap = await query.get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ ok: true, items });
}
