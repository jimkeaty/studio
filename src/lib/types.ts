export type UserRole = 'agent' | 'manager' | 'broker' | 'admin';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  brokerageId: string;
  avatarUrl?: string;
}

export interface PlanAssumptions {
  conversionRates: {
    callToEngagement: number;
    engagementToAppointmentSet: number;
    appointmentSetToHeld: number;
    appointmentHeldToContract: number;
    contractToClosing: number;
  };
  avgCommission: number;
  workingDaysPerMonth: number;
  weeksOff: number;
}

export interface PlanTargets {
  yearly: number;
  monthly: number;
  weekly: number;
  daily: number;
}

export interface BusinessPlan {
  userId: string;
  year: number;
  annualIncomeGoal: number;

  // New fields for prorated calendar-year planning.
  // effective start date will be derived later from:
  // resetStartDate ?? planStartDate ?? Jan 1 of the plan year
  planStartDate?: string; // YYYY-MM-DD
  resetStartDate?: string; // YYYY-MM-DD

  assumptions: PlanAssumptions;
  calculatedTargets: {
    monthlyNetIncome: number;
    closings: PlanTargets;
    contractsWritten: PlanTargets;
    appointmentsHeld: PlanTargets;
    appointmentsSet: PlanTargets;
    engagements: PlanTargets;
    calls: PlanTargets;
  };
  updatedAt: string;
}

export interface DailyLog {
  id: string;
  userId: string;
  date: string; // ISO string e.g., '2023-10-27'
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
}

export interface Transaction {
  id: string;
  // Primary fields (matches API output)
  agentId?: string;
  agentDisplayName?: string;
  address: string;
  status: 'active' | 'pending' | 'sold' | 'canceled' | 'expired' | 'closed' | 'under_contract' | 'cancelled' | 'temp_off_market';
  transactionType?: 'residential_sale' | 'rental' | 'commercial_lease' | 'commercial_sale';
  dealValue?: number;
  commission?: number;
  brokerProfit?: number;
  contractDate?: string | null;
  closedDate?: string | null;
  year?: number;
  source?: 'manual' | 'import' | 'ghl';
  clientName?: string | null;
  notes?: string | null;
  splitSnapshot?: {
    grossCommission: number;
    agentNetCommission: number | null;
    companyRetained: number;
    agentSplitPercent?: number | null;
    companySplitPercent?: number | null;
    memberPaid?: number | null;
    leaderRetainedAfterMember?: number | null;
  };
  creditSnapshot?: {
    leaderboardAgentId: string;
    leaderboardAgentDisplayName: string;
    progressionCompanyDollarCredit: number;
  };
  createdAt?: any;
  updatedAt?: any;
  // Extended fields (from Add Transaction form)
  closingType?: string;
  dealType?: string;
  dealSource?: string;
  listPrice?: number;
  salePrice?: number;
  commissionPercent?: number;
  commissionBasePrice?: number;
  gci?: number;
  transactionFee?: number;
  earnestMoney?: number;
  listingDate?: string | null;
  optionExpiration?: string | null;
  inspectionDeadline?: string | null;
  surveyDeadline?: string | null;
  projectedCloseDate?: string | null;
  // Client contact
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientNewAddress?: string | null;
  clientType?: string;
  // Buyer info
  buyerName?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyer2Name?: string | null;
  buyer2Email?: string | null;
  buyer2Phone?: string | null;
  // Seller info
  sellerName?: string | null;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  seller2Name?: string | null;
  seller2Email?: string | null;
  seller2Phone?: string | null;
  // Legacy second client
  client2Name?: string | null;
  client2Email?: string | null;
  client2Phone?: string | null;
  // Cooperating agent
  otherAgentName?: string | null;
  otherAgentEmail?: string | null;
  otherAgentPhone?: string | null;
  otherBrokerage?: string | null;
  // Mortgage / Lender
  mortgageCompany?: string | null;
  loanOfficer?: string | null;
  loanOfficerEmail?: string | null;
  loanOfficerPhone?: string | null;
  lenderOffice?: string | null;
  // Title
  titleCompany?: string | null;
  titleOfficer?: string | null;
  titleOfficerEmail?: string | null;
  titleOfficerPhone?: string | null;
  titleAttorney?: string | null;
  titleOffice?: string | null;
  // TC
  tcWorking?: string;
  // Inspections
  inspectionOrdered?: string;
  targetInspectionDate?: string | null;
  inspectionTypes?: string[];
  tcScheduleInspections?: string;
  tcScheduleInspectionsOther?: string | null;
  inspectorName?: string | null;
  // Commission paid by seller
  sellerPayingListingAgent?: number | null;
  sellerPayingListingAgentUnknown?: boolean;
  sellerPayingBuyerAgent?: number | null;
  // Buyer closing cost
  buyerClosingCostTotal?: number | null;
  buyerClosingCostAgentCommission?: number | null;
  buyerClosingCostTxFee?: number | null;
  buyerClosingCostOther?: number | null;
  // Additional info
  warrantyAtClosing?: string;
  warrantyPaidBy?: string | null;
  txComplianceFee?: string;
  txComplianceFeeAmount?: number | null;
  txComplianceFeePaidBy?: string | null;
  occupancyAgreement?: string;
  occupancyDates?: string | null;
  shortageInCommission?: string;
  shortageAmount?: number | null;
  buyerBringToClosing?: number | null;
  additionalComments?: string | null;
  // Legacy fields
  userId?: string;
  netCommission?: number;
  closingDate?: string;
}

