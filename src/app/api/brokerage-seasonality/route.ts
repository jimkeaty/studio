/**
 * GET /api/brokerage-seasonality?year=2025
 *
 * Returns brokerage-wide monthly closing seasonality for a given year
 * (and all-time across all years), computed from all closed transactions
 * in the system — excluding demo accounts.
 *
 * Accessible by any authenticated user (agents and admins alike) so that
 * agents without personal transaction history can use brokerage seasonality
 * as a baseline for their business plan.
 *
 * Response:
 * {
 *   year: number,
 *   hasData: boolean,
 *   seasonality: SeasonalityMonth[],          // requested year
 *   allTimeSeasonality: SeasonalityMonth[],   // all years combined
 *   allTimeHasData: boolean,
 *   totalClosings: number,                    // brokerage closings in requested year
 *   allTimeClosings: number,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return isFinite(x) ? x : fallback;
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth: any authenticated user may call this ───────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7).trim();
    await adminAuth.verifyIdToken(token); // just verify — no role check needed

    // ── Params ───────────────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear() - 1;

    // ── Fetch demo account IDs to exclude ────────────────────────────────────
    const demoSnap = await adminDb
      .collection('agentProfiles')
      .where('isDemoAccount', '==', true)
      .get();
    const demoAgentIds = new Set(
      demoSnap.docs.map(d => String(d.data().agentId || d.id))
    );

    // ── Fetch all closed transactions (all years) ────────────────────────────
    // We query by status=closed to keep the result set focused
    const txSnap = await adminDb
      .collection('transactions')
      .where('status', '==', 'closed')
      .get();

    // Monthly buckets
    const yearMonthSales: number[] = Array(12).fill(0);
    const yearMonthVolume: number[] = Array(12).fill(0);
    const allTimeMonthSales: number[] = Array(12).fill(0);
    const allTimeMonthVolume: number[] = Array(12).fill(0);

    let totalClosings = 0;
    let allTimeClosings = 0;

    for (const doc of txSnap.docs) {
      const tx = doc.data() as Record<string, unknown>;

      // Skip demo agents
      const agentId = String(tx.agentId ?? '');
      if (demoAgentIds.has(agentId)) continue;

      // Determine closed month
      let closedMonth: number | null = null;
      if (tx.closedDate) {
        const d = new Date(String(tx.closedDate));
        if (!isNaN(d.getTime())) closedMonth = d.getMonth(); // 0-indexed
      }
      if (closedMonth === null) continue;

      const vol = n(tx.salePrice ?? tx.listPrice);
      const txYear = n(tx.year ?? (tx.closedDate ? new Date(String(tx.closedDate)).getFullYear() : 0));

      // All-time buckets
      allTimeMonthSales[closedMonth] += 1;
      allTimeMonthVolume[closedMonth] += vol;
      allTimeClosings += 1;

      // Requested year buckets
      if (txYear === year) {
        yearMonthSales[closedMonth] += 1;
        yearMonthVolume[closedMonth] += vol;
        totalClosings += 1;
      }
    }

    // ── Build seasonality arrays ─────────────────────────────────────────────
    const yearTotalSales = yearMonthSales.reduce((s, v) => s + v, 0);
    const yearTotalVolume = yearMonthVolume.reduce((s, v) => s + v, 0);

    const seasonality = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i],
      salesPct: yearTotalSales > 0
        ? Math.round((yearMonthSales[i] / yearTotalSales) * 1000) / 10
        : 8.33,
      volumePct: yearTotalVolume > 0
        ? Math.round((yearMonthVolume[i] / yearTotalVolume) * 1000) / 10
        : 8.33,
    }));

    const allTimeTotalSales = allTimeMonthSales.reduce((s, v) => s + v, 0);
    const allTimeTotalVolume = allTimeMonthVolume.reduce((s, v) => s + v, 0);

    const allTimeSeasonality = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i],
      salesPct: allTimeTotalSales > 0
        ? Math.round((allTimeMonthSales[i] / allTimeTotalSales) * 1000) / 10
        : 8.33,
      volumePct: allTimeTotalVolume > 0
        ? Math.round((allTimeMonthVolume[i] / allTimeTotalVolume) * 1000) / 10
        : 8.33,
    }));

    return NextResponse.json({
      year,
      hasData: totalClosings > 0,
      seasonality,
      allTimeSeasonality,
      allTimeHasData: allTimeClosings > 0,
      totalClosings,
      allTimeClosings,
    });
  } catch (err) {
    console.error('[brokerage-seasonality] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
