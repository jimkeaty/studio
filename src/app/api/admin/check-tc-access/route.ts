// GET /api/admin/check-tc-access
// Returns { ok: true, role } for any staff user (tc, tc_admin, office_admin).
// Used by TC Queue pages to gate access for TC coordinators.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { isStaff, getStaffRole } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    const allowed = await isStaff(decoded.uid);
    if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });
    const role = await getStaffRole(decoded.uid);
    return NextResponse.json({ ok: true, role });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
