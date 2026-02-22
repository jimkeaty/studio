

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
  locked: boolean;
  [key: string]: any;
}

export interface DailyActivity {
  id: string; // {agentId}_{YYYY-MM-DD}
  agentId: string;
  date: string; // YYYY-MM-DD
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
  notes?: string;
  updatedAt: any; // Firestore Timestamp
  updatedByUid: string;
}

export interface AppointmentLog {
  id: string; // Firestore auto-ID
  agentId: string;
  date: string; // YYYY-MM-DD, the day it was counted
  category: "buyer" | "seller";
  status: "set" | "held";
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  scheduledAt?: any; // Firestore Timestamp
  heldAt?: any; // Firestore Timestamp
  notes?: string;
  createdAt: any; // Firestore Timestamp
  createdByUid: string;
}
