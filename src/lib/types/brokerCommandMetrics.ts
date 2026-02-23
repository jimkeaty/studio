import { Timestamp } from "firebase/firestore";

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
  unknown: Metric;
};

export type PeriodMetrics = {
  period: Period;
  startDate: Date;
  endDate: Date;
  netRevenue: {
    closed: number;
    pending: number;
    goal: number | null; // Goal might not exist
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
  currentPeriodMetrics: PeriodMetrics;
  comparisonPeriodMetrics?: PeriodMetrics; // For YoY
  monthlyTrend: { month: string, activeAgents: number; closedDeals: number; dealsPerAgent: number; }[];
};
