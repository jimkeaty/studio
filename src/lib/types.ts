export type UserRole = 'agent' | 'manager' | 'broker' | 'admin';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  brokerageId: string;
  avatarUrl?: string;
}

export interface BusinessPlan {
  id: string;
  userId: string;
  year: number;
  annualIncomeGoal: number;
  // This would be calculated by a Cloud Function when the plan is created/updated.
  calculatedTargets: {
    monthlyNetIncome: number;
    dailyCalls: number;
    dailyEngagements: number;
    dailyAppointmentsSet: number;
    dailyAppointmentsHeld: number;
    dailyContractsWritten: number;
    closings: number;
  };
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

  monthlyIncome: { month: string; closed: number; pending: number }[];

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
    avgCommission: number;
    engagementValue: number;
  };
}
