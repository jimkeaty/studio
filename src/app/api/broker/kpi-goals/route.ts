// GET + POST /api/broker/kpi-goals
// Stores annual KPI targets for the brokerage (calls, engagements, appointmentsSet,
// appointmentsHeld, contractsWritten, closings) plus recruiting goals
// (agentCountGoal, newHiresGoal, recruitingCallsGoal, recruitingApptSetGoal,
//  recruitingApptHeldGoal, recruitingClosingsGoal).
// Stored in Firestore collection: brokerKpiGoals / {year}
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const snap = await adminDb.collection('brokerKpiGoals').doc(String(year)).get();
    const goals = snap.exists ? snap.data() : {};
    return NextResponse.json({ ok: true, year, goals });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');
  try {
    const body = await req.json();
    const { year, ...goalFields } = body;
    const y = parseInt(year || String(new Date().getFullYear()), 10);
    const allowed = [
      'callsGoal', 'engagementsGoal', 'appointmentsSetGoal',
      'appointmentsHeldGoal', 'contractsWrittenGoal', 'closingsGoal',
      'agentCountGoal', 'newHiresGoal',
      'recruitingCallsGoal', 'recruitingApptSetGoal',
      'recruitingApptHeldGoal', 'recruitingClosingsGoal',
    ];
    const filtered: Record<string, number | null> = {};
    for (const key of allowed) {
      if (key in goalFields) {
        const v = goalFields[key];
        filtered[key] = v != null && v !== '' ? Number(v) : null;
      }
    }
    await adminDb.collection('brokerKpiGoals').doc(String(y)).set(
      { year: y, ...filtered, updatedAt: new Date().toISOString(), updatedBy: decoded.uid },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
