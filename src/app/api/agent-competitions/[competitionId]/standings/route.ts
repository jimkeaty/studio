// GET /api/agent-competitions/[id]/standings
// Computes live standings for a peer competition.
// Supports: Standard, Golf (threshold), NASCAR (points), and Team modes (scramble/combined/average).
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

function applyGolfThreshold(dailyValues: number[], rules: any[]): number {
  let total = 0;
  for (const val of dailyValues) {
    const rule = rules.find(r => {
      const aboveMin = val >= r.min;
      const belowMax = r.max === null || r.max === undefined ? true : val <= r.max;
      return aboveMin && belowMax;
    });
    if (rule) total += rule.score;
  }
  return total;
}

const MEDAL_COLORS = ['#f59e0b', '#9ca3af', '#b45309', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];
const TEAM_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ── Fetch raw daily values for one agent ──────────────────────────────────────
async function fetchAgentDailyMap(
  agentId: string,
  metric: string,
  startDate: string,
  effectiveEnd: string,
): Promise<Record<string, number>> {
  const isTransactionMetric = ['closed_deals', 'pending_deals', 'closed_volume', 'total_units'].includes(metric);
  const dailyMap: Record<string, number> = {};

  if (isTransactionMetric) {
    const [snap1, snap2] = await Promise.all([
      adminDb.collection('transactions').where('agentId', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
      adminDb.collection('transactions').where('agentFirebaseUid', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
    ]);
    const txDocs = new Map<string, any>();
    for (const d of [...snap1.docs, ...snap2.docs]) txDocs.set(d.id, d.data());
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
  } else {
    const snap = await adminDb.collection('daily_activity').where('agentId', '==', agentId).where('date', '>=', startDate).where('date', '<=', effectiveEnd).get();
    const field = metricField(metric);
    for (const doc of snap.docs) {
      const d = doc.data();
      const date = (d.date || '').slice(0, 10);
      if (!date) continue;
      dailyMap[date] = (dailyMap[date] || 0) + num(d[field]);
    }
  }
  return dailyMap;
}

// ── Fetch NASCAR activity maps for one agent ──────────────────────────────────
async function fetchNascarMaps(agentId: string, startDate: string, effectiveEnd: string) {
  const [snap1, snap2, actSnap] = await Promise.all([
    adminDb.collection('transactions').where('agentId', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
    adminDb.collection('transactions').where('agentFirebaseUid', '==', agentId).where('closeDate', '>=', startDate).where('closeDate', '<=', effectiveEnd).get(),
    adminDb.collection('daily_activity').where('agentId', '==', agentId).where('date', '>=', startDate).where('date', '<=', effectiveEnd).get(),
  ]);
  const txDocs = new Map<string, any>();
  for (const d of [...snap1.docs, ...snap2.docs]) txDocs.set(d.id, d.data());

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
  return { txDailyMap, actDailyMap };
}

function nascarDailyPoints(
  date: string,
  txDailyMap: Record<string, { closed: number; pending: number }>,
  actDailyMap: Record<string, { engagements: number; apptHeld: number; contracts: number }>,
  pointRules: any,
): number {
  const tx = txDailyMap[date] || { closed: 0, pending: 0 };
  const act = actDailyMap[date] || { engagements: 0, apptHeld: 0, contracts: 0 };
  return (
    tx.closed * num(pointRules?.closedDeal ?? 40) +
    tx.pending * num(pointRules?.pendingDeal ?? 15) +
    act.engagements * num(pointRules?.engagementPoint ?? 1) +
    act.apptHeld * num(pointRules?.appointmentHeldPoint ?? 5) +
    act.contracts * num(pointRules?.contractWrittenPoint ?? 10)
  );
}

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
    const isTeamComp: boolean = !!comp.isTeamCompetition;
    const teamScoringMethod: string = comp.teamScoringMethod || 'combined';
    const teamFormation: string = comp.teamFormation || 'creator_assigned';
    const storedTeams: any[] = comp.teams || [];
    const teamIdentities: Record<string, any> = comp.teamIdentities || {};

    const today = new Date().toISOString().slice(0, 10);
    const effectiveEnd = endDate < today ? endDate : today;
    const dates = dateRange(startDate, effectiveEnd);
    const isGolf = format === 'golf';
    const isNascar = format === 'nascar';

    // ── 1. Compute per-agent raw daily maps ───────────────────────────────────
    type AgentData = {
      agentId: string;
      displayName: string;
      dailyMap: Record<string, number>; // raw KPI value per day
      nascarTxMap?: Record<string, { closed: number; pending: number }>;
      nascarActMap?: Record<string, { engagements: number; apptHeld: number; contracts: number }>;
    };

    const agentDataList: AgentData[] = await Promise.all(
      participantIds.map(async (agentId: string) => {
        const displayName = participantNames?.[agentId] || agentId;
        if (isNascar) {
          const { txDailyMap, actDailyMap } = await fetchNascarMaps(agentId, startDate, effectiveEnd);
          // Build a "points per day" map for NASCAR
          const dailyMap: Record<string, number> = {};
          for (const date of dates) {
            dailyMap[date] = nascarDailyPoints(date, txDailyMap, actDailyMap, pointRules);
          }
          return { agentId, displayName, dailyMap, nascarTxMap: txDailyMap, nascarActMap: actDailyMap };
        } else {
          const dailyMap = await fetchAgentDailyMap(agentId, metric, startDate, effectiveEnd);
          return { agentId, displayName, dailyMap };
        }
      })
    );

    // ── 2. Compute individual standings (always needed for drill-down) ─────────
    const individualStandings = agentDataList.map((ad, i) => {
      let total = 0;
      let todayValue = 0;
      const dailyBreakdown: { date: string; value: number; cumulative: number }[] = [];
      let cumulative = 0;
      for (const date of dates) {
        const value = ad.dailyMap[date] || 0;
        cumulative += value;
        dailyBreakdown.push({ date, value, cumulative });
        if (date === today) todayValue = value;
      }
      total = cumulative;

      // Golf: override total with threshold score
      let golfScore: number | undefined;
      if (isGolf && thresholdRules.length > 0) {
        golfScore = applyGolfThreshold(dailyBreakdown.map(d => d.value), thresholdRules);
        total = golfScore;
      }

      const identity = teamIdentities[ad.agentId] || {};
      return {
        agentId: ad.agentId,
        displayName: ad.displayName,
        position: 0,
        total,
        todayValue,
        dailyBreakdown,
        color: MEDAL_COLORS[i % MEDAL_COLORS.length],
        teamName: identity.teamName || null,
        mascot: identity.mascot || null,
        teamColor: identity.color || null,
        ...(golfScore !== undefined ? { golfScore } : {}),
      };
    });

    // Sort individual standings
    if (isGolf) {
      individualStandings.sort((a, b) => a.total - b.total);
    } else {
      individualStandings.sort((a, b) => b.total - a.total);
    }
    individualStandings.forEach((s, i) => { s.position = i + 1; s.color = MEDAL_COLORS[i % MEDAL_COLORS.length]; });

    // ── 3. If team competition, compute team standings ─────────────────────────
    if (isTeamComp) {
      // Resolve teams: use storedTeams for creator_assigned, or group by teamName for self_selected
      let resolvedTeams: { teamId: string; teamName: string; mascot: string; color: string; memberIds: string[] }[] = [];

      if (teamFormation === 'creator_assigned' && storedTeams.length > 0) {
        resolvedTeams = storedTeams.map(t => ({
          teamId: t.teamId || t.teamName,
          teamName: t.teamName || 'Team',
          mascot: t.mascot || '🏆',
          color: t.color || '#3b82f6',
          memberIds: t.memberIds || [],
        }));
      } else {
        // self_selected: group agents by their teamIdentity.teamName
        const teamMap: Record<string, { teamId: string; teamName: string; mascot: string; color: string; memberIds: string[] }> = {};
        for (const agentId of participantIds) {
          const identity = teamIdentities[agentId] || {};
          const tName = identity.teamName || 'Unassigned';
          if (!teamMap[tName]) {
            teamMap[tName] = {
              teamId: tName,
              teamName: tName,
              mascot: identity.mascot || '🏆',
              color: identity.color || '#3b82f6',
              memberIds: [],
            };
          }
          teamMap[tName].memberIds.push(agentId);
        }
        resolvedTeams = Object.values(teamMap);
      }

      // Compute team score per day using the selected method
      const teamStandings = resolvedTeams.map((team, ti) => {
        const memberData = agentDataList.filter(ad => team.memberIds.includes(ad.agentId));
        if (memberData.length === 0) return null;

        const dailyBreakdown: { date: string; value: number; cumulative: number; memberValues: Record<string, number> }[] = [];
        let cumulative = 0;
        let todayValue = 0;

        for (const date of dates) {
          const memberValues: Record<string, number> = {};
          for (const md of memberData) {
            memberValues[md.agentId] = md.dailyMap[date] || 0;
          }
          const values = Object.values(memberValues);

          let dayScore = 0;
          if (teamScoringMethod === 'scramble') {
            // Best ball: highest individual value that day
            dayScore = Math.max(...values, 0);
          } else if (teamScoringMethod === 'average') {
            dayScore = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          } else {
            // combined (default): sum of all members
            dayScore = values.reduce((a, b) => a + b, 0);
          }

          cumulative += dayScore;
          if (date === today) todayValue = dayScore;
          dailyBreakdown.push({ date, value: dayScore, cumulative, memberValues });
        }

        let total = cumulative;

        // Golf threshold scoring on team daily values
        let golfScore: number | undefined;
        if (isGolf && thresholdRules.length > 0) {
          golfScore = applyGolfThreshold(dailyBreakdown.map(d => d.value), thresholdRules);
          total = golfScore;
        }

        // Member individual summaries for drill-down
        const memberSummaries = memberData.map(md => {
          const indiv = individualStandings.find(s => s.agentId === md.agentId);
          return {
            agentId: md.agentId,
            displayName: md.displayName,
            total: indiv?.total || 0,
            todayValue: indiv?.todayValue || 0,
          };
        });

        return {
          teamId: team.teamId,
          teamName: team.teamName,
          mascot: team.mascot,
          color: team.color || TEAM_COLORS[ti % TEAM_COLORS.length],
          position: 0,
          total,
          todayValue,
          dailyBreakdown,
          memberIds: team.memberIds,
          memberSummaries,
          ...(golfScore !== undefined ? { golfScore } : {}),
        };
      }).filter(Boolean) as any[];

      // Sort team standings
      if (isGolf) {
        teamStandings.sort((a, b) => a.total - b.total);
      } else {
        teamStandings.sort((a, b) => b.total - a.total);
      }
      teamStandings.forEach((s, i) => { s.position = i + 1; });

      const topTotal = teamStandings[0]?.total || 0;

      return NextResponse.json({
        ok: true,
        competition: { id: compDoc.id, ...comp },
        isTeamCompetition: true,
        teamScoringMethod,
        teamStandings,
        standings: individualStandings, // individual drill-down always available
        summary: {
          totalParticipants: participantIds.length,
          totalTeams: teamStandings.length,
          topTotal,
          today,
        },
      });
    }

    // ── 4. Individual competition response ─────────────────────────────────────
    const topTotal = individualStandings[0]?.total || 0;

    return NextResponse.json({
      ok: true,
      competition: { id: compDoc.id, ...comp },
      isTeamCompetition: false,
      standings: individualStandings,
      summary: {
        totalParticipants: individualStandings.length,
        topTotal,
        today,
      },
    });
  } catch (err: any) {
    console.error('[api/agent-competitions standings]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
