// ── Competition Scoring Engine ───────────────────────────────────────────────
// Universal engine that scores both NASCAR (points/desc) and Golf (threshold_map/asc)
// competitions from raw metric data.

import type {
  CompetitionConfig,
  CompetitionTheme,
  ThresholdRule,
  ParticipantStanding,
  ScoreEvent,
  DailyScore,
  BonusConfig,
  PenaltyConfig,
  ScoreGrouping,
} from './types';

// ── Public types for engine inputs ──────────────────────────────────────────

export type DailyMetricEntry = {
  date: string;   // YYYY-MM-DD
  value: number;
};

export type AgentExtras = {
  closedDeals: number;
  pendingDeals: number;
  cancelledDeals: number;
  closedVolume: number;
  closedMonths: Set<number>; // month indices (0-11) with at least one closing
  engagements: number;
  appointmentsHeld: number;
  contractsWritten: number;
};

export type AgentScoreResult = {
  agentId: string;
  displayName: string;
  teamName: string | null;
  color: string;
  avatarNumber: number;
  totalScore: number;
  todayScore: number;
  todayLabel: string;
  dailyScores: DailyScore[];
  events: ScoreEvent[];
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
  streak: number;
  groupId: string | undefined;
  metricTotal: number;
  metricToday: number;
  closedDeals: number;
  closedVolume: number;
  previousPosition?: number;
};

// ── Threshold scoring ───────────────────────────────────────────────────────

/**
 * Score a single metric value against threshold rules (golf-style).
 * Rules should be sorted by min ascending.
 */
export function scoreByThreshold(
  value: number,
  rules: ThresholdRule[],
): { score: number; label: string; emoji: string } {
  for (const rule of rules) {
    const matchesMin = value >= rule.min;
    const matchesMax = rule.max === null || rule.max === undefined || value <= rule.max;
    if (matchesMin && matchesMax) {
      return { score: rule.score, label: rule.label, emoji: rule.emoji || '' };
    }
  }
  // Fallback: clamp to first or last rule
  const fallback = value <= (rules[0]?.min ?? 0) ? rules[0] : rules[rules.length - 1];
  return {
    score: fallback?.score ?? 0,
    label: fallback?.label ?? 'Unknown',
    emoji: fallback?.emoji ?? '',
  };
}

// ── Agent score computation ─────────────────────────────────────────────────

/**
 * Given daily activity data for an agent and the competition config, compute
 * all daily scores and the total. Works for threshold_map (golf) and points (nascar).
 */
export function computeAgentScore(
  config: CompetitionConfig,
  dailyMetrics: DailyMetricEntry[],
  extras: AgentExtras,
): {
  totalScore: number;
  todayScore: number;
  todayLabel: string;
  dailyScores: DailyScore[];
  events: ScoreEvent[];
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
  streak: number;
  groupId: string | undefined;
} {
  if (config.scoringStrategy === 'threshold_map') {
    return computeThresholdScore(config, dailyMetrics);
  }
  return computePointsScore(config, dailyMetrics, extras);
}

// ── Threshold / Golf scoring ────────────────────────────────────────────────

