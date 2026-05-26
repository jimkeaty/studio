// POST /api/broker/active-agents/goals
// Save per-month active agent count goals to the recruitingGoals collection.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

export async function POST(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization');
    if (!h?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const body = await req.json();
    const { year, goals } = body as { year: number; goals: Record<number, string> };
    if (!year || !goals) return jsonError(400, 'year and goals required');

    const batch = adminDb.batch();
    for (const [monthStr, goalStr] of Object.entries(goals)) {
      const month = parseInt(monthStr, 10);
      const activeAgentsGoal = goalStr ? parseInt(goalStr, 10) : null;
      if (isNaN(month) || month < 1 || month > 12) continue;
      const docId = `${year}-${String(month).padStart(2, '0')}`;
      const ref = adminDb.collection('recruitingGoals').doc(docId);
      batch.set(ref, { year, month, activeAgentsGoal, updatedAt: new Date().toISOString() }, { merge: true });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
