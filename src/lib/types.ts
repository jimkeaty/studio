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
  calls: number;
  engagements: number;
  appointmentsSet: number;
  appointmentsHeld: number;
  contractsWritten: number;
}

export interface Transaction {
  id: string;
  userId: string;
  clientName: string;
  address: string;
  status: 'pending' | 'closed';
  netCommission: number;
  closingDate: string; // ISO string
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

  monthlyIncome: { month: string; closed: number; pending: number; goal: number; }[];
  totalClosedIncomeForYear: number;
  totalPendingIncomeForYear: number;
  totalIncomeWithPipelineForYear: number;

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

export type LeaderboardMetricKey =
  | 'calls'
  | 'engagements'
  | 'apptsSet'
  | 'apptsHeld'
  | 'contracts'
  | 'closings';

export const leaderboardMetrics: { key: LeaderboardMetricKey; label: string }[] = [
  { key: 'calls', label: 'Calls' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'apptsSet', label: 'Appointments Set' },
  { key: 'apptsHeld', label: 'Appointments Held' },
  { key: 'contracts', label: 'Contracts Written' },
  { key: 'closings', label: 'Closings' },
];

export interface LeaderboardConfig {
  periodType: 'monthly' | 'quarterly';
  periodId: string; // e.g., '2026-02' or '2026-Q1'
  title: string;
  subtitle: string;
  primaryMetricKey: LeaderboardMetricKey;
  secondaryMetricKey?: LeaderboardMetricKey;
  showTopN: number;
  visualMode: 'raceTrack' | 'podium' | 'progressBars';
  sortBy: 'primaryThenSecondary';
}

export interface LeaderboardAgentMetrics {
  agentId: string;
  displayName: string; // "First L."
  teamType: 'CGL' | 'SGL';
  avatarUrl?: string;
  metrics: Record<LeaderboardMetricKey, number>;
}

export interface LeaderboardRollup {
  periodId: string;
  startDate: string;
  endDate: string;
  agents: LeaderboardAgentMetrics[];
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
  locked: boolean;
  [key: string]: any;
}
