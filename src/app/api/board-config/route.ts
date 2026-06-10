/**
 * GET  /api/board-config?board=activityBoard|leaderboard
 * POST /api/board-config   body: { board: string, config: object }
 *
 * Stores config documents in Firestore collection `boardConfig`.
 * Admin-only for POST; GET is unauthenticated so TV display pages can read it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// ── Default configs ────────────────────────────────────────────────────────────
const ACTIVITY_DEFAULTS = {
  title: 'Activity Board',
  lookbackDays: 60,
  showTopN: 25,
  showAddress: true,
  sortOrder: 'newestFirst',
};

const LEADERBOARD_DEFAULTS = {
  title: 'Production Leaderboard',
  subtitle: '',
  year: new Date().getFullYear(),
  periodType: 'yearly',
  primaryMetricKey: 'closed',
  showTopN: 10,
  showGCI: true,
  showVolume: true,
  showSales: true,
};

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const board = req.nextUrl.searchParams.get('board') || 'activityBoard';
    const doc = await adminDb.collection('boardConfig').doc(board).get();

    const defaults =
      board === 'leaderboard' ? LEADERBOARD_DEFAULTS : ACTIVITY_DEFAULTS;

    const config = doc.exists ? { ...defaults, ...doc.data() } : defaults;

    return NextResponse.json({ ok: true, config });
  } catch (err: any) {
    console.error('[GET /api/board-config]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { board, config } = body as { board: string; config: Record<string, unknown> };

    if (!board || !config) {
      return NextResponse.json(
        { ok: false, error: 'Missing board or config' },
        { status: 400 }
      );
    }

    await adminDb
      .collection('boardConfig')
      .doc(board)
      .set({ ...config, updatedAt: new Date().toISOString() }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[POST /api/board-config]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
