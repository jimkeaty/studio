// GET /api/competitions/[competitionId]/standings — compute & return standings
// Supports both threshold_map (golf) and points (nascar) scoring strategies.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  CompetitionConfig,
  ThresholdRule,
  ParticipantStanding,
  ScoreEvent,
  DailyScore,
  ScoreGrouping,
} from '@/lib/competitions/types';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// ── Helpers ──────────────────────────────────────────────────────────────────

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Map config.metric to the Firestore field name on daily_activity docs. */
function metricFieldName(metric: string): string {
  switch (metric) {
    case 'appointments_set':  return 'appointmentsSetCount';
    case 'appointments_held': return 'appointmentsHeldCount';
    case 'engagements':       return 'engagementsCount';
    case 'calls':             return 'callsCount';
    case 'contracts_written': return 'contractsWrittenCount';
    default:                  return metric;
  }
}

/** Scoring colors palette -- assigned to participants by index. */
const COLORS = [
  '#e11d48','#2563eb','#16a34a','#d97706','#7c3aed',
  '#0891b2','#db2777','#65a30d','#ea580c','#6366f1',
  '#0d9488','#c026d3','#ca8a04','#dc2626','#2dd4bf',
  '#f97316','#8b5cf6','#14b8a6','#f43f5e','#3b82f6',
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Generate date strings from startDate to endDate (inclusive). */
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

// ── Threshold scoring helpers (golf) ─────────────────────────────────────────

function scoreFromThresholds(value: number, rules: ThresholdRule[]): { score: number; label: string; emoji: string } {
  // Rules should be sorted, but we iterate to find the matching bucket.
  for (const rule of rules) {
    const withinMin = value >= rule.min;
    const withinMax = rule.max === null || rule.max === undefined || value <= rule.max;
    if (withinMin && withinMax) {
      return { score: rule.score, label: rule.label, emoji: rule.emoji || '' };
    }
  }
  // Fallback: no matching rule -- return 0
  return { score: 0, label: 'No match', emoji: '' };
}

// ── Types for route context ──────────────────────────────────────────────────

type RouteContext = { params: Promise<{ competitionId: string }> };

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { competitionId } = await ctx.params;
    const isPublic = req.nextUrl.searchParams.get('public') === 'true';

    // ── 0. Auth check — skip for public=true on active competitions ─────
    if (!isPublic) {
      const token = bearer(req);
      if (!token) return jsonError(401, 'Missing token');
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden');
    }

    // ── 1. Load competition config ──────────────────────────────────────
    const compDoc = await adminDb.collection('competitions').doc(competitionId).get();
    if (!compDoc.exists) return jsonError(404, 'Competition not found');
    const config = compDoc.data()!.config as CompetitionConfig;

    // If public access requested, only allow for active/completed competitions
    if (isPublic && config.status !== 'active' && config.status !== 'completed') {
      return jsonError(403, 'Public access is only available for active or completed competitions');
    }

    // ── 2. Fetch active agents ──────────────────────────────────────────
    const profileSnap = await adminDb.collection('agentProfiles').get();
    const agents: { id: string; displayName: string; teamName: string | null }[] = [];
    for (const doc of profileSnap.docs) {
      const d = doc.data();
      if (d.status && d.status !== 'active') continue;
      agents.push({
        id: d.agentId || doc.id,
        displayName: d.displayName || d.name || doc.id,
        teamName: d.teamName || null,
      });
    }

    // ── 3. Route to scoring strategy ────────────────────────────────────
    let standings: ParticipantStanding[];

    if (config.scoringStrategy === 'threshold_map') {
      standings = await scoreThresholdMap(config, agents);
    } else if (config.scoringStrategy === 'points') {
      standings = await scorePoints(config, agents);
    } else {
      return jsonError(400, `Unsupported scoring strategy: ${config.scoringStrategy}`);
    }

    // ── 4. Sort by rankingDirection ─────────────────────────────────────
    const dir = config.rankingDirection === 'asc' ? 1 : -1;
    standings.sort((a, b) => (a.totalScore - b.totalScore) * dir);

    // ── 5. Assign positions, movement, distanceFromLeader ───────────────
    const leaderScore = standings[0]?.totalScore ?? 0;
    for (let i = 0; i < standings.length; i++) {
      standings[i].position = i + 1;
      standings[i].distanceFromLeader = Math.abs(standings[i].totalScore - leaderScore);
      standings[i].color = COLORS[i % COLORS.length];
      standings[i].avatarNumber = i + 1;
    }

    // ── 6. Group participants ───────────────────────────────────────────
    const groupCounts: Record<string, number> = {};
    if (config.groupings && config.groupings.length > 0) {
      for (const p of standings) {
        const group = assignGroup(p.totalScore, config.groupings);
        if (group) {
          p.groupId = group.id;
          groupCounts[group.id] = (groupCounts[group.id] || 0) + 1;
        }
      }
    }

    // ── 7. Build summary ────────────────────────────────────────────────
    const scores = standings.map((s) => s.totalScore);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const topScore = leaderScore;

    return NextResponse.json({
      ok: true,
      competition: { id: competitionId, config },
      standings,
      summary: {
        totalParticipants: standings.length,
        avgScore: Math.round(avgScore * 100) / 100,
        topScore,
        groupCounts: Object.keys(groupCounts).length > 0 ? groupCounts : undefined,
      },
    });
  } catch (err: any) {
    console.error('[api/competitions/standings GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── Assign group helper ──────────────────────────────────────────────────────

function assignGroup(score: number, groupings: ScoreGrouping[]): ScoreGrouping | null {
  for (const g of groupings) {
    if (g.condition === 'lt' && score < g.threshold) return g;
    if (g.condition === 'eq' && score === g.threshold) return g;
    if (g.condition === 'gt' && score > g.threshold) return g;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THRESHOLD_MAP scoring (Golf)
// ═══════════════════════════════════════════════════════════════════════════════

async function scoreThresholdMap(
  config: CompetitionConfig,
  agents: { id: string; displayName: string; teamName: string | null }[],
): Promise<ParticipantStanding[]> {
  const rules = config.thresholdRules || [];
  const field = metricFieldName(config.metric);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Clamp endDate to today so we don't score future days
  const effectiveEnd = config.endDate < todayStr ? config.endDate : todayStr;
  const dates = dateRange(config.startDate, effectiveEnd);

  // ── Fetch daily_activity for the date range ─────────────────────────
  const actSnap = await adminDb.collection('daily_activity')
    .where('date', '>=', config.startDate)
    .where('date', '<=', effectiveEnd)
    .get();

  // Index: agentId -> date -> metric value
  const actMap = new Map<string, Map<string, number>>();
  for (const doc of actSnap.docs) {
    const d = doc.data();
    const aid = d.agentId;
    if (!aid) continue;
    if (!actMap.has(aid)) actMap.set(aid, new Map());
    actMap.get(aid)!.set(d.date, num(d[field]));
  }

  // ── For transaction-based metrics, we need transactions too ─────────
  let txByAgentDate: Map<string, Map<string, number>> | null = null;
  if (['closed_deals', 'pending_deals', 'closed_volume', 'total_units'].includes(config.metric)) {
    txByAgentDate = new Map();
    const txSnap = await adminDb.collection('transactions')
      .where('year', '==', config.year)
      .get();
    for (const doc of txSnap.docs) {
      const t = doc.data();
      const aid = t.agentId;
      if (!aid) continue;
      const closedDate = toDate(t.closedDate || t.closingDate);
      const contractDate = toDate(t.contractDate);
      const txDate = closedDate || contractDate;
      if (!txDate) continue;
      const dateStr = txDate.toISOString().slice(0, 10);
      if (dateStr < config.startDate || dateStr > effectiveEnd) continue;

      if (!txByAgentDate.has(aid)) txByAgentDate.set(aid, new Map());
      const agentDates = txByAgentDate.get(aid)!;
      const existing = agentDates.get(dateStr) || 0;

      if (config.metric === 'closed_deals' && t.status === 'closed') {
        agentDates.set(dateStr, existing + 1);
      } else if (config.metric === 'pending_deals' && (t.status === 'pending' || t.status === 'under_contract')) {
        agentDates.set(dateStr, existing + 1);
      } else if (config.metric === 'closed_volume' && t.status === 'closed') {
        agentDates.set(dateStr, existing + num(t.dealValue));
      } else if (config.metric === 'total_units' && (t.status === 'closed' || t.status === 'pending' || t.status === 'under_contract')) {
        agentDates.set(dateStr, existing + 1);
      }
    }
  }

  // ── Score each agent ────────────────────────────────────────────────
  const standings: ParticipantStanding[] = [];

  for (const agent of agents) {
    const agentAct = actMap.get(agent.id) || new Map<string, number>();
    const agentTx = txByAgentDate?.get(agent.id) || new Map<string, number>();
    const dailyScores: DailyScore[] = [];
    const events: ScoreEvent[] = [];
    let totalScore = 0;
    let todayScore = 0;
    let metricTotal = 0;
    let metricToday = 0;
    let consecutiveHotDays = 0;
    let mulliganCount = 0;
    const bonusesApplied: { label: string; score: number }[] = [];
    const penaltiesApplied: { label: string; score: number }[] = [];

    for (const date of dates) {
      // Get the metric value for the day
      let value: number;
      if (txByAgentDate) {
        value = agentTx.get(date) || 0;
      } else {
        value = agentAct.get(date) || 0;
      }

      metricTotal += value;
      if (date === todayStr) metricToday = value;

      // Score via threshold rules
      const result = scoreFromThresholds(value, rules);
      let dayScore = result.score;

      // Mulligan: if bonuses.mulligan is enabled and the day score is bad (> 0 for golf = over par)
      // and we haven't used all mulligans, skip this bad day
      if (
        config.bonuses?.mulligan?.enabled &&
        dayScore > 0 &&
        mulliganCount < (config.bonuses.mulligan.limit || 0)
      ) {
        mulliganCount++;
        dayScore = 0;
        events.push({
          type: 'mulligan',
          label: config.bonuses.mulligan.scope === 'daily' ? 'Mulligan' : 'Mulligan',
          emoji: '\u26F3',
          score: 0,
          date,
          detail: `Mulligan used (${mulliganCount}/${config.bonuses.mulligan.limit}) - bad day erased`,
        });
      }

      totalScore += dayScore;

      // Track hot streak
      if (dayScore < 0) {
        // Negative = under par = good for golf
        consecutiveHotDays++;
      } else {
        consecutiveHotDays = 0;
      }

      dailyScores.push({
        date,
        metricValue: value,
        score: dayScore,
        label: result.label,
        cumulative: totalScore,
      });

      // Generate events for notable daily scores
      if (result.label && dayScore !== 0) {
        const absScore = Math.abs(dayScore);
        if (absScore >= 2 || result.label.toLowerCase().includes('eagle') || result.label.toLowerCase().includes('bogey')) {
          events.push({
            type: result.label.toLowerCase().replace(/\s+/g, '_'),
            label: result.label,
            emoji: result.emoji || '',
            score: dayScore,
            date,
            detail: `${config.metricLabel || config.metric}: ${value} -> ${result.label}`,
          });
        }
      }

      if (date === todayStr) todayScore = dayScore;
    }

    // Hot streak bonus
    if (
      config.bonuses?.hotStreak?.enabled &&
      consecutiveHotDays >= (config.bonuses.hotStreak.days || 3)
    ) {
      const bonus = config.bonuses.hotStreak.score || 0;
      totalScore += bonus;
      bonusesApplied.push({
        label: config.bonuses.hotStreak.label || 'Hot Streak',
        score: bonus,
      });
      events.push({
        type: 'hot_streak',
        label: config.bonuses.hotStreak.label || 'Hot Streak',
        emoji: '\uD83D\uDD25',
        score: bonus,
        date: todayStr,
        detail: `${consecutiveHotDays} consecutive under-par days`,
      });
    }

    // Calculate target completion
    const targetCompletion =
      config.targetValue > 0
        ? Math.min(100, Math.round((metricTotal / (config.targetValue * dates.length)) * 100))
        : 0;

    // Score label for golf: format as "+3", "-2", "E" (even)
    let scoreLabel: string;
    if (totalScore === 0) scoreLabel = 'E';
    else if (totalScore > 0) scoreLabel = `+${totalScore}`;
    else scoreLabel = String(totalScore);

    standings.push({
      agentId: agent.id,
      displayName: agent.displayName,
      teamName: agent.teamName,
      position: 0,
      totalScore,
      todayScore,
      scoreLabel,
      color: '',
      avatarNumber: 0,
      metricTotal,
      metricToday,
      targetCompletion,
      streak: consecutiveHotDays,
      movement: 0,
      events: events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15),
      distanceFromLeader: 0,
      dailyScores,
      bonusesApplied,
      penaltiesApplied,
    });
  }

  return standings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POINTS scoring (NASCAR)
// ═══════════════════════════════════════════════════════════════════════════════

async function scorePoints(
  config: CompetitionConfig,
  agents: { id: string; displayName: string; teamName: string | null }[],
): Promise<ParticipantStanding[]> {
  const rules = config.pointRules || {
    closedDeal: 100,
    pendingDeal: 50,
    engagementPoint: 1,
    appointmentHeldPoint: 5,
    contractWrittenPoint: 25,
  };

  const yearNum = config.year || new Date().getFullYear();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // ── Fetch transactions for the year ─────────────────────────────────
  const txSnap = await adminDb.collection('transactions')
    .where('year', '==', yearNum)
    .get();

  const txByAgent = new Map<string, any[]>();
  for (const doc of txSnap.docs) {
    const t = { id: doc.id, ...doc.data() };
    const aid = (t as any).agentId;
    if (!aid) continue;
    if (!txByAgent.has(aid)) txByAgent.set(aid, []);
    txByAgent.get(aid)!.push(t);
  }

  // ── Fetch daily activity for the year ───────────────────────────────
  const effectiveEnd = config.endDate < todayStr ? config.endDate : todayStr;
  const actSnap = await adminDb.collection('daily_activity')
    .where('date', '>=', `${yearNum}-01-01`)
    .where('date', '<=', effectiveEnd)
    .get();

  const actByAgent = new Map<string, { eng: number; apptHeld: number; contracts: number }>();
  for (const doc of actSnap.docs) {
    const a = doc.data();
    const aid = a.agentId;
    if (!aid) continue;
    if (!actByAgent.has(aid)) actByAgent.set(aid, { eng: 0, apptHeld: 0, contracts: 0 });
    const b = actByAgent.get(aid)!;
    b.eng += num(a.engagementsCount);
    b.apptHeld += num(a.appointmentsHeldCount);
    b.contracts += num(a.contractsWrittenCount);
  }

  // ── Build standings ─────────────────────────────────────────────────
  const standings: ParticipantStanding[] = [];

  for (const agent of agents) {
    const txs = txByAgent.get(agent.id) || [];
    const act = actByAgent.get(agent.id) || { eng: 0, apptHeld: 0, contracts: 0 };

    let points = 0;
    let closedDeals = 0;
    let pendingDeals = 0;
    let cancelledDeals = 0;
    let closedVolume = 0;
    const events: ScoreEvent[] = [];
    const closedMonths = new Set<number>();
    const bonusesApplied: { label: string; score: number }[] = [];
    const penaltiesApplied: { label: string; score: number }[] = [];

    for (const t of txs) {
      const status = String(t.status || '').trim();
      const dealValue = num(t.dealValue);
      const closedDate = toDate(t.closedDate || t.closingDate);
      const contractDate = toDate(t.contractDate);
      const txDate = closedDate || contractDate;
      const dateStr = txDate ? txDate.toISOString().slice(0, 10) : '';

      if (status === 'closed') {
        closedDeals += 1;
        closedVolume += dealValue;
        points += rules.closedDeal;

        if (closedDate) {
          const mo = closedDate.getMonth();
          // First deal of the month bonus
          if (
            !closedMonths.has(mo) &&
            config.bonuses?.firstDealOfMonth?.enabled
          ) {
            closedMonths.add(mo);
            const bonus = config.bonuses.firstDealOfMonth.score || 25;
            points += bonus;
            bonusesApplied.push({
              label: config.bonuses.firstDealOfMonth.label || 'Green Flag',
              score: bonus,
            });
            events.push({
              type: 'green_flag',
              label: config.bonuses.firstDealOfMonth.label || 'Green Flag',
              emoji: '\uD83D\uDFE2',
              points: bonus,
              date: dateStr,
              detail: `First closing of ${MONTHS[mo]}`,
            } as any);
          } else if (!closedMonths.has(mo)) {
            // Track month even if bonus not enabled
            closedMonths.add(mo);
          }
        }

        // Big closing bonus
        if (
          config.bonuses?.bigClosingBonus?.enabled &&
          dealValue >= (config.bonuses.bigClosingBonus.threshold || 500000)
        ) {
          const bonus = config.bonuses.bigClosingBonus.score || 50;
          points += bonus;
          bonusesApplied.push({
            label: config.bonuses.bigClosingBonus.label || 'Turbo Boost',
            score: bonus,
          });
          events.push({
            type: 'turbo_boost',
            label: config.bonuses.bigClosingBonus.label || 'Turbo Boost',
            emoji: '\uD83D\uDE80',
            score: bonus,
            date: dateStr,
            detail: `Big closing: $${(dealValue / 1000).toFixed(0)}k at ${t.address || 'N/A'}`,
          });
        }
      } else if (status === 'pending' || status === 'under_contract') {
        pendingDeals += 1;
        points += rules.pendingDeal;
      } else if (status === 'cancelled') {
        cancelledDeals += 1;
        if (config.penalties?.cancelledDeal?.enabled) {
          const penalty = config.penalties.cancelledDeal.score || -50;
          points += penalty;
          penaltiesApplied.push({
            label: config.penalties.cancelledDeal.label || 'Flat Tire',
            score: penalty,
          });
          events.push({
            type: 'flat_tire',
            label: config.penalties.cancelledDeal.label || 'Flat Tire',
            emoji: '\uD83D\uDCA5',
            score: penalty,
            date: dateStr,
            detail: `Deal fell through: ${t.address || 'N/A'}`,
          });
        }
      }
    }

    // Activity points
    points += act.eng * rules.engagementPoint;
    points += act.apptHeld * rules.appointmentHeldPoint;
    points += act.contracts * rules.contractWrittenPoint;

    // Streak: consecutive months with at least 1 closing (from most recent month backward)
    let streak = 0;
    const currentMonth = today.getMonth();
    for (let m = currentMonth; m >= 0; m--) {
      if (closedMonths.has(m)) streak += 1;
      else break;
    }

    // Pit stop event (no activity)
    if (
      config.penalties?.noActivity?.enabled &&
      act.eng === 0 && closedDeals === 0 && pendingDeals === 0 && today.getMonth() > 0
    ) {
      const penalty = config.penalties.noActivity.score || 0;
      if (penalty !== 0) {
        points += penalty;
        penaltiesApplied.push({
          label: config.penalties.noActivity.label || 'Pit Stop',
          score: penalty,
        });
      }
      events.push({
        type: 'pit_stop',
        label: config.penalties.noActivity.label || 'Pit Stop',
        emoji: '\uD83D\uDD27',
        score: penalty,
        date: todayStr,
        detail: 'No activity or deals recorded this year',
      });
    } else if (act.eng === 0 && closedDeals === 0 && pendingDeals === 0 && today.getMonth() > 0) {
      // Even if penalty not configured, still generate the event
      events.push({
        type: 'pit_stop',
        label: 'Pit Stop',
        emoji: '\uD83D\uDD27',
        score: 0,
        date: todayStr,
        detail: 'No activity or deals recorded this year',
      });
    }

    // Ensure points don't go negative
    points = Math.max(0, points);

    // Metric total for points-based: total points IS the metric
    const metricTotal = closedDeals + pendingDeals;

    standings.push({
      agentId: agent.id,
      displayName: agent.displayName,
      teamName: agent.teamName,
      position: 0,
      totalScore: points,
      todayScore: 0,
      scoreLabel: `${points} pts`,
      color: '',
      avatarNumber: 0,
      metricTotal,
      metricToday: 0,
      targetCompletion: 0,
      streak,
      movement: 0,
      events: events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
      distanceFromLeader: 0,
      bonusesApplied,
      penaltiesApplied,
    });
  }

  return standings;
}
