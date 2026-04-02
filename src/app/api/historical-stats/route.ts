/**
 * GET /api/historical-stats?year=2025&viewAs=<uid>
 *
 * Returns the agent's actual historical performance stats for a given year:
 * - Average net commission per closing (from transactions)
 * - Average sale price, avg commission %, avg net take-home %
 * - Conversion rates (from daily logs)
 * - Monthly seasonality for the requested year
 * - All-time seasonality (across all years of transaction data)
 *
 * Used by the Business Plan page to show a "Last Year's Reference" box
 * and to power the Monthly Goals section with seasonality distribution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return isFinite(x) ? x : fallback;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  const r = numerator / denominator;
  return isFinite(r) ? Math.round(r * 1000) / 10 : null; // returns as percentage (0-100)
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const viewAs = searchParams.get('viewAs');

    const token = extractBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    let uid = decoded.uid;

    if (viewAs) {
      const callerIsAdmin = await isAdminLike(decoded.uid);
      if (!callerIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      uid = viewAs;
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear() - 1;

    // ── All transactions for this agent (all years) ───────────────────────────
    const allTxSnap = await adminDb
      .collection('transactions')
      .where('agentId', '==', uid)
      .get();

    // Per-year and per-month accumulators
    let netEarned = 0;
    let closedUnits = 0;
    let totalVolume = 0;
    let totalGCI = 0;

    // Monthly buckets for the requested year (seasonality)
    const yearMonthVolume: number[] = Array(12).fill(0);
    const yearMonthSales: number[] = Array(12).fill(0);

    // All-time monthly buckets
    const allTimeMonthVolume: number[] = Array(12).fill(0);
    const allTimeMonthSales: number[] = Array(12).fill(0);

    for (const doc of allTxSnap.docs) {
      const tx = doc.data();
      const status = (tx.status ?? '').toLowerCase();
      if (!['closed', 'sold'].includes(status)) continue;

      const agentNet = n(
        tx.splitSnapshot?.agentNetCommission ??
        tx.splitSnapshot?.agentDollar ??
        tx.commission
      );
      const gci = n(
        tx.splitSnapshot?.grossCommission ??
        tx.splitSnapshot?.grossCommissionAmount ??
        tx.gci ??
        tx.commission
      );
      const vol = n(tx.salePrice ?? tx.listPrice);

      // Determine closed month
      let closedMonth: number | null = null;
      if (tx.closedDate) {
        const d = new Date(tx.closedDate);
        if (!isNaN(d.getTime())) closedMonth = d.getMonth(); // 0-indexed
      }

      // All-time buckets
      if (closedMonth !== null) {
        allTimeMonthVolume[closedMonth] += vol;
        allTimeMonthSales[closedMonth] += 1;
      }

      // Requested year buckets
      const txYear = n(tx.year ?? (tx.closedDate ? new Date(tx.closedDate).getFullYear() : 0));
      if (txYear === year) {
        netEarned += agentNet;
        closedUnits += 1;
        totalVolume += vol;
        totalGCI += gci;

        if (closedMonth !== null) {
          yearMonthVolume[closedMonth] += vol;
          yearMonthSales[closedMonth] += 1;
        }
      }
    }

    const avgNetCommission = closedUnits > 0 ? Math.round(netEarned / closedUnits) : null;
    const avgSalePrice = closedUnits > 0 ? Math.round(totalVolume / closedUnits) : null;
    // avgCommissionPct = GCI / Volume (e.g. 2.8%)
    const avgCommissionPct = totalVolume > 0 ? Math.round((totalGCI / totalVolume) * 100000) / 1000 : null;
    // avgNetPct = agent net / GCI (e.g. 70%)
    const avgNetPct = totalGCI > 0 ? Math.round((netEarned / totalGCI) * 1000) / 10 : null;

    // Build seasonality for the requested year
    const yearTotalVolume = yearMonthVolume.reduce((s, v) => s + v, 0);
    const yearTotalSales = yearMonthSales.reduce((s, v) => s + v, 0);
    const seasonality = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i],
      volumePct: yearTotalVolume > 0 ? Math.round((yearMonthVolume[i] / yearTotalVolume) * 1000) / 10 : 8.33,
      salesPct: yearTotalSales > 0 ? Math.round((yearMonthSales[i] / yearTotalSales) * 1000) / 10 : 8.33,
    }));

    // Build all-time seasonality
    const allTimeTotalVolume = allTimeMonthVolume.reduce((s, v) => s + v, 0);
    const allTimeTotalSales = allTimeMonthSales.reduce((s, v) => s + v, 0);
    const allTimeSeasonality = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i],
      volumePct: allTimeTotalVolume > 0 ? Math.round((allTimeMonthVolume[i] / allTimeTotalVolume) * 1000) / 10 : 8.33,
      salesPct: allTimeTotalSales > 0 ? Math.round((allTimeMonthSales[i] / allTimeTotalSales) * 1000) / 10 : 8.33,
    }));

    // ── Daily Logs: conversion rates ─────────────────────────────────────────
    const logsSnap = await adminDb
      .collection('daily_activity')
      .where('agentId', '==', uid)
      .get();

    let calls = 0;
    let engagements = 0;
    let appointmentsSet = 0;
    let appointmentsHeld = 0;
    let contractsWritten = 0;
    let logClosings = 0;

    for (const doc of logsSnap.docs) {
      const d = doc.data();
      // doc ID format: {uid}_{YYYY-MM-DD} — extract year from ID
      const docId = doc.id;
      const datePart = docId.includes('_') ? docId.split('_').slice(1).join('_') : '';
      const logYear = datePart ? parseInt(datePart.substring(0, 4), 10) : 0;
      if (logYear !== year) continue;

      calls += n(d.callsCount);
      engagements += n(d.engagementsCount);
      appointmentsSet += n(d.appointmentsSetCount);
      appointmentsHeld += n(d.appointmentsHeldCount);
      contractsWritten += n(d.contractsWrittenCount);
      logClosings += n(d.closingsCount);
    }

    // Use transaction closings as the authoritative count; fall back to log closings
    const closingsForRates = closedUnits > 0 ? closedUnits : logClosings;

    const conversionRates = {
      callToEngagement: safeRate(engagements, calls),
      engagementToAppointmentSet: safeRate(appointmentsSet, engagements),
      appointmentSetToHeld: safeRate(appointmentsHeld, appointmentsSet),
      appointmentHeldToContract: safeRate(contractsWritten, appointmentsHeld),
      contractToClosing: safeRate(closingsForRates, contractsWritten),
    };

    const hasData =
      closedUnits > 0 ||
      calls > 0 ||
      engagements > 0 ||
      appointmentsSet > 0 ||
      appointmentsHeld > 0;

    return NextResponse.json({
      year,
      hasData,
      closedUnits,
      netEarned,
      totalVolume,
      totalGCI,
      avgNetCommission,
      avgSalePrice,
      avgCommissionPct,
      avgNetPct,
      seasonality,
      allTimeSeasonality,
      allTimeHasData: allTimeTotalSales > 0,
      activityTotals: {
        calls,
        engagements,
        appointmentsSet,
        appointmentsHeld,
        contractsWritten,
        closings: closingsForRates,
      },
      conversionRates,
    });
  } catch (err) {
    console.error('[/api/historical-stats] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
