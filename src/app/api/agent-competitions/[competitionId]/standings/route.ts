// GET /api/agent-competitions/[id]/standings
// Computes live standings for a peer competition based on daily_activity + transactions.
// Supports Standard (raw total), Golf (threshold scoring, asc), and NASCAR (points, desc).
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}
function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
type RouteContext = { params: Promise<{ competitionId: string }> };

/** Map metric key to daily_activity field name */
function metricField(metric: string): string {
  switch (metric) {
    case 'appointments_set':  return 'appointmentsSetCount';
    case 'appointments_held': return 'appointmentsHeldCount';
    case 'engagements':       return 'engagementsCount';
    case 'calls':             return 'callsCount';
    case 'contracts_written': return 'contractsWrittenCount';
    default:                  return metric;
  }
}

/** Generate YYYY-MM-DD strings from start to end inclusive */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  while (d <= e) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Golf threshold scoring:
 * For each day, find the matching threshold rule and add its score.
 * Lower total score wins (ascending sort).
 * Rules: { min, max (null = unlimited), score, label, emoji }
 */
function applyGolfThreshold(dailyValues: number[], rules: any[]): number {
  let total = 0;
  for (const val of dailyValues) {
    // Find matching rule
    const rule = rules.find(r => {
      const aboveMin = val >= r.min;
      const belowMax = r.max === null || r.max === undefined ? true : val <= r.max;
      return aboveMin && belowMax;
    });
    if (rule) total += rule.score;
  }
  return total;
}

/**
 * NASCAR points scoring:
 * Points are awarded per activity type. Highest total wins.
 * pointRules: { closedDeal, pendingDeal, engagementPoint, appointmentHeldPoint, contractWrittenPoint }
 */
function computeNascarPoints(
  dailyMap: Record<string, number>,
  txDailyMap: Record<string, { closed: number; pending: number }>,
  actDailyMap: Record<string, { engagements: number; apptHeld: number; contracts: number }>,
  dates: string[],
  pointRules: any,
): { total: number; todayValue: number; dailyBreakdown: { date: string; value: number; cumulative: number }[] } {
  const today = new Date().toISOString().slice(0, 10);
  let cumulative = 0;
  let todayValue = 0;
  const dailyBreakdown: { date: string; value: number; cumulative: number }[] = [];

  for (const date of dates) {
    const tx = txDailyMap[date] || { closed: 0, pending: 0 };
    const act = actDailyMap[date] || { engagements: 0, apptHeld: 0, contracts: 0 };
    const pts =
      tx.closed * num(pointRules?.closedDeal ?? 40) +
      tx.pending * num(pointRules?.pendingDeal ?? 15) +
      act.engagements * num(pointRules?.engagementPoint ?? 1) +
      act.apptHeld * num(pointRules?.appointmentHeldPoint ?? 5) +
      act.contracts * num(pointRules?.contractWrittenPoint ?? 10);
    cumulative += pts;
    if (date === today) todayValue = pts;
    dailyBreakdown.push({ date, value: pts, cumulative });
  }
  return { total: cumulative, todayValue, dailyBreakdown };
}

