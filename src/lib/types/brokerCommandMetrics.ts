// Types for Broker Command Center

export type Period = {
  type: 'year' | 'month';
  year: number;
  month?: number; // 1-12
};

export type Metric = {
  count: number;
  netRevenue: number;
  volume: number;
};

export type CategoryMetrics = {
  residential_sale: Metric;
  rental: Metric;
  commercial_lease: Metric;
  commercial_sale: Metric;
  land: Metric;
  unknown: Metric;
};

export type SourceMetric = {
  count: number;
  volume: number;
  netRevenue: number;
};

// keyed by dealSource value (e.g. 'boomtown', 'sphere', 'referral', etc.)
export type SourceBreakdown = {
  closed: Record<string, SourceMetric>;
  pending: Record<string, SourceMetric>;
};

// ── Side breakdown: Buyer / Seller / Renter / Dual / Referral ────────────
export type SideBucket = { count: number; volume: number; netRevenue: number };
export type SideBreakdown = {
  closed: Record<string, SideBucket>;
  pending: Record<string, SideBucket>;
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
  pendingGci: number;         // Anticipated gross margin (company retained) from pending deals

  // Counts
  closedCount: number;        // Number of closed deals
  pendingCount: number;       // Number of pending deals

  // Goals (admin-set, null if not configured)
  grossMarginGoal: number | null;
  volumeGoal: number | null;
  salesCountGoal: number | null;

  // Partial-month indicator — true when this is the current in-progress month.
  // Goals are pro-rated by daysElapsed/daysInMonth; data is capped at today's day.
  isPartialMonth?: boolean;
  partialDayOfMonth?: number;   // day-of-month cap (e.g. 3 on June 3)
  partialDaysInMonth?: number;  // total days in the month (e.g. 30 for June)
};

// ── Main response shape ─────────────────────────────────────────────────────

