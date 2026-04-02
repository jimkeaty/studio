/**
 * GET /api/historical-stats?year=2025&viewAs=<uid>
 *
 * Returns the agent's actual historical performance stats for a given year:
 * - Average net commission per closing (from transactions)
 * - Conversion rates (from daily logs)
 * - Total closings, net earned, volume
 *
 * Used by the Business Plan page to show a "Last Year's Reference" box
 * so agents can fill in their Advanced Assumptions using real numbers.
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

    // ── Transactions: avg net commission ─────────────────────────────────────
    const txSnap = await adminDb
      .collection('transactions')
      .where('agentId', '==', uid)
      .where('year', '==', year)
      .get();

    let netEarned = 0;
    let closedUnits = 0;
    let totalVolume = 0;

    for (const doc of txSnap.docs) {
      const tx = doc.data();
      const status = (tx.status ?? '').toLowerCase();
      if (['closed', 'sold'].includes(status)) {
        const agentNet = n(
          tx.splitSnapshot?.agentNetCommission ??
          tx.splitSnapshot?.agentDollar ??
          tx.commission
        );
        netEarned += agentNet;
        closedUnits += 1;
        totalVolume += n(tx.salePrice ?? tx.listPrice);
      }
    }

    const avgNetCommission = closedUnits > 0 ? Math.round(netEarned / closedUnits) : null;

    // ── Daily Logs: conversion rates ─────────────────────────────────────────
    const logsSnap = await adminDb
      .collection('dailyLogs')
      .where('userId', '==', uid)
      .get();

    let calls = 0;
    let engagements = 0;
    let appointmentsSet = 0;
    let appointmentsHeld = 0;
    let contractsWritten = 0;
    let logClosings = 0;

    for (const doc of logsSnap.docs) {
      const d = doc.data();
      const logDate = d.date ? new Date(d.date) : null;
      if (!logDate) continue;
      if (logDate.getUTCFullYear() !== year) continue;
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
      avgNetCommission,
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
