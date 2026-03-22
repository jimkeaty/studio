// GET + POST /api/broker/goals — manage monthly broker command goals
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  if (decoded.uid !== ADMIN_UID) return null;
  return decoded;
}

// GET /api/broker/goals?year=2026
export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden');

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const segment = searchParams.get('segment') || 'TOTAL';

    const snap = await adminDb
      .collection('brokerCommandGoals')
      .where('year', '==', year)
      .where('segment', '==', segment)
      .orderBy('month', 'asc')
      .get();

    const goals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, goals });
  } catch (err: any) {
    console.error('[api/broker/goals GET]', err);
    return jsonError(500, err.message);
  }
}

// POST /api/broker/goals — save goals for a month
// Body: { year, month, segment?, grossMarginGoal?, volumeGoal?, salesCountGoal? }
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden');

    const body = await req.json();
    const { year, month, segment = 'TOTAL', grossMarginGoal, volumeGoal, salesCountGoal } = body;

    if (!year || !month || month < 1 || month > 12) {
      return jsonError(400, 'year and month (1-12) are required');
    }

    const docId = `${year}-${String(month).padStart(2, '0')}-${segment}`;
    const docRef = adminDb.collection('brokerCommandGoals').doc(docId);

    await docRef.set(
      {
        year,
        month,
        segment,
        grossMarginGoal: grossMarginGoal ?? null,
        volumeGoal: volumeGoal ?? null,
        salesCountGoal: salesCountGoal ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: docId });
  } catch (err: any) {
    console.error('[api/broker/goals POST]', err);
    return jsonError(500, err.message);
  }
}