export interface Opportunity {
  id: string;
  agentId: string;
  contactName: string;
  appointmentDate?: string; // YYYY-MM-DD
  priceRangeLow?: number;
  priceRangeHigh?: number;
  isActive: boolean;
  stage: 'Hot' | 'Nurture' | 'Watch';
  notes?: string;
  scheduledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface YtdValueMetrics {
  closedNetCommission: number;
  engagements: number;
  appointmentsHeld: number;
  valuePerEngagement: number | null;
  targetValuePerEngagement: number | null;
  valuePerAppointmentHeld: number | null;
  targetValuePerAppointmentHeld: number | null;
}

interface ConversionMetric {
  actual: number | null; // percentage, null if not calculable
  plan: number; // percentage
}

// Pre-computed data for agent dashboard, updated by a Cloud Function
// periodically or on-demand.
export interface AgentDashboardData {
  userId: string;

  leadIndicatorGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  leadIndicatorPerformance: number; // 0-100+
  isLeadIndicatorGracePeriod: boolean;

  incomeGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  incomePerformance: number; // 0-100+
  isIncomeGracePeriod: boolean;
  isMetricsGracePeriod: boolean; // 90-day admin-set grace period for income/deals/volume
  expectedYTDIncomeGoal: number;
  ytdTotalPotential: number;

  pipelineAdjustedIncome: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    performance: number;
  };