function computeThresholdScore(
  config: CompetitionConfig,
  dailyMetrics: DailyMetricEntry[],
): {
  totalScore: number;
  todayScore: number;
  todayLabel: string;
  dailyScores: DailyScore[];
  events: ScoreEvent[];
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
  streak: number;
  groupId: string | undefined;
} {
  const rules = config.thresholdRules ?? [];
  const bonuses = config.bonuses;
  const dailyScores: DailyScore[] = [];
  const events: ScoreEvent[] = [];
  const bonusesApplied: { label: string; score: number }[] = [];
  const penaltiesApplied: { label: string; score: number }[] = [];

  // Sort metrics by date ascending
  const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));

  let cumulative = 0;
  let currentStreak = 0;
  let maxStreak = 0;

  // Par threshold: score === 0 means "at par"
  // Meeting/beating par: score <= 0 for golf (lower is better)

  for (const entry of sorted) {
    const result = scoreByThreshold(entry.value, rules);
    cumulative += result.score;

    dailyScores.push({
      date: entry.date,
      metricValue: entry.value,
      score: result.score,
      label: result.label,
      cumulative,
    });

    // Streak: consecutive days at or below par (score <= 0)
    if (result.score <= 0) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }

    // Generate events for notable scores
    if (result.score <= -2) {
      events.push({
        type: 'eagle',
        label: result.label,
        emoji: result.emoji,
        score: result.score,
        date: entry.date,
        detail: `${entry.value} ${config.metricLabel ?? config.metric} on ${entry.date}`,
      });
    } else if (result.score <= -1) {
      events.push({
        type: 'birdie',
        label: result.label,
        emoji: result.emoji,
        score: result.score,
        date: entry.date,
        detail: `${entry.value} ${config.metricLabel ?? config.metric} on ${entry.date}`,
      });
    } else if (result.score >= 2) {
      events.push({
        type: 'double_bogey',
        label: result.label,
        emoji: result.emoji,
        score: result.score,
        date: entry.date,
        detail: `Only ${entry.value} ${config.metricLabel ?? config.metric} on ${entry.date}`,
      });
    }
  }

  let totalScore = cumulative;

  // ── Hot streak bonus ──────────────────────────────────────────────────────
  if (bonuses.hotStreak?.enabled && maxStreak >= (bonuses.hotStreak.days ?? 3)) {
    const streakCount = Math.floor(maxStreak / bonuses.hotStreak.days);
    const bonus = streakCount * bonuses.hotStreak.score;
    totalScore += bonus;
    bonusesApplied.push({
      label: bonuses.hotStreak.label ?? `Hot Streak (${bonuses.hotStreak.days}+ days)`,
      score: bonus,
    });
    events.push({
      type: 'hot_streak',
      label: bonuses.hotStreak.label ?? 'Hot Streak',
      emoji: '🔥',
      score: bonus,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `${maxStreak} consecutive days at or below par`,
    });
  }

  // ── Mulligan bonus (remove worst day) ─────────────────────────────────────
  if (bonuses.mulligan?.enabled && dailyScores.length > 0) {
    const mulliganLimit = bonuses.mulligan.limit ?? 1;
    // For golf, "worst day" = highest score (most over par)
    const scoresSortedWorst = [...dailyScores].sort((a, b) => b.score - a.score);
    let mulligansUsed = 0;

    for (const worst of scoresSortedWorst) {
      if (mulligansUsed >= mulliganLimit) break;
      if (worst.score > 0) {
        // Remove this penalty day
        totalScore -= worst.score;
        mulligansUsed++;
        bonusesApplied.push({
          label: `Mulligan (${worst.date})`,
          score: -worst.score,
        });
        events.push({
          type: 'mulligan',
          label: 'Mulligan',
          emoji: '🏌️',
          score: -worst.score,
          date: worst.date,
          detail: `Worst day score of ${worst.score} removed`,
        });
      }
    }
  }

  // ── Determine group ───────────────────────────────────────────────────────
  const groupId = resolveGroupId(totalScore, config.groupings);

  // ── Today score ───────────────────────────────────────────────────────────
  const todayEntry = dailyScores[dailyScores.length - 1];
  const todayScore = todayEntry?.score ?? 0;
  const todayLabel = todayEntry?.label ?? 'No activity';

  return {
    totalScore,
    todayScore,
    todayLabel,
    dailyScores,
    events,
    bonusesApplied,
    penaltiesApplied,
    streak: maxStreak,
    groupId,
  };
}

// ── Points / NASCAR scoring ─────────────────────────────────────────────────

