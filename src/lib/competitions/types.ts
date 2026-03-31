// ── Competition Engine – Type Definitions ────────────────────────────────────
// Reusable types that power both NASCAR (points/desc) and Golf (threshold_map/asc)
// competitions, plus any future themes.

/** How raw metrics are converted to scores. */
export type ScoringStrategy = 'points' | 'threshold_map' | 'laps';

/** Sort direction for the leaderboard. */
export type RankingDirection = 'asc' | 'desc';

/** Visual / UX theme applied to the competition. */
export type CompetitionTheme = 'nascar' | 'golf' | 'horse_race';

/** Cadence of the metric target. */
export type TargetType = 'daily' | 'weekly' | 'monthly' | 'season';

/** The KPI that drives the competition. */
export type MetricSource =
  | 'appointments_set'
  | 'appointments_held'
  | 'engagements'
  | 'calls'
  | 'contracts_written'
  | 'closed_deals'
  | 'pending_deals'
  | 'closed_volume'
  | 'total_units'
  | 'custom';

// ── Threshold scoring (golf-style) ──────────────────────────────────────────

/** A single rule that maps a metric range to a score and label. */
export type ThresholdRule = {
  min: number;
  max: number | null; // null = min and above (unbounded)
  score: number;
  label: string;
  emoji?: string;
};

// ── Bonuses & Penalties ─────────────────────────────────────────────────────

export type BonusConfig = {
  hotStreak?: { enabled: boolean; days: number; score: number; label?: string };
  mulligan?: { enabled: boolean; limit: number; scope: 'daily' | 'weekly' | 'monthly' };
  bigClosingBonus?: { enabled: boolean; threshold: number; score: number; label?: string };
  firstDealOfMonth?: { enabled: boolean; score: number; label?: string };
  monthlyGoalHit?: { enabled: boolean; score: number; label?: string };
};

export type PenaltyConfig = {
  cancelledDeal?: { enabled: boolean; score: number; label?: string };
  noActivity?: { enabled: boolean; days: number; score: number; label?: string };
};

// ── Commentary & Audio ──────────────────────────────────────────────────────

export type CommentaryPack = 'nascar_classic' | 'golf_classic' | 'horse_race_classic' | 'generic';

export type AudioPack = 'nascar_engine' | 'golf_clean' | 'horse_race_crowd' | 'none';

// ── Prizes ──────────────────────────────────────────────────────────────────

export type Prize = {
  place: number;
  label: string;
  amount: number;
};

// ── Score grouping (e.g. under_par / even / over_par) ───────────────────────

export type ScoreGrouping = {
  id: string;
  label: string;
  condition: 'lt' | 'eq' | 'gt';
  threshold: number;
  color: string;
  emoji?: string;
};

// ── Point rules (NASCAR-style) ──────────────────────────────────────────────

export type PointRules = {
  closedDeal: number;
  pendingDeal: number;
  engagementPoint: number;
  appointmentHeldPoint: number;
  contractWrittenPoint: number;
};

// ── Main competition config (stored in Firestore) ───────────────────────────

export type CompetitionConfig = {
  // Identity
  name: string;
  description?: string;
  theme: CompetitionTheme;

  // Timing
  startDate: string; // YYYY-MM-DD
  endDate: string;
  year: number;
  status: 'draft' | 'active' | 'completed' | 'archived';

  // KPI
  metric: MetricSource;
  metricLabel?: string; // Human-readable override
  targetType: TargetType;
  targetValue: number;

  // Scoring
  scoringStrategy: ScoringStrategy;
  rankingDirection: RankingDirection;
  thresholdRules?: ThresholdRule[];

  // For points-based (NASCAR)
  pointRules?: PointRules;

  // Bonuses & Penalties
  bonuses: BonusConfig;
  penalties: PenaltyConfig;

  // Prizes
  prizes: Prize[];

  // Display
  leaderboardVariant: string; // 'racetrack' | 'clubhouse' | 'standard'
  groupings?: ScoreGrouping[];

  // Commentary & Audio
  commentaryPack: CommentaryPack;
  audioPack: AudioPack;
  audioEnabled: boolean;
  commentaryEnabled: boolean;

  // Presentation
  autoRefreshSeconds: number;
  showTopN: number;
  tvLayout: 'full' | 'split' | 'minimal';

  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

// ── Competition document wrapper ────────────────────────────────────────────

export type Competition = {
  id: string;
  config: CompetitionConfig;
};

// ── Participant standing (computed) ─────────────────────────────────────────

export type ParticipantStanding = {
  agentId: string;
  displayName: string;
  teamName: string | null;
  position: number;
  previousPosition?: number;

  // Core score
  totalScore: number;
  todayScore: number;
  scoreLabel: string; // "Par", "Birdie", "+3", "150 pts", etc.

  // Display
  color: string;
  avatarNumber: number;
  groupId?: string; // under_par, even, over_par

  // Metrics
  metricTotal: number;
  metricToday: number;
  targetCompletion: number; // 0-100%

  // Streaks & movement
  streak: number;
  movement: number; // positions moved since last period (+/- int)

  // Events
  events: ScoreEvent[];

  // Distance from leader
  distanceFromLeader: number;

  // Daily breakdown
  dailyScores?: DailyScore[];

  // Bonuses / penalties applied
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
};

// ── Score event (narrative) ─────────────────────────────────────────────────

export type ScoreEvent = {
  type: string;
  label: string;
  emoji: string;
  score: number;
  date: string;
  detail: string;
};

// ── Daily score entry ───────────────────────────────────────────────────────

export type DailyScore = {
  date: string;
  metricValue: number;
  score: number;
  label: string;
  cumulative: number;
};

// ── Standings API response ──────────────────────────────────────────────────

export type StandingsResponse = {
  ok: boolean;
  competition: Competition;
  standings: ParticipantStanding[];
  summary: {
    totalParticipants: number;
    avgScore: number;
    topScore: number;
    groupCounts?: Record<string, number>;
  };
};
