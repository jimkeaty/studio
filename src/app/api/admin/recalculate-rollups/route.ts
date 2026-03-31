/**
 * POST /api/admin/recalculate-rollups
 *
 * Admin-only endpoint that rebuilds agentYearRollups for ALL agents
 * for a given year by reading every transaction in the ledger.
 *
 * Body: { year: number }
 *
 * This is the "nuclear option" — use it to resync everything after
 * a bulk import, data correction, or if rollups ever get out of sync.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAllRollupsForYear } from '@/lib/rollups/rebuildAgentRollup';

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return jsonError(403, 'Forbidden: Admin only');
    }

    // Parse year
    const body = await req.json().catch(() => ({}));
    const year = Number(body.year || new Date().getFullYear());
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return jsonError(400, 'Invalid year');
    }

    console.log(`[recalculate-rollups] Starting rebuild for year ${year} by ${decoded.email}`);
    const startMs = Date.now();

    const result = await rebuildAllRollupsForYear(adminDb, year);

    const elapsedMs = Date.now() - startMs;
    console.log(
      `[recalculate-rollups] Rebuilt ${result.rebuilt} agents for ${year} in ${elapsedMs}ms`
    );

    return NextResponse.json({
      ok: true,
      year,
      rebuilt: result.rebuilt,
      agentIds: result.agentIds,
      elapsedMs,
    });
  } catch (err: any) {
    console.error('[recalculate-rollups]', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
