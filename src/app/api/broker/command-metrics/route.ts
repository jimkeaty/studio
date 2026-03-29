// src/app/api/broker/command-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type admin from 'firebase-admin';
import { format } from 'date-fns';
import type {
  BrokerCommandMetrics,
  BrokerCommandOverview,
  MonthlyData,
  CategoryMetrics,
  Metric,
} from '@/lib/types/brokerCommandMetrics';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// ── Transaction shape in Firestore ──────────────────────────────────────────
interface Transaction {
  agentId: string;
  status: string;
  closedDate?: admin.firestore.Timestamp | string;
  contractDate?: admin.firestore.Timestamp | string;
  brokerProfit: number;
  dealValue: number;
  commission?: number;
  transactionType: string;
  transactionFee?: number;
  dealSource?: string;
  year: number;
  splitSnapshot?: {
    grossCommission?: number;
    companyRetained?: number;
    primaryTeamId?: string | null;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(raw: admin.firestore.Timestamp | string | undefined | null): Date | null {
  if (!raw) return null;
  if (typeof (raw as any).toDate === 'function') {
    return (raw as admin.firestore.Timestamp).toDate();
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function emptyCategory(): Metric {
  return { count: 0, netRevenue: 0, volume: 0 };
}

function emptyCategoryMetrics(): CategoryMetrics {
  return {
    residential_sale: emptyCategory(),
    rental: emptyCategory(),
    commercial_lease: emptyCategory(),
    commercial_sale: emptyCategory(),
    land: emptyCategory(),
    unknown: emptyCategory(),
  };
}

function emptyMonth(monthNum: number): MonthlyData {
  return {
    month: monthNum,
    label: format(new Date(2000, monthNum - 1), 'MMM'),
    totalGCI: 0,
    grossMargin: 0,
    grossMarginPct: 0,
    transactionFees: 0,
    closedVolume: 0,
    pendingVolume: 0,
    closedCount: 0,
    pendingCount: 0,
    grossMarginGoal: null,
    volumeGoal: null,
    salesCountGoal: null,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Parse params
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const compareYearParam = searchParams.get('compareYear');
    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : null;
    const teamIdParam = searchParams.get('teamId'); // null = all teams
    const typeFilter = searchParams.get('type'); // null = all types, e.g. "commercial_sale", "rental", "land", "residential_sale"

    // 3. Fetch teams list + agent profiles for team filtering
    const [teamsSnap, agentProfilesSnap] = await Promise.all([
      adminDb.collection('teams').where('status', '==', 'active').get(),
      teamIdParam
        ? adminDb.collection('agentProfiles').where('primaryTeamId', '==', teamIdParam).get()
        : Promise.resolve(null),
    ]);

    const teams = teamsSnap.docs.map(d => ({
      teamId: d.data().teamId as string,
      teamName: d.data().teamName as string,
    }));

    // Build set of agentIds belonging to the selected team
    const teamAgentIds: Set<string> | null = agentProfilesSnap
      ? new Set(agentProfilesSnap.docs.map(d => d.data().agentId as string))
      : null;

    // Helper to filter transactions by team
    // Map user-friendly type filter values to transaction types
    const typeFilterSet: Set<string> | null = typeFilter
      ? typeFilter === 'commercial'
        ? new Set(['commercial_sale', 'commercial_lease'])
        : typeFilter === 'residential'
        ? new Set(['residential_sale'])
        : new Set([typeFilter]) // "rental", "land", "commercial_sale", "commercial_lease"
      : null;

    const filterTransactions = (txList: Transaction[]): Transaction[] => {
      let result = txList;
      // Team filter
      if (teamAgentIds) {
        result = result.filter(t =>
          teamAgentIds.has(t.agentId) ||
          t.splitSnapshot?.primaryTeamId === teamIdParam
        );
      }
      // Type filter
      if (typeFilterSet) {
        result = result.filter(t => typeFilterSet.has(t.transactionType || ''));
      }
      return result;
    };

    // 3b. Fetch transactions for this year, previous year (seasonality), and optional comparison year
    const prevYear = year - 1;
    const fetchPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [
      adminDb.collection('transactions').where('year', '==', year).get(),
      adminDb.collection('transactions').where('year', '==', prevYear).get(),
    ];
    if (compareYear && compareYear !== prevYear && compareYear !== year) {
      fetchPromises.push(
        adminDb.collection('transactions').where('year', '==', compareYear).get()
      );
    }

    const snapResults = await Promise.all(fetchPromises);
    const allTransactions = snapResults[0].docs.map(d => d.data() as Transaction);
    const allPrevTransactions = snapResults[1].docs.map(d => d.data() as Transaction);

    // Apply team filter
    const transactions = filterTransactions(allTransactions);
    const prevTransactions = filterTransactions(allPrevTransactions);

    const allCompareRaw = compareYear
      ? compareYear === prevYear
        ? allPrevTransactions
        : compareYear === year
        ? allTransactions
        : (snapResults[2]?.docs.map(d => d.data() as Transaction) ?? [])
      : [];
    const compareTransactions = filterTransactions(allCompareRaw);

    // Available years from all transaction data
    const allYearsSnap = await adminDb.collection('transactions')
      .where('status', '==', 'closed')
      .select('year')
      .get();
    const availableYears = [...new Set(allYearsSnap.docs.map(d => d.data().year as number))]
      .filter(y => y !== year)
      .sort((a, b) => b - a);

    // 4. Fetch goals for this year (segment = teamId or 'TOTAL')
    const goalSegment = teamIdParam || 'TOTAL';
    const goalsSnap = await adminDb
      .collection('brokerCommandGoals')
      .where('year', '==', year)
      .where('segment', '==', goalSegment)
      .get();
    const goalsMap = new Map<number, { grossMarginGoal: number | null; volumeGoal: number | null; salesCountGoal: number | null }>();
    goalsSnap.docs.forEach(d => {
      const g = d.data();
      goalsMap.set(g.month, {
        grossMarginGoal: g.grossMarginGoal ?? null,
        volumeGoal: g.volumeGoal ?? null,
        salesCountGoal: g.salesCountGoal ?? null,
      });
    });

    // 5. Initialize 12-month buckets
    const months: MonthlyData[] = [];
    for (let m = 1; m <= 12; m++) {
      const md = emptyMonth(m);
      const goals = goalsMap.get(m);
      if (goals) {
        md.grossMarginGoal = goals.grossMarginGoal;
        md.volumeGoal = goals.volumeGoal;
        md.salesCountGoal = goals.salesCountGoal;
      }
      months.push(md);
    }

    // Yearly totals
    const totals = {
      totalGCI: 0,
      grossMargin: 0,
      grossMarginPct: 0,
      agentNetCommission: 0,
      transactionFees: 0,
      closedVolume: 0,
      pendingVolume: 0,
      closedCount: 0,
      pendingCount: 0,
    };

    const categoryBreakdown = {
      closed: emptyCategoryMetrics(),
      pending: emptyCategoryMetrics(),
    };

    const sourceBreakdown: { closed: Record<string, { count: number; volume: number; netRevenue: number }>; pending: Record<string, { count: number; volume: number; netRevenue: number }> } = {
      closed: {},
      pending: {},
    };

    const addToSource = (bucket: typeof sourceBreakdown.closed, src: string, volume: number, netRevenue: number) => {
      if (!bucket[src]) bucket[src] = { count: 0, volume: 0, netRevenue: 0 };
      bucket[src].count += 1;
      bucket[src].volume += volume;
      bucket[src].netRevenue += netRevenue;
    };

    // 6. Process each transaction
    for (const t of transactions) {
      const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
      const companyRetained = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
      const dealValue = t.dealValue ?? 0;
      const txFee = t.transactionFee ?? 0;
      const rawType = (t.transactionType || 'unknown').toLowerCase();
      const catKey = (rawType in categoryBreakdown.closed ? rawType : 'unknown') as keyof CategoryMetrics;
      const srcKey = (t.dealSource || 'other').toLowerCase();

      if (t.status === 'closed') {
        const closedDate = parseDate(t.closedDate);
        if (!closedDate) continue;

        // Check this transaction belongs to the requested year
        const txMonth = closedDate.getMonth(); // 0-based
        if (closedDate.getFullYear() !== year) continue;

        const md = months[txMonth]; // 0-based index

        // Monthly
        md.totalGCI += gci;
        md.grossMargin += companyRetained;
        md.transactionFees += txFee;
        md.closedVolume += dealValue;
        md.closedCount += 1;

        // Yearly totals
        totals.totalGCI += gci;
        totals.grossMargin += companyRetained;
        totals.agentNetCommission += Math.max(0, gci - companyRetained);
        totals.transactionFees += txFee;
        totals.closedVolume += dealValue;
        totals.closedCount += 1;

        // Category
        categoryBreakdown.closed[catKey].count += 1;
        categoryBreakdown.closed[catKey].netRevenue += companyRetained;
        categoryBreakdown.closed[catKey].volume += dealValue;

        // Source
        addToSource(sourceBreakdown.closed, srcKey, dealValue, companyRetained);

      } else if (t.status === 'pending' || t.status === 'under_contract') {
        const contractDate = parseDate(t.contractDate);
        const txMonth = contractDate ? contractDate.getMonth() : null;

        // Pending totals always count for the year
        totals.pendingVolume += dealValue;
        totals.pendingCount += 1;

        // Monthly (use contract month if available)
        if (txMonth !== null && contractDate && contractDate.getFullYear() === year) {
          months[txMonth].pendingVolume += dealValue;
          months[txMonth].pendingCount += 1;
        }

        // Category
        categoryBreakdown.pending[catKey].count += 1;
        categoryBreakdown.pending[catKey].netRevenue += companyRetained;
        categoryBreakdown.pending[catKey].volume += dealValue;

        // Source
        addToSource(sourceBreakdown.pending, srcKey, dealValue, companyRetained);
      }
    }

    // 7. Calculate gross margin % for each month and for yearly totals
    for (const md of months) {
      md.grossMarginPct = md.totalGCI > 0
        ? Math.round((md.grossMargin / md.totalGCI) * 10000) / 100
        : 0;
    }
    totals.grossMarginPct = totals.totalGCI > 0
      ? Math.round((totals.grossMargin / totals.totalGCI) * 10000) / 100
      : 0;

    // 8. Build previous year seasonality + averages
    const prevMonthly = Array.from({ length: 12 }, () => ({
      closedVolume: 0, closedCount: 0, totalGCI: 0, grossMargin: 0,
    }));
    let prevTotalVolume = 0;
    let prevTotalCount = 0;
    let prevTotalGCI = 0;
    let prevTotalMargin = 0;

    for (const t of prevTransactions) {
      if (t.status !== 'closed') continue;
      const closedDate = parseDate(t.closedDate);
      if (!closedDate || closedDate.getFullYear() !== prevYear) continue;

      const m = closedDate.getMonth();
      const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
      const margin = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
      const vol = t.dealValue ?? 0;

      prevMonthly[m].closedVolume += vol;
      prevMonthly[m].closedCount += 1;
      prevMonthly[m].totalGCI += gci;
      prevMonthly[m].grossMargin += margin;

      prevTotalVolume += vol;
      prevTotalCount += 1;
      prevTotalGCI += gci;
      prevTotalMargin += margin;
    }

    // Seasonality: what % of the year each month represented
    const seasonality = prevMonthly.map((pm, i) => ({
      month: i + 1,
      label: format(new Date(2000, i), 'MMM'),
      volumePct: prevTotalVolume > 0 ? Math.round((pm.closedVolume / prevTotalVolume) * 10000) / 100 : 8.33,
      salesPct: prevTotalCount > 0 ? Math.round((pm.closedCount / prevTotalCount) * 10000) / 100 : 8.33,
      closedVolume: pm.closedVolume,
      closedCount: pm.closedCount,
      totalGCI: pm.totalGCI,
      grossMargin: pm.grossMargin,
    }));

    const prevYearStats = {
      year: prevYear,
      totalVolume: prevTotalVolume,
      totalSales: prevTotalCount,
      totalGCI: prevTotalGCI,
      totalGrossMargin: prevTotalMargin,
      avgSalePrice: prevTotalCount > 0 ? Math.round(prevTotalVolume / prevTotalCount) : 0,
      avgGCI: prevTotalCount > 0 ? Math.round(prevTotalGCI / prevTotalCount) : 0,
      avgGrossMargin: prevTotalCount > 0 ? Math.round(prevTotalMargin / prevTotalCount) : 0,
      avgMarginPct: prevTotalGCI > 0 ? Math.round((prevTotalMargin / prevTotalGCI) * 10000) / 100 : 0,
      avgCommissionPct: prevTotalVolume > 0 ? Math.round((prevTotalGCI / prevTotalVolume) * 100000) / 1000 : 0,
      seasonality,
    };

    // 9. Build comparison year monthly data (if requested)
    let comparisonData: { year: number; months: { month: number; label: string; grossMargin: number; closedVolume: number; closedCount: number; totalGCI: number }[] } | null = null;

    if (compareYear && compareTransactions.length > 0) {
      const compMonths = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        label: format(new Date(2000, i), 'MMM'),
        grossMargin: 0,
        closedVolume: 0,
        closedCount: 0,
        totalGCI: 0,
      }));

      for (const t of compareTransactions) {
        if (t.status !== 'closed') continue;
        const closedDate = parseDate(t.closedDate);
        if (!closedDate || closedDate.getFullYear() !== compareYear) continue;
        const m = closedDate.getMonth();
        const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
        const margin = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
        const vol = t.dealValue ?? 0;

        compMonths[m].grossMargin += margin;
        compMonths[m].closedVolume += vol;
        compMonths[m].closedCount += 1;
        compMonths[m].totalGCI += gci;
      }

      comparisonData = { year: compareYear, months: compMonths };
    }

    // 10. Build response
    const overview: BrokerCommandOverview = {
      year,
      totals,
      months,
      categoryBreakdown,
      sourceBreakdown,
    };

    const result: BrokerCommandMetrics = {
      overview,
      prevYearStats,
      availableYears,
      comparisonData,
      teams,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API/broker/command-metrics]', error);
    if (error.code?.startsWith('auth/')) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
