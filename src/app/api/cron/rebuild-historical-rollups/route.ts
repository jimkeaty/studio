/**
 * POST /api/cron/rebuild-historical-rollups
 *
 * Rebuilds every historical agentYearRollups year from the transaction ledger.
 * This is intentionally a manual maintenance operation, not a scheduled job.
 * It is protected by the same CRON_SECRET header required by existing
 * production maintenance routes and requires an explicit confirmation body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { rebuildAllRollupsForYear } from '@/lib/rollups/rebuildAgentRollup';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || '';
const CONFIRMATION = 'rebuild_all_historical_rollups';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toHistoricalYear(value: unknown): number | null {
  if (!value) return null;
  const raw = typeof (value as any)?.toDate === 'function'
    ? (value as any).toDate()
    : value;
  const date = raw instanceof Date ? raw : new Date(raw as string | number);
  const year = date.getFullYear();
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

function transactionYear(transaction: Record<string, unknown>): number | null {
  return toHistoricalYear(transaction.closedDate)
    ?? toHistoricalYear(transaction.contractDate)
    ?? (typeof transaction.year === 'number' && transaction.year >= 2000 && transaction.year <= 2100
      ? transaction.year
      : null);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (!CRON_SECRET || secret !== CRON_SECRET) return jsonError(401, 'Unauthorized');

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== CONFIRMATION) {
    return jsonError(400, 'Explicit all-years rebuild confirmation is required');
  }

  const maintenanceRef = adminDb.collection('systemMaintenance').doc('historicalRollupRebuild');
  const startedAt = new Date().toISOString();

  try {
    const transactionSnapshot = await adminDb.collection('transactions').get();
    const years = [...new Set(
      transactionSnapshot.docs
        .map((doc) => transactionYear(doc.data() as Record<string, unknown>))
        .filter((year): year is number => year !== null)
    )].sort((a, b) => a - b);

    if (years.length === 0) {
      return NextResponse.json({ ok: true, years: [], totalRebuilt: 0, message: 'No historical transaction years found' });
    }

    await maintenanceRef.set({
      status: 'running',
      startedAt,
      years,
      requestedBy: 'secured-maintenance-route',
    }, { merge: true });

    const results: Array<{ year: number; rebuilt: number }> = [];
    for (const year of years) {
      const result = await rebuildAllRollupsForYear(adminDb, year);
      results.push({ year, rebuilt: result.rebuilt });
    }

    const completedAt = new Date().toISOString();
    const totalRebuilt = results.reduce((sum, result) => sum + result.rebuilt, 0);
    await maintenanceRef.set({
      status: 'completed',
      startedAt,
      completedAt,
      years,
      results,
      totalRebuilt,
    }, { merge: true });

    return NextResponse.json({ ok: true, years, results, totalRebuilt, startedAt, completedAt });
  } catch (error: any) {
    await maintenanceRef.set({
      status: 'failed',
      startedAt,
      failedAt: new Date().toISOString(),
      error: error?.message || 'Unknown error',
    }, { merge: true }).catch(() => undefined);
    console.error('[rebuild-historical-rollups]', error);
    return jsonError(500, error?.message || 'Historical rollup rebuild failed');
  }
}
