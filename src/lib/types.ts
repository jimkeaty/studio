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
  status: 'pending' | 'closed' | 'under_contract' | 'cancelled';
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
  };
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
