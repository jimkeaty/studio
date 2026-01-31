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

// Pre-computed data for agent dashboard, updated by a Cloud Function
// periodically or on-demand.
export interface AgentDashboardData {
  userId: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  progress: number; // 0-100
  kpis: {
    calls: { actual: number; target: number };
    engagements: { actual: number; target: number };
    appointmentsHeld: { actual: number; target: number };
    contractsWritten: { actual: number; target: number };
    closings: { actual: number; target: number };
  };
  netEarned: number;
  netPending: number;
  // The forecast section would be powered by the GenAI flow.
  // The Cloud Function would call the AI model and store the result here.
  forecast: {
    projectedClosings: number;
    paceBasedNetIncome: number;
  };
}
