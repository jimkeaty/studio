import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { centralParts } from '@/lib/attendance/rules';
import { calculateCglMonthlyAttendance } from '@/lib/attendance/cglMonthlyAttendance';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdminLike(req: NextRequest) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  try {
    const token = await adminAuth.verifyIdToken(header.slice(7));
    return await isAdminLike(token.uid);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminLike(req))) return jsonError(403, 'Administrator or staff access required');
  const month = new URL(req.url).searchParams.get('month') || centralParts().date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonError(400, 'month must be YYYY-MM');

  try {
    const [profilesSnap, membershipsSnap, attendanceSnap] = await Promise.all([
      adminDb.collection('agentProfiles').get(),
      adminDb.collection('teamMemberships').get(),
      adminDb.collection('agentAttendance').get(),
    ]);
    const summary = calculateCglMonthlyAttendance({
      month,
      asOfDate: centralParts().date,
      profiles: profilesSnap.docs.map(doc => ({ agentId: String(doc.data().agentId || doc.id), ...(doc.data() as any) })),
      memberships: membershipsSnap.docs.map(doc => doc.data() as any),
      records: attendanceSnap.docs.map(doc => doc.data() as any),
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error: any) {
    return jsonError(500, error?.message || 'Unable to calculate CGL attendance');
  }
}
