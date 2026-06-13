// GET /api/agent-competitions/[id]/standings
// Computes live standings for a peer competition based on daily_activity + transactions.
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

    // Cap end date to today so we don't show future data
    const today = new Date().toISOString().slice(0, 10);
    const effectiveEnd = endDate < today ? endDate : today;

    const isTransactionMetric = ['closed_deals', 'pending_deals', 'closed_volume', 'total_units'].includes(metric);

    // Build standings per participant
    const standings: {
      agentId: string;
      displayName: string;
      position: number;
      total: number;
      todayValue: number;
      dailyBreakdown: { date: string; value: number; cumulative: number }[];
      color: string;
    }[] = [];

    for (let i = 0; i < participantIds.length; i++) {
      const agentId = participantIds[i];
      const displayName = (participantNames?.[agentId]) || agentId;

      let total = 0;
      let todayValue = 0;
      const dailyBreakdown: { date: string; value: number; cumulative: number }[] = [];

      if (isTransactionMetric) {
        // Fetch transactions for this agent in the date range
        const txSnap = await adminDb
          .collection('transactions')
          .where('agentId', '==', agentId)
          .where('closeDate', '>=', startDate)
          .where('closeDate', '<=', effectiveEnd)
          .get();

        // Also try firebaseUid-based query
        const txSnap2 = await adminDb
          .collection('transactions')
          .where('agentFirebaseUid', '==', agentId)
          .where('closeDate', '>=', startDate)
          .where('closeDate', '<=', effectiveEnd)
          .get();

        const txDocs = new Map<string, any>();
        for (const d of [...txSnap.docs, ...txSnap2.docs]) txDocs.set(d.id, d.data());

        // Build daily map
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
        for (const date of dateRange(startDate, effectiveEnd)) {
          const value = dailyMap[date] || 0;
          cumulative += value;
          dailyBreakdown.push({ date, value, cumulative });
          if (date === today) todayValue = value;
        }
        total = cumulative;
      } else {
        // Fetch daily_activity for this agent in the date range
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
        for (const date of dateRange(startDate, effectiveEnd)) {
          const value = dailyMap[date] || 0;
          cumulative += value;
          dailyBreakdown.push({ date, value, cumulative });
          if (date === today) todayValue = value;
        }
        total = cumulative;
      }

      standings.push({
        agentId,
        displayName,
        position: 0,
        total,
        todayValue,
        dailyBreakdown,
        color: MEDAL_COLORS[i % MEDAL_COLORS.length],
      });
    }

    // Sort descending by total
    standings.sort((a, b) => b.total - a.total);
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