function computePointsScore(
  config: CompetitionConfig,
  dailyMetrics: DailyMetricEntry[],
  extras: AgentExtras,
): {
  totalScore: number;
  todayScore: number;
  todayLabel: string;
  dailyScores: DailyScore[];
  events: ScoreEvent[];
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
  streak: number;
  groupId: string | undefined;
} {
  const rules = config.pointRules ?? {
    closedDeal: 100,
    pendingDeal: 50,
    engagementPoint: 1,
    appointmentHeldPoint: 5,
    contractWrittenPoint: 25,
  };
  const bonuses = config.bonuses;
  const penalties = config.penalties;
  const events: ScoreEvent[] = [];
  const bonusesApplied: { label: string; score: number }[] = [];
  const penaltiesApplied: { label: string; score: number }[] = [];

  // ── Base points from extras ───────────────────────────────────────────────
  let totalScore = 0;

  const closedPts = extras.closedDeals * rules.closedDeal;
  const pendingPts = extras.pendingDeals * rules.pendingDeal;
  const engagementPts = extras.engagements * rules.engagementPoint;
  const apptPts = extras.appointmentsHeld * rules.appointmentHeldPoint;
  const contractPts = extras.contractsWritten * rules.contractWrittenPoint;

  totalScore += closedPts + pendingPts + engagementPts + apptPts + contractPts;

  // ── Build daily scores from dailyMetrics ──────────────────────────────────
  const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
  const dailyScores: DailyScore[] = [];
  let cumulative = 0;

  for (const entry of sorted) {
    // For NASCAR, daily metric value is typically engagement points
    const dayScore = entry.value * rules.engagementPoint;
    cumulative += dayScore;
    dailyScores.push({
      date: entry.date,
      metricValue: entry.value,
      score: dayScore,
      label: `${dayScore} pts`,
      cumulative,
    });
  }

  // ── Generate base events ──────────────────────────────────────────────────
  if (extras.closedDeals > 0) {
    events.push({
      type: 'turbo_boost',
      label: 'Turbo Boost',
      emoji: '🚀',
      score: closedPts,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `${extras.closedDeals} closed deal(s) for ${closedPts} pts`,
    });
  }
  if (extras.pendingDeals > 0) {
    events.push({
      type: 'green_flag',
      label: 'Green Flag',
      emoji: '🟢',
      score: pendingPts,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `${extras.pendingDeals} pending deal(s) for ${pendingPts} pts`,
    });
  }

  // ── Cancelled deal penalty ────────────────────────────────────────────────
  if (penalties.cancelledDeal?.enabled && extras.cancelledDeals > 0) {
    const penaltyScore = extras.cancelledDeals * penalties.cancelledDeal.score;
    totalScore += penaltyScore; // score is negative
    penaltiesApplied.push({
      label: penalties.cancelledDeal.label ?? 'Cancelled Deal',
      score: penaltyScore,
    });
    events.push({
      type: 'flat_tire',
      label: penalties.cancelledDeal.label ?? 'Flat Tire',
      emoji: '💥',
      score: penaltyScore,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `${extras.cancelledDeals} cancelled deal(s) for ${penaltyScore} pts`,
    });
  }

  // ── Big closing bonus ─────────────────────────────────────────────────────
  if (bonuses.bigClosingBonus?.enabled && extras.closedVolume >= (bonuses.bigClosingBonus.threshold ?? 500000)) {
    const bonus = bonuses.bigClosingBonus.score;
    totalScore += bonus;
    bonusesApplied.push({
      label: bonuses.bigClosingBonus.label ?? 'Big Closing Bonus',
      score: bonus,
    });
    events.push({
      type: 'turbo_boost',
      label: bonuses.bigClosingBonus.label ?? 'Big Closing Bonus',
      emoji: '💰',
      score: bonus,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `Volume $${(extras.closedVolume / 1000).toFixed(0)}k exceeded threshold`,
    });
  }

  // ── First deal of month bonus ─────────────────────────────────────────────
  if (bonuses.firstDealOfMonth?.enabled && extras.closedMonths.size > 0) {
    const bonus = extras.closedMonths.size * bonuses.firstDealOfMonth.score;
    totalScore += bonus;
    bonusesApplied.push({
      label: bonuses.firstDealOfMonth.label ?? 'First Deal of Month',
      score: bonus,
    });
    events.push({
      type: 'green_flag',
      label: bonuses.firstDealOfMonth.label ?? 'First Deal of Month',
      emoji: '🏁',
      score: bonus,
      date: sorted[sorted.length - 1]?.date ?? '',
      detail: `First deal bonus in ${extras.closedMonths.size} month(s)`,
    });
  }

  // ── Monthly goal hit bonus ────────────────────────────────────────────────
  if (bonuses.monthlyGoalHit?.enabled) {
    // Check if total metric meets the target
    const metricTotal = dailyMetrics.reduce((sum, d) => sum + d.value, 0);
    if (metricTotal >= config.targetValue) {
      const bonus = bonuses.monthlyGoalHit.score;
      totalScore += bonus;
      bonusesApplied.push({
        label: bonuses.monthlyGoalHit.label ?? 'Monthly Goal Hit',
        score: bonus,
      });
      events.push({
        type: 'checkered_flag',
        label: bonuses.monthlyGoalHit.label ?? 'Checkered Flag',
        emoji: '🏆',
        score: bonus,
        date: sorted[sorted.length - 1]?.date ?? '',
        detail: `Monthly target of ${config.targetValue} reached`,
      });
    }
  }

  // ── No activity penalty ───────────────────────────────────────────────────
  if (penalties.noActivity?.enabled) {
    const noActivityDays = penalties.noActivity.days ?? 7;
    // Count consecutive zero-metric days from the end
    let zeroDays = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].value === 0) zeroDays++;
      else break;
    }
    if (zeroDays >= noActivityDays) {
      const penaltyScore = penalties.noActivity.score;
      totalScore += penaltyScore; // score is negative
      penaltiesApplied.push({
        label: penalties.noActivity.label ?? 'No Activity',
        score: penaltyScore,
      });
      events.push({
        type: 'pit_stop',
        label: penalties.noActivity.label ?? 'Pit Stop',
        emoji: '🛑',
        score: penaltyScore,
        date: sorted[sorted.length - 1]?.date ?? '',
        detail: `${zeroDays} consecutive days with no activity`,
      });
    }
  }

  // ── Streak: consecutive months with at least one closing ──────────────────
  const monthIndices = Array.from(extras.closedMonths).sort((a, b) => a - b);
  let streak = 0;
  let currentStreak = 0;
  for (let i = 0; i < monthIndices.length; i++) {
    if (i === 0 || monthIndices[i] === monthIndices[i - 1] + 1) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    if (currentStreak > streak) streak = currentStreak;
  }

  // ── Today score ───────────────────────────────────────────────────────────
  const todayEntry = dailyScores[dailyScores.length - 1];
  const todayScore = todayEntry?.score ?? 0;
  const todayLabel = todayEntry ? `${todayEntry.score} pts` : '0 pts';

  // ── Group (not typically used for NASCAR, but support it) ─────────────────
  const groupId = resolveGroupId(totalScore, config.groupings);

  return {
    totalScore,
    todayScore,
    todayLabel,
    dailyScores,
    events,
    bonusesApplied,
    penaltiesApplied,
    streak,
    groupId,
  };
}