const MEDAL_COLORS = ['#f59e0b', '#9ca3af', '#b45309', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    await adminAuth.verifyIdToken(token);

    const { competitionId } = await ctx.params;
    const compDoc = await adminDb.collection('agentCompetitions').doc(competitionId).get();
    if (!compDoc.exists) return jsonError(404, 'Competition not found');

    const comp = compDoc.data()!;
    const { metric, startDate, endDate, participantIds, participantNames } = comp;
    const format: string = comp.format || 'standard';
    const thresholdRules: any[] = comp.thresholdRules || [];
    const pointRules: any = comp.pointRules || {};

    // Cap end date to today so we don't show future data
    const today = new Date().toISOString().slice(0, 10);
    const effectiveEnd = endDate < today ? endDate : today;
    const dates = dateRange(startDate, effectiveEnd);

    const isTransactionMetric = ['closed_deals', 'pending_deals', 'closed_volume', 'total_units'].includes(metric);
    const isNascar = format === 'nascar';
    const isGolf = format === 'golf';

    // Build standings per participant
    const standings: {
      agentId: string;
      displayName: string;
      position: number;
      total: number;
      todayValue: number;
      dailyBreakdown: { date: string; value: number; cumulative: number }[];
      color: string;
      golfScore?: number;
      nascarPoints?: number;
    }[] = [];

    for (let i = 0; i < participantIds.length; i++) {
      const agentId = participantIds[i];
      const displayName = (participantNames?.[agentId]) || agentId;

      let total = 0;
      let todayValue = 0;
      let golfScore: number | undefined;
      let nascarPoints: number | undefined;
      const dailyBreakdown: { date: string; value: number; cumulative: number }[] = [];

      if (isNascar) {
        // NASCAR: fetch both transactions AND activity to compute points
        const [txSnap, txSnap2, actSnap] = await Promise.all([
          adminDb.collection('transactions').where('agentId', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
          adminDb.collection('transactions').where('agentFirebaseUid', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
          adminDb.collection('daily_activity').where('agentId', '==', agentId).where('date', '>=', startDate).where('date', '<=', effectiveEnd).get(),
        ]);

        const txDocs = new Map<string, any>();
        for (const d of [...txSnap.docs, ...txSnap2.docs]) txDocs.set(d.id, d.data());

        const txDailyMap: Record<string, { closed: number; pending: number }> = {};
        for (const tx of txDocs.values()) {
          const date = (tx.closeDate || '').slice(0, 10);
          if (!date) continue;
          if (!txDailyMap[date]) txDailyMap[date] = { closed: 0, pending: 0 };
          if (tx.status === 'closed') txDailyMap[date].closed++;
          else if (tx.status === 'pending') txDailyMap[date].pending++;
        }

        const actDailyMap: Record<string, { engagements: number; apptHeld: number; contracts: number }> = {};
        for (const doc of actSnap.docs) {
          const d = doc.data();
          const date = (d.date || '').slice(0, 10);
          if (!date) continue;
          if (!actDailyMap[date]) actDailyMap[date] = { engagements: 0, apptHeld: 0, contracts: 0 };
          actDailyMap[date].engagements += num(d.engagementsCount);
          actDailyMap[date].apptHeld += num(d.appointmentsHeldCount);
          actDailyMap[date].contracts += num(d.contractsWrittenCount);
        }

        const result = computeNascarPoints({}, txDailyMap, actDailyMap, dates, pointRules);
        total = result.total;
        todayValue = result.todayValue;
        nascarPoints = result.total;
        dailyBreakdown.push(...result.dailyBreakdown);

      } else if (isTransactionMetric) {
        // Transaction-based metric (closings, volume, total units)
        const [txSnap, txSnap2] = await Promise.all([
          adminDb.collection('transactions').where('agentId', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
          adminDb.collection('transactions').where('agentFirebaseUid', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
        ]);

        const txDocs = new Map<string, any>();
        for (const d of [...txSnap.docs, ...txSnap2.docs]) txDocs.set(d.id, d.data());

        const dailyMap: Record<string, number> = {};
        for (const tx of txDocs.values()) {
          const date = (tx.closeDate || '').slice(0, 10);
          if (!date) continue;
          let val = 0;
          if (metric === 'closed_deals') val = tx.status === 'closed' ? 1 : 0;
          else if (metric === 'pending_deals') val = tx.status === 'pending' ? 1 : 0;
          else if (metric === 'closed_volume') val = tx.status === 'closed' ? num(tx.salePrice || tx.listPrice) : 0;
          else if (metric === 'total_units') val = 1;
          dailyMap[date] = (dailyMap[date] || 0) + val;
        }

        let cumulative = 0;
        for (const date of dates) {
          const value = dailyMap[date] || 0;
          cumulative += value;
          dailyBreakdown.push({ date, value, cumulative });
          if (date === today) todayValue = value;
        }
        total = cumulative;

        // Golf scoring on top of transaction metric
        if (isGolf && thresholdRules.length > 0) {
          const dailyValues = dailyBreakdown.map(d => d.value);
          golfScore = applyGolfThreshold(dailyValues, thresholdRules);
          total = golfScore;
        }

      } else {
        // Activity-based metric (calls, engagements, appointments, contracts)
        const actSnap = await adminDb
          .collection('daily_activity')
          .where('agentId', '==', agentId)
          .where('date', '>=', startDate)
          .where('date', '<=', effectiveEnd)
          .get();

        const field = metricField(metric);
        const dailyMap: Record<string, number> = {};
        for (const doc of actSnap.docs) {
          const d = doc.data();
          const date = (d.date || '').slice(0, 10);
          if (!date) continue;
          dailyMap[date] = (dailyMap[date] || 0) + num(d[field]);
        }

        let cumulative = 0;
        for (const date of dates) {
          const value = dailyMap[date] || 0;
          cumulative += value;
          dailyBreakdown.push({ date, value, cumulative });
          if (date === today) todayValue = value;
        }
        total = cumulative;

        // Golf scoring on top of activity metric
        if (isGolf && thresholdRules.length > 0) {
          const dailyValues = dailyBreakdown.map(d => d.value);
          golfScore = applyGolfThreshold(dailyValues, thresholdRules);
          total = golfScore;
        }
      }

      standings.push({
        agentId,
        displayName,
        position: 0,
        total,
        todayValue,
        dailyBreakdown,
        color: MEDAL_COLORS[i % MEDAL_COLORS.length],
        ...(golfScore !== undefined ? { golfScore } : {}),
        ...(nascarPoints !== undefined ? { nascarPoints } : {}),
      });
    }

    // Sort: Golf = ascending (lower score wins), everything else = descending
    if (isGolf) {
      standings.sort((a, b) => a.total - b.total);
    } else {
      standings.sort((a, b) => b.total - a.total);
    }
    standings.forEach((s, i) => {
      s.position = i + 1;
      s.color = MEDAL_COLORS[i % MEDAL_COLORS.length];
    });

    const topTotal = standings[0]?.total || 0;

    return NextResponse.json({
      ok: true,
      competition: { id: compDoc.id, ...comp },
      standings,
      summary: {
        totalParticipants: standings.length,
        topTotal,
        today,
      },
    });
  } catch (err: any) {
    console.error('[api/agent-competitions standings]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
