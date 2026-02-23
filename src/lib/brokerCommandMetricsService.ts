// src/lib/brokerCommandMetricsService.ts
'use client';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import {
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  subYears,
  eachMonthOfInterval,
  format,
} from 'date-fns';
import type {
  BrokerCommandMetrics,
  PeriodMetrics,
  CategoryMetrics,
  Metric,
  Period,
} from './types/brokerCommandMetrics';

// Schema assumptions
interface Transaction {
  agentId: string;
  status: 'closed' | 'pending' | 'under_contract';
  closedDate?: Timestamp;
  contractDate?: Timestamp;
  brokerProfit: number;
  dealValue: number; // For volume
  transactionType: 'residential_sale' | 'rental' | 'commercial_lease' | 'commercial_sale';
  year: number;
}

interface AgentProfile {
    status: 'active';
    hireDate: Timestamp;
}


const getInitialCategoryMetrics = (): CategoryMetrics => ({
  residential_sale: { count: 0, netRevenue: 0 },
  rental: { count: 0, netRevenue: 0 },
  commercial_lease: { count: 0, netRevenue: 0 },
  commercial_sale: { count: 0, netRevenue: 0 },
  unknown: { count: 0, netRevenue: 0 },
});

async function getMetricsForPeriod(
  db: Firestore,
  period: Period,
  activeAgentCount: number,
): Promise<PeriodMetrics> {
  let startDate: Date;
  let endDate: Date;

  if (period.type === 'year') {
    startDate = startOfYear(new Date(period.year, 0, 1));
    endDate = endOfYear(new Date(period.year, 0, 1));
  } else {
    startDate = startOfMonth(new Date(period.year, period.month! - 1, 1));
    endDate = endOfMonth(new Date(period.year, period.month! - 1, 1));
  }
  
  const transactionsQuery = query(
      collection(db, 'transactions'),
      // Querying on dates across different fields (closedDate, contractDate) is not feasible
      // without a unified 'eventDate' field. We fetch all of the year's data and filter in memory.
      where('year', '==', period.year),
  );

  const transactionsSnap = await getDocs(transactionsQuery);
  const transactions = transactionsSnap.docs.map(d => d.data() as Transaction);

  const metrics: PeriodMetrics = {
    period,
    startDate,
    endDate,
    netRevenue: { closed: 0, pending: 0, goal: null },
    volume: { closed: 0, pending: 0 },
    transactions: { closed: 0, pending: 0 },
    categoryBreakdown: {
        closed: getInitialCategoryMetrics(),
        pending: getInitialCategoryMetrics(),
    },
    activeAgents: {
        count: activeAgentCount,
        dealsPerAgent: 0,
    }
  };

  for (const t of transactions) {
    const type = t.transactionType || 'unknown';
    // Closed
    if (t.status === 'closed' && t.closedDate) {
        const closedDate = t.closedDate.toDate();
        if (closedDate >= startDate && closedDate <= endDate) {
            metrics.netRevenue.closed += t.brokerProfit || 0;
            metrics.volume.closed += t.dealValue || 0;
            metrics.transactions.closed++;
            metrics.categoryBreakdown.closed[type as keyof CategoryMetrics].count++;
            metrics.categoryBreakdown.closed[type as keyof CategoryMetrics].netRevenue += t.brokerProfit || 0;
        }
    }
    // Pending
    else if ((t.status === 'pending' || t.status === 'under_contract') && t.contractDate) {
        const contractDate = t.contractDate.toDate();
        if (contractDate >= startDate && contractDate <= endDate) {
            metrics.netRevenue.pending += t.brokerProfit || 0;
            metrics.volume.pending += t.dealValue || 0;
            metrics.transactions.pending++;
            metrics.categoryBreakdown.pending[type as keyof CategoryMetrics].count++;
            metrics.categoryBreakdown.pending[type as keyof CategoryMetrics].netRevenue += t.brokerProfit || 0;
        }
    } else if (t.status === 'pending' || t.status === 'under_contract') {
        console.warn('Pending transaction found without a contractDate, excluding from metrics.', t);
    }
  }

  if (activeAgentCount > 0) {
      metrics.activeAgents.dealsPerAgent = metrics.transactions.closed / activeAgentCount;
  }

  // In a real app, you might fetch goals from a 'brokerGoals' collection.
  // For now, this remains null.
  
  return metrics;
}

async function getActiveAgentCount(db: Firestore, atDate: Date): Promise<number> {
    const agentsQuery = query(collection(db, 'users'), where('status', '==', 'active'));
    const agentsSnap = await getDocs(agentsQuery);
    let count = 0;
    agentsSnap.forEach(doc => {
        const agent = doc.data() as AgentProfile;
        if (agent.hireDate && agent.hireDate.toDate() <= atDate) {
            count++;
        }
    });
    return count;
}


export async function getBrokerCommandMetrics(
  db: Firestore,
  period: Period
): Promise<BrokerCommandMetrics> {

    const currentPeriodEndDate = period.type === 'year' ? endOfYear(new Date(period.year, 0, 1)) : endOfMonth(new Date(period.year, period.month! -1));

    const activeAgentCount = await getActiveAgentCount(db, currentPeriodEndDate);
    
    const currentPeriodMetrics = await getMetricsForPeriod(db, period, activeAgentCount);
    let comparisonPeriodMetrics: PeriodMetrics | undefined = undefined;

    if (period.type === 'month') {
        const comparisonPeriod: Period = { ...period, year: period.year - 1 };
        const comparisonActiveAgentCount = await getActiveAgentCount(db, subYears(currentPeriodEndDate, 1));
        comparisonPeriodMetrics = await getMetricsForPeriod(db, comparisonPeriod, comparisonActiveAgentCount);
    }
    
    // Monthly trend for the last 12 months for the agent activity chart
    const trendEndDate = period.type === 'month' ? startOfMonth(new Date(period.year, period.month! - 1)) : new Date();
    const trendStartDate = subYears(trendEndDate, 1);
    const months = eachMonthOfInterval({ start: trendStartDate, end: trendEndDate });
    
    const monthlyTrend = await Promise.all(
        months.map(async (monthDate) => {
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const monthEndDate = endOfMonth(monthDate);
            const agentCount = await getActiveAgentCount(db, monthEndDate);

            const transQuery = query(collection(db, 'transactions'), where('year', '==', year), where('status', '==', 'closed'));
            const transSnap = await getDocs(transQuery);
            let closedDeals = 0;
            transSnap.forEach(doc => {
                const t = doc.data() as Transaction;
                if (t.closedDate && t.closedDate.toDate().getMonth() === month) {
                    closedDeals++;
                }
            });

            return {
                month: format(monthDate, 'MMM yy'),
                activeAgents: agentCount,
                closedDeals: closedDeals,
                dealsPerAgent: agentCount > 0 ? closedDeals / agentCount : 0,
            }
        })
    );
    
    return {
        currentPeriodMetrics,
        comparisonPeriodMetrics,
        monthlyTrend,
    };
}