// ── Standings computation ───────────────────────────────────────────────────

/**
 * Sort agent scores by rankingDirection, assign positions, calculate movement
 * and distanceFromLeader. Returns fully hydrated ParticipantStanding[].
 */
export function computeStandings(
  config: CompetitionConfig,
  agentScores: AgentScoreResult[],
): ParticipantStanding[] {
  if (agentScores.length === 0) return [];

  const isAsc = config.rankingDirection === 'asc';

  // Sort by totalScore, then apply tiebreakers
  const sorted = [...agentScores].sort((a, b) => {
    const scoreDiff = isAsc ? a.totalScore - b.totalScore : b.totalScore - a.totalScore;
    if (scoreDiff !== 0) return scoreDiff;

    // Tiebreaker
    if (isAsc) {
      // Golf: higher raw metric total wins the tie (more activity)
      return b.metricTotal - a.metricTotal;
    }
    // NASCAR: more closed deals, then higher volume
    if (a.closedDeals !== b.closedDeals) return b.closedDeals - a.closedDeals;
    return b.closedVolume - a.closedVolume;
  });

  const leaderScore = sorted[0].totalScore;

  return sorted.map((agent, idx) => {
    const position = idx + 1;
    const previousPosition = agent.previousPosition ?? position;
    const movement = previousPosition - position; // positive = moved up

    const metricTotal = agent.metricTotal;
    const targetCompletion = config.targetValue > 0
      ? Math.min(100, Math.round((metricTotal / config.targetValue) * 100))
      : 0;

    const distanceFromLeader = isAsc
      ? agent.totalScore - leaderScore   // golf: positive means behind
      : leaderScore - agent.totalScore;  // nascar: positive means behind

    return {
      agentId: agent.agentId,
      displayName: agent.displayName,
      teamName: agent.teamName,
      position,
      previousPosition,
      totalScore: agent.totalScore,
      todayScore: agent.todayScore,
      scoreLabel: getScoreLabel(agent.totalScore, config),
      color: agent.color,
      avatarNumber: agent.avatarNumber,
      groupId: agent.groupId,
      metricTotal: agent.metricTotal,
      metricToday: agent.metricToday,
      targetCompletion,
      streak: agent.streak,
      movement,
      events: agent.events,
      distanceFromLeader,
      dailyScores: agent.dailyScores,
      bonusesApplied: agent.bonusesApplied,
      penaltiesApplied: agent.penaltiesApplied,
    };
  });
}