export type BrokerCommandOverview = {
  year: number;

  // Yearly totals (KPI cards)
  totals: {
    totalGCI: number;
    grossMargin: number;
    grossMarginPct: number;
    agentNetCommission: number;   // totalGCI - grossMargin: paid out to agents
    transactionFees: number;
    closedVolume: number;         // all closed volume (for display)
    commissionVolume: number;     // non-pass-through volume only (for commission % denominator)
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

  // Source breakdown (broker dashboard only)
  sourceBreakdown?: SourceBreakdown;
  // Side breakdown: Buyer / Seller / Renter / Dual / Referral
  sideBreakdown?: SideBreakdown;
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

// ── Previous Year Seasonality ───────────────────────────────────────────────

export type SeasonalityMonth = {
  month: number;
  label: string;
  volumePct: number;     // % of yearly volume this month represented
  salesPct: number;      // % of yearly sales this month represented
  closedVolume: number;
  closedCount: number;
  totalGCI: number;
  grossMargin: number;
};

export type PrevYearStats = {
  year: number;
  totalVolume: number;
  totalSales: number;
  totalGCI: number;
  totalGrossMargin: number;
  avgSalePrice: number;
  avgGCI: number;
  avgGrossMargin: number;
  avgMarginPct: number;
  avgCommissionPct: number;  // avg GCI as % of sale price (e.g. 2.7%)
  seasonality: SeasonalityMonth[];
};

// ── Comparison Year Data ────────────────────────────────────────────────────

export type ComparisonMonth = {
  month: number;
  label: string;
  grossMargin: number;
  closedVolume: number;
  closedCount: number;
  totalGCI: number;
};

export type ComparisonData = {
  year: number;
  months: ComparisonMonth[];
};

export type TeamInfo = {
  teamId: string;
  teamName: string;
};

export type TeamLeaderEarningsMember = {
  agentId: string;
  agentName: string;
  closedCount: number;
  closedVolume: number;
  totalGCI: number;
  memberPaid: number;
  leaderRetained: number;
};

export type TeamLeaderEarnings = {
  totalLeaderRetained: number;
  totalMemberPaid: number;
  totalGCI: number;
  memberBreakdown: TeamLeaderEarningsMember[];
};

// ── Contracts written by month (bucketed by contractDate) ─────────────────
export type ContractsByMonthData = {
  month: number;       // 1-12
  label: string;       // 'Jan', 'Feb', ...
  count: number;       // number of deals that went under contract this month
  volume: number;      // total sale price of those deals
};

// ── Pending-to-close ratio ──────────────────────────────────────────────────
// Of deals that went pending where projectedCloseDate has already passed,
// how many actually closed vs. fell through.
export type PendingCloseRatio = {
  pendingTotal: number;       // total deals that went pending (projectedCloseDate in the past)
  closedFromPending: number;  // how many of those actually closed
  fallThroughCount: number;   // how many did NOT close (still pending/canceled/expired)
  closeRatePct: number;       // closedFromPending / pendingTotal * 100 (0 if pendingTotal=0)
};

// ── Pending transaction summary for the gross margin pending detail table ──
export type PendingTransactionSummary = {
  id: string;
  address: string;
  agentId: string;
  agentName: string;
  projectedCloseDate: string | null;
  projectedCloseMonth: number | null; // 1-12, null if no projected date
  salePrice: number;
  pendingGci: number;   // anticipated company-retained gross margin
};

export type BrokerCommandMetrics = {
  overview: BrokerCommandOverview;
  prevYearStats?: PrevYearStats;
  availableYears?: number[];       // years with transaction data (for comparison dropdown)
  comparisonData?: ComparisonData | null;  // monthly data for the selected comparison year
  teams?: TeamInfo[];              // available teams for team tabs
  teamLeaderEarnings?: TeamLeaderEarnings | null; // populated when teamId is set and team has a leader
  pendingTransactions?: PendingTransactionSummary[]; // pending deals for the gross margin pending detail table
  // Contracts written by month (bucketed by contractDate, multi-year comparison)
  contractsByMonth?: ContractsByMonthData[];  // 12 months for the selected year
  contractsByMonthComparison?: { year: number; months: ContractsByMonthData[] }[]; // up to 4 prior years
  // Pending-to-close ratio (YTD, resolved deals only)
  pendingCloseRatio?: PendingCloseRatio;
  // Fees collected breakdown (transaction fees + listing fees, by payer)
  feesCollected?: FeesCollected;
  // All-time brokerage totals (from brokerAllTimeSummary/totals)
  allTimeSummary?: {
    totalDeals: number;
    totalVolume: number;
    totalCommissionsPaid: number;
    totalAgentsEver: number;
    activeAgentsToday: number;
  };
  // Year-by-year agent history (from agentYearlySummary)
  agentHistory?: Array<{
    year: number;
    rosterCount: number;
    closedCount: number;
    totalDeals: number;
    totalVolume: number;
    rosterSource: string;
  }>;
  // Legacy fields (kept for backward compatibility)
  currentPeriodMetrics?: PeriodMetrics;
  comparisonPeriodMetrics?: PeriodMetrics;
  monthlyTrend?: { month: string; activeAgents: number; closedDeals: number; dealsPerAgent: number }[];
};

// ── Fees Collected breakdown ──────────────────────────────────────────────────
export type FeesByPayer = {
  count: number;       // number of transactions with this payer
  totalAmount: number; // sum of fee amounts
};

export type FeesCollected = {
  // Grand totals
  totalFees: number;            // all fees regardless of payer
  totalTransactionFees: number; // txComplianceFee amounts (compliance/transaction fee)
  totalListingFees: number;     // legacy transactionFee field (listing-side fee)
  totalCount: number;           // transactions that have any fee
  // Company-collected vs agent-paid split
  companyCollectedTotal: number; // buyer + seller + sellerClosingCost payers
  agentPaidTotal: number;        // agent pays from their commission
  // Breakdown by who pays
  byPayer: {
    agent: FeesByPayer;              // agent pays out of their commission
    buyer: FeesByPayer;              // collected from buyer at closing
    seller: FeesByPayer;             // collected from seller
    sellerClosingCost: FeesByPayer;  // taken from seller-paid closing cost to buyer
    other: FeesByPayer;              // any other / unspecified payer
  };
  // Monthly breakdown (index 0 = Jan, 11 = Dec)
  byMonth: Array<{
    month: number;   // 1-12
    label: string;
    totalFees: number;
    agentFees: number;
    companyCollectedFees: number; // buyer + seller + sellerClosingCost
  }>;
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
