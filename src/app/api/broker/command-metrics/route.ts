// src/app/api/broker/command-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
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
} from '@/lib/types/brokerCommandMetrics';

// --- Firebase Admin Initialization ---
const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

const db = admin.firestore();

// --- Type Definitions (from original service) ---
interface Transaction {
  agentId: string;
  status: 'closed' | 'pending' | 'under_contract';
  closedDate?: admin.firestore.Timestamp;
  contractDate?: admin.firestore.Timestamp;
  brokerProfit: number;
  dealValue: number;
  transactionType: 'residential_sale' | 'rental' | 'commercial_lease' | 'commercial_sale';
  year: number;
}

interface AgentProfile {
  status: 'active';
  hireDate: admin.firestore.Timestamp;
}

// --- Data Aggregation Logic (moved from service) ---

const getInitialCategoryMetrics = (): CategoryMetrics => ({
  residential_sale: { count: 0, netRevenue: 0 },
  rental: { count: 0, netRevenue: 0 },
  commercial_lease: { count: 0, netRevenue: 0 },
  commercial_sale: { count: 0, netRevenue: 0 },
  unknown: { count: 0, netRevenue: 0 },
});

async function getActiveAgentCount(atDate: Date): Promise<number> {
  const agentsQuery = db.collection('users').where('status', '==', 'active');
  const agentsSnap = await agentsQuery.get();
  let count = 0;
  agentsSnap.forEach(doc => {
    const agent = doc.data() as AgentProfile;
    if (agent.hireDate && agent.hireDate.toDate() <= atDate) {
      count++;
    }
  });
  return count;
}

async function getMetricsForPeriod(
  period: Period,
  activeAgentCount: number,
): Promise<PeriodMetrics> {
  let startDate: Date, endDate: Date;

  if (period.type === 'year') {
    startDate = startOfYear(new Date(period.year, 0, 1));
    endDate = endOfYear(new Date(period.year, 0, 1));
  } else {
    startDate = startOfMonth(new Date(period.year, period.month! - 1, 1));
    endDate = endOfMonth(new Date(period.year, period.month! - 1, 1));
  }

  const transactionsQuery = db.collection('transactions').where('year', '==', period.year);
  const transactionsSnap = await transactionsQuery.get();
  const transactions = transactionsSnap.docs.map(d => d.data() as Transaction);

  const metrics: PeriodMetrics = {
    period,
    startDate,
    endDate,
    netRevenue: { closed: 0, pending: 0, goal: null },
    volume: { closed: 0, pending: 0 },
    transactions: { closed: 0, pending: 0 },
    categoryBreakdown: { closed: getInitialCategoryMetrics(), pending: getInitialCategoryMetrics() },
    activeAgents: { count: activeAgentCount, dealsPerAgent: 0 }
  };

  for (const t of transactions) {
    const type = t.transactionType || 'unknown';
    if (t.status === 'closed' && t.closedDate) {
      const closedDate = t.closedDate.toDate();
      if (closedDate >= startDate && closedDate <= endDate) {
        metrics.netRevenue.closed += t.brokerProfit || 0;
        metrics.volume.closed += t.dealValue || 0;
        metrics.transactions.closed++;
        metrics.categoryBreakdown.closed[type as keyof CategoryMetrics].count++;
        metrics.categoryBreakdown.closed[type as keyof CategoryMetrics].netRevenue += t.brokerProfit || 0;
      }
    } else if ((t.status === 'pending' || t.status === 'under_contract') && t.contractDate) {
      const contractDate = t.contractDate.toDate();
      if (contractDate >= startDate && contractDate <= endDate) {
        metrics.netRevenue.pending += t.brokerProfit || 0;
        metrics.volume.pending += t.dealValue || 0;
        metrics.transactions.pending++;
        metrics.categoryBreakdown.pending[type as keyof CategoryMetrics].count++;
        metrics.categoryBreakdown.pending[type as keyof CategoryMetrics].netRevenue += t.brokerProfit || 0;
      }
    }
  }

  if (activeAgentCount > 0) {
    metrics.activeAgents.dealsPerAgent = metrics.transactions.closed / activeAgentCount;
  }

  return metrics;
}

// --- API Route Handler ---

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate and Authorize
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.uid !== ADMIN_UID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Get Query Params
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as Period['type'] | null;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : null;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!, 10) : null;

    if (!type || !year || (type === 'month' && !month)) {
      return NextResponse.json({ error: 'Bad Request: Missing query parameters' }, { status: 400 });
    }

    const period: Period = type === 'year' ? { type: 'year', year } : { type: 'month', year, month: month! };

    // 3. Perform Data Aggregation
    const currentPeriodEndDate = period.type === 'year' ? endOfYear(new Date(period.year, 0, 1)) : endOfMonth(new Date(period.year, period.month! - 1));
    const activeAgentCount = await getActiveAgentCount(currentPeriodEndDate);
    const currentPeriodMetrics = await getMetricsForPeriod(period, activeAgentCount);
    
    let comparisonPeriodMetrics: PeriodMetrics | undefined = undefined;
    if (period.type === 'month') {
        const comparisonPeriod: Period = { ...period, year: period.year - 1 };
        const comparisonActiveAgentCount = await getActiveAgentCount(subYears(currentPeriodEndDate, 1));
        comparisonPeriodMetrics = await getMetricsForPeriod(comparisonPeriod, comparisonActiveAgentCount);
    }

    const trendEndDate = period.type === 'month' ? startOfMonth(new Date(period.year, period.month! - 1)) : new Date();
    const trendStartDate = subYears(trendEndDate, 1);
    const monthsInterval = eachMonthOfInterval({ start: trendStartDate, end: trendEndDate });
    
    const monthlyTrend = await Promise.all(
        monthsInterval.map(async (monthDate) => {
            const trendYear = monthDate.getFullYear();
            const trendMonth = monthDate.getMonth();
            const agentCount = await getActiveAgentCount(endOfMonth(monthDate));
            const transQuery = db.collection('transactions').where('year', '==', trendYear).where('status', '==', 'closed');
            const transSnap = await transQuery.get();
            let closedDeals = 0;
            transSnap.forEach(doc => {
                const t = doc.data() as Transaction;
                if (t.closedDate && t.closedDate.toDate().getMonth() === trendMonth) {
                    closedDeals++;
                }
            });
            return {
                month: format(monthDate, 'MMM yy'),
                activeAgents: agentCount,
                closedDeals: closedDeals,
                dealsPerAgent: agentCount > 0 ? closedDeals / agentCount : 0,
            };
        })
    );

    const result: BrokerCommandMetrics = {
        currentPeriodMetrics,
        comparisonPeriodMetrics,
        monthlyTrend,
    };

    // 4. Return Data
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[API/broker/command-metrics] Error:', error);
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