// ── Display helpers ─────────────────────────────────────────────────────────

/**
 * Return a human-friendly score label.
 * Golf: "+2", "-1", "E" (even).  NASCAR: "150 pts".
 */
export function getScoreLabel(score: number, config: CompetitionConfig): string {
  if (config.scoringStrategy === 'threshold_map') {
    if (score === 0) return 'E';
    if (score > 0) return `+${score}`;
    return `${score}`; // already has minus sign
  }
  return `${score} pts`;
}

// ── Group resolution ────────────────────────────────────────────────────────

function resolveGroupId(
  totalScore: number,
  groupings?: ScoreGrouping[],
): string | undefined {
  if (!groupings || groupings.length === 0) return undefined;

  for (const group of groupings) {
    switch (group.condition) {
      case 'lt':
        if (totalScore < group.threshold) return group.id;
        break;
      case 'eq':
        if (totalScore === group.threshold) return group.id;
        break;
      case 'gt':
        if (totalScore > group.threshold) return group.id;
        break;
    }
  }
  return undefined;
}

// ── Default configs ─────────────────────────────────────────────────────────

/**
 * Return a full default CompetitionConfig for a given theme.
 */
export function getDefaultConfig(theme: CompetitionTheme): CompetitionConfig {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();

  const base = {
    year,
    status: 'draft' as const,
    autoRefreshSeconds: 30,
    showTopN: 20,
    tvLayout: 'full' as const,
    createdAt: now,
    updatedAt: now,
    createdBy: '',
  };

  if (theme === 'golf') {
    return {
      ...base,
      name: `Golf Challenge ${year}`,
      description: 'Daily appointment-setting competition with golf-style scoring.',
      theme: 'golf',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      metric: 'appointments_set',
      metricLabel: 'Appointments Set',
      targetType: 'daily',
      targetValue: 2,
      scoringStrategy: 'threshold_map',
      rankingDirection: 'asc',
      thresholdRules: [
        { min: 0, max: 0, score: 2, label: 'Double Bogey', emoji: '😰' },
        { min: 1, max: 1, score: 1, label: 'Bogey', emoji: '😐' },
        { min: 2, max: 2, score: 0, label: 'Par', emoji: '⛳' },
        { min: 3, max: 3, score: -1, label: 'Birdie', emoji: '🐦' },
        { min: 4, max: null, score: -2, label: 'Eagle', emoji: '🦅' },
      ],
      bonuses: {
        hotStreak: { enabled: true, days: 3, score: -2, label: 'Hot Streak' },
        mulligan: { enabled: true, limit: 1, scope: 'weekly' },
      },
      penalties: {},
      prizes: [
        { place: 1, label: '1st Place', amount: 500 },
        { place: 2, label: '2nd Place', amount: 250 },
        { place: 3, label: '3rd Place', amount: 100 },
      ],
      leaderboardVariant: 'clubhouse',
      groupings: [
        { id: 'under_par', label: 'Under Par', condition: 'lt', threshold: 0, color: '#16a34a', emoji: '🟢' },
        { id: 'even', label: 'Even', condition: 'eq', threshold: 0, color: '#2563eb', emoji: '🔵' },
        { id: 'over_par', label: 'Over Par', condition: 'gt', threshold: 0, color: '#dc2626', emoji: '🔴' },
      ],
      commentaryPack: 'golf_classic',
      audioPack: 'golf_clean',
      audioEnabled: true,
      commentaryEnabled: true,
    };
  }

  if (theme === 'horse_race') {
    return {
      ...base,
      name: `Horse Race ${year}`,
      description: 'Head-to-head race where KPI completions move your horse forward.',
      theme: 'horse_race',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      metric: 'engagements',
      metricLabel: 'Engagements',
      targetType: 'season',
      targetValue: 500,
      scoringStrategy: 'points',
      rankingDirection: 'desc',
      pointRules: {
        closedDeal: 100,
        pendingDeal: 50,
        engagementPoint: 2,
        appointmentHeldPoint: 10,
        contractWrittenPoint: 25,
      },
      bonuses: {
        bigClosingBonus: { enabled: true, threshold: 500000, score: 50, label: 'Turbo Gallop' },
        firstDealOfMonth: { enabled: true, score: 25, label: 'Fast Start' },
      },
      penalties: {
        cancelledDeal: { enabled: true, score: -50, label: 'Stumble' },
      },
      prizes: [
        { place: 1, label: '1st Place', amount: 1000 },
        { place: 2, label: '2nd Place', amount: 500 },
        { place: 3, label: '3rd Place', amount: 250 },
      ],
      leaderboardVariant: 'racetrack',
      commentaryPack: 'horse_race_classic',
      audioPack: 'horse_race_crowd',
      audioEnabled: true,
      commentaryEnabled: true,
    };
  }

  // NASCAR (default)
  return {
    ...base,
    name: `Keaty Cup ${year}`,
    description: 'Season-long points race across all deal activity.',
    theme: 'nascar',
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    metric: 'closed_deals',
    metricLabel: 'Closed Deals',
    targetType: 'season',
    targetValue: 24,
    scoringStrategy: 'points',
    rankingDirection: 'desc',
    pointRules: {
      closedDeal: 100,
      pendingDeal: 50,
      engagementPoint: 1,
      appointmentHeldPoint: 5,
      contractWrittenPoint: 25,
    },
    bonuses: {
      bigClosingBonus: { enabled: true, threshold: 500000, score: 50, label: 'Big Closing Bonus' },
      firstDealOfMonth: { enabled: true, score: 25, label: 'Green Flag' },
      monthlyGoalHit: { enabled: true, score: 75, label: 'Checkered Flag' },
    },
    penalties: {
      cancelledDeal: { enabled: true, score: -50, label: 'Flat Tire' },
    },
    prizes: [
      { place: 1, label: '1st Place', amount: 1000 },
      { place: 2, label: '2nd Place', amount: 500 },
      { place: 3, label: '3rd Place', amount: 250 },
    ],
    leaderboardVariant: 'racetrack',
    commentaryPack: 'nascar_classic',
    audioPack: 'nascar_engine',
    audioEnabled: true,
    commentaryEnabled: true,
  };
}