  kpis: {
    calls: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    engagements: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    appointmentsSet: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    appointmentsHeld: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    contractsWritten: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    closings: { actual: number; target: number; performance: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
  };
  netEarned: number;
  netPending: number;

  monthlyIncome: { month: string; closed: number; pending: number; goal: number }[];
  totalClosedIncomeForYear: number;
  totalPendingIncomeForYear: number;
  totalIncomeWithPipelineForYear: number;

  // Proration / pacing fields for the upgraded dashboard.
  effectiveStartDate?: string; // YYYY-MM-DD
  annualIncomeGoal?: number;
  projectedNetIncome?: number;
  incomeDeltaToGoal?: number;

  engagementGoalToDate?: number;
  engagementDelta?: number;
  catchUpWindowDays?: number;
  catchUpDailyRequired?: number;

  // The forecast section would be powered by the GenAI flow.
  // The Cloud Function would call the AI model and store the result here.
  forecast: {
    projectedClosings: number;
    paceBasedNetIncome: number;
  };

  conversions: {
    callToEngagement: ConversionMetric;
    engagementToAppointmentSet: ConversionMetric;
    appointmentSetToHeld: ConversionMetric;
    appointmentHeldToContract: ConversionMetric;
    contractToClosing: ConversionMetric;
  };

  stats: {
    ytdVolume: number;
    avgSalesPrice: number;
    buyerClosings: number;
    sellerClosings: number;
    renterClosings: number;
    avgCommission: number;
    engagementValue: number;
    appointmentValue: number;
    avgCommissionPct: number;
    pendingVolume: number;
  };

  // Tier / cap progress
  tierProgress?: {
    tiers: { tierName: string; fromCompanyDollar: number; toCompanyDollar: number | null; agentSplitPercent: number; companySplitPercent: number }[];
    grossGCIYTD: number;             // total gross commission generated this year (tier metric)
    pendingGrossGCI: number;         // pending gross commission
    currentTierIndex: number;        // which tier the agent is in (0-based)
    currentTierName: string;
    nextTierName: string | null;
    nextTierThreshold: number | null; // $ needed to reach next tier
    progressInCurrentTier: number;    // 0-100 percentage through current tier
    capReached: boolean;             // true if at highest tier and past toCompanyDollar
    effectiveStartDate: string | null; // agent start date
    anniversaryDate: string | null;   // next anniversary (tier reset) date
    daysUntilReset: number | null;    // days until anniversary/tier reset
    planName?: string | null;         // human-readable name of the commission plan
    cycleLabel?: string;               // e.g. "Jun 15, 2025 – Jun 14, 2026"
    cycleStart?: string;               // YYYY-MM-DD start of current anniversary cycle
    cycleEnd?: string;                 // YYYY-MM-DD end of current anniversary cycle
  };

  // Volume & deals grading
  volumeMetrics?: {
    closedVolume: number;
    pendingVolume: number;
    totalVolume: number;
    volumeGoal: number | null;
    volumeGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    volumePerformance: number;
    projectedVolumeGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    projectedVolumePerformance: number;
    closedDeals: number;
    pendingDeals: number;
    dealsGoal: number | null;
    dealsGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    dealsPerformance: number;
    projectedDealsGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    projectedDealsPerformance: number;
    projectedVolumeGoal: number | null;
    projectedDealsGoal: number | null;
    projectedIncomeGoal: number | null;
  };

  // Previous year comparison
  prevYearComparison?: {
    year: number;
    avgSalesPrice: number;
    avgCommissionPct: number;
    engagementValue: number;
    appointmentValue: number;
    netEarned: number;
    closedVolume: number;
    closedDeals: number;
  } | null;

  availableComparisonYears?: number[];
}

export type LeaderboardMetricKey = 'closed' | 'pending' | 'total';

export const leaderboardMetrics: { key: LeaderboardMetricKey; label: string }[] = [
  { key: 'closed', label: 'Closed Units' },
  { key: 'pending', label: 'Pending Units' },
  { key: 'total', label: 'Total Units (Closed + Pending)' },
];

export type LeaderboardPeriod = 'yearly' | 'quarterly' | 'monthly';

export interface LeaderboardConfig {
  periodType: LeaderboardPeriod;
  year: number;
  quarter?: number;
  month?: number;
  title: string;
  subtitle: string;
  primaryMetricKey: LeaderboardMetricKey;
  showTopN: number;
}

export interface ProductionLeaderboardRow {
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  closed: number;
  pending: number;
  total: number;
  isCorrected: boolean;
  correctionReason?: string;
}

export interface LeaderboardRollup {
  periodId: string;
  startDate: string;
  endDate: string;
  agents: ProductionLeaderboardRow[];
}

export interface NewActivityConfig {
  lookbackDays: 30 | 60 | 90;
  showTopN: number;
  sortOrder: 'newestFirst';
  title: string;
  showAddress: boolean;
}

export interface NewActivityItem {
  id: string;
  date: string; // 'YYYY-MM-DD'
  agentDisplayName: string;
  addressShort: string;
  price: number;
}

export interface NewActivityRollup {
  lookbackDays: number;
  generatedAt: string; // ISO string
  newListings: NewActivityItem[];
  newContracts: NewActivityItem[];
}

export interface AgentYearRollup {
  agentId: string;
  year: number;
  closed: number;
  pending: number;
  listings: {
    active: number;
    canceled: number;
    expired: number;
  };
  totals: {
    transactions: number;
    listings: number;
    all: number;
  };
}

// ── Activity Tracker types ────────────────────────────────────────────────────
export interface DailyActivity {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
  notes?: string;
}

export interface AppointmentLog {
  id: string;
  date: string; // YYYY-MM-DD — the date the appointment is scheduled/held
  time?: string; // "HH:mm" optional
  contactName: string;
  notes?: string;
  // Client type: buyer | seller | both
  category: 'buyer' | 'seller' | 'both';
  status?: 'scheduled' | 'held' | 'canceled' | 'no_show';
  scheduledAt?: string; // ISO — appointment date/time
  heldAt?: string;      // ISO — when actually held
  // Date appointment was set (logged)
  dateSet?: string;     // YYYY-MM-DD
  timeSet?: string;     // "HH:mm"
  // Sale price range
  priceRangeLow?: number;
  priceRangeHigh?: number;
  // Timing bucket: how soon the client expects to transact
  timing?: '0_60' | '60_120' | '120_plus' | 'other';
  // Source flag for bulk imports
  source?: 'manual' | 'bulk_import';
  createdAt?: string;
  updatedAt?: string;
}
