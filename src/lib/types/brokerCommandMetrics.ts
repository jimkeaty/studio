// Types for Broker Command Center

export type Period = {
  type: 'year' | 'month';
  year: number;
  month?: number; // 1-12
};

export type Metric = {
  count: number;
  netRevenue: number;
};

export type CategoryMetrics = {
  residential_sale: Metric;
  rental: Metric;
  commercial_lease: Metric;
  commercial_sale: Metric;
  land: Metric;
  unknown: Metric;
};

// ── Monthly data point for the 12-month charts ──────────────────────────────

export type MonthlyData = {
  month: number;       // 1-12
  label: string;       // "Jan", "Feb", etc.

  // Commission / Revenue
  totalGCI: number;           // Total gross commission income
  grossMargin: number;        // Company retained (after paying agents)
  grossMarginPct: number;     // grossMargin / totalGCI * 100
  transactionFees: number;    // Sum of transaction fees

  // Volume
  closedVolume: number;       // Total $ volume of closed deals
  pendingVolume: number;      // Total $ volume of pending deals

  // Counts
  closedCount: number;        // Number of closed deals
  pendingCount: number;       // Number of pending deals

  // Goals (admin-set, null if not configured)
  grossMarginGoal: number | null;
  volumeGoal: number | null;
  salesCountGoal: number | null;
};

// ── Main response shape ─────────────────────────────────────────────────────

export type BrokerCommandOverview = {
  year: number;

  // Yearly totals (KPI cards)
  totals: {
    totalGCI: number;
    grossMargin: number;
    grossMarginPct: number;
    transactionFees: number;
    closedVolume: number;
    pendingVolume: number;
    closedCount: number;
    pendingCount: number;
  };

  // 12 months of data
  months: MonthlyData[];

  // Category breakdown
  categoryBreakdown: {
    closed: CategoryMetrics;
    pending: CategoryMetrics;
  };
};

// Legacy type kept for backward compatibility
export type PeriodMetrics = {
  period: Period;
  startDate: Date;
  endDate: Date;
  netRevenue: {
    closed: number;
    pending: number;
    goal: number | null;
  };
  volume: {
    closed: number;
    pending: number;
  };
  transactions: {
    closed: number;
    pending: number;
  };
  categoryBreakdown: {
    closed: CategoryMetrics;
    pending: CategoryMetrics;
  };
  activeAgents: {
    count: number;
    dealsPerAgent: number;
  };
};

export type BrokerCommandMetrics = {
  overview: BrokerCommandOverview;
  // Legacy fields (kept for backward compatibility)
  currentPeriodMetrics?: PeriodMetrics;
  comparisonPeriodMetrics?: PeriodMetrics;
  monthlyTrend?: { month: string; activeAgents: number; closedDeals: number; dealsPerAgent: number }[];
};

// ── Goals (admin-set) ───────────────────────────────────────────────────────

export type BrokerCommandGoal = {
  year: number;
  month: number;        // 1-12
  segment: string;       // "TOTAL" | "CGL" | "SGL" | etc.
  grossMarginGoal: number | null;
  volumeGoal: number | null;
  salesCountGoal: number | null;
  updatedAt: string;
  updatedBy: string;
};
