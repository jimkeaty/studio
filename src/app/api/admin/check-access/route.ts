// GET /api/admin/check-access
// Returns { ok: true } for any admin-like user (office_admin or tc_admin).
// Used by the sidebar to determine whether to show the admin menu.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    const allowed = await isAdminLike(decoded.uid);
    if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
