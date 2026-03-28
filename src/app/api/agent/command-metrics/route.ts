// GET /api/agent/command-metrics — 12-month performance data for agents & team leaders
// ?year=2026 — required
// ?view=personal|team — personal (default) or team (team leaders only)
// ?compareYear=2025 — optional comparison year
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type admin from 'firebase-admin';
import { format } from 'date-fns';
import type {
  BrokerCommandOverview,
  MonthlyData,
  CategoryMetrics,
  Metric,
} from '@/lib/types/brokerCommandMetrics';

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
  year: number;
  splitSnapshot?: {
    grossCommission?: number;
    companyRetained?: number;
    agentNetCommission?: number;
    primaryTeamId?: string | null;
  };
}

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

function emptyCategory(): Metric { return { count: 0, netRevenue: 0, volume: 0 }; }
function emptyCategoryMetrics(): CategoryMetrics {
  return {
    residential_sale: emptyCategory(), rental: emptyCategory(),
    commercial_lease: emptyCategory(), commercial_sale: emptyCategory(),
    land: emptyCategory(), unknown: emptyCategory(),
  };
}
function emptyMonth(m: number): MonthlyData {
  return {
    month: m, label: format(new Date(2000, m - 1), 'MMM'),
    totalGCI: 0, grossMargin: 0, grossMarginPct: 0, transactionFees: 0,
    closedVolume: 0, pendingVolume: 0, closedCount: 0, pendingCount: 0,
    grossMarginGoal: null, volumeGoal: null, salesCountGoal: null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

    const { searchParams } = new URL(req.url);
    // Allow admin to view any agent's metrics via ?viewAs=agentId
    const viewAs = searchParams.get('viewAs');
    const uid = (viewAs && decoded.uid === ADMIN_UID) ? viewAs : decoded.uid;
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const view = searchParams.get('view') || 'personal'; // 'personal' | 'team'
    const compareYearParam = searchParams.get('compareYear');
    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : null;

    // ── Load agent profile ────────────────────────────────────────────────
    const profileSnap = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid).limit(1).get();
    const profile = profileSnap.empty ? null : profileSnap.docs[0].data();

    const isTeamLeader = profile?.teamRole === 'leader' && !!profile?.primaryTeamId;
    const teamId = profile?.primaryTeamId || null;
    const teamName = profile?.teamName || null;

    // Determine which agent IDs to include
    let agentIds: Set<string>;
    let viewLabel = 'Personal';
    let availableTeams: { teamId: string; teamName: string }[] = [];

    if (view === 'team' && isTeamLeader && teamId) {
      // Team leader viewing their team
      const membersSnap = await adminDb.collection('agentProfiles')
        .where('primaryTeamId', '==', teamId).get();
      agentIds = new Set(membersSnap.docs.map(d => d.data().agentId as string));
      agentIds.add(uid); // Include leader
      viewLabel = teamName || 'My Team';
    } else {
      // Personal view
      agentIds = new Set([uid]);
    }

    // If team leader, let them know team view is available
    if (isTeamLeader && teamId) {
      availableTeams = [{ teamId, teamName: teamName || 'My Team' }];
    }

    // ── Fetch transactions ────────────────────────────────────────────────
    const prevYear = year - 1;
    const fetchYears = [year, prevYear];
    if (compareYear && !fetchYears.includes(compareYear)) fetchYears.push(compareYear);

    const snapResults = await Promise.all(
      fetchYears.map(y => adminDb.collection('transactions').where('year', '==', y).get())
    );

    const filterByAgents = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
      docs.map(d => d.data() as Transaction).filter(t => agentIds.has(t.agentId));

    const transactions = filterByAgents(snapResults[0].docs);
    const prevTransactions = filterByAgents(snapResults[1].docs);
    const compareTransactions = compareYear
      ? filterByAgents(snapResults[fetchYears.indexOf(compareYear)]?.docs || [])
      : [];

    // Available years
    const allYearsSnap = await adminDb.collection('transactions')
      .where('status', '==', 'closed').select('year', 'agentId').get();
    const availableYears = [...new Set(
      allYearsSnap.docs
        .filter(d => agentIds.has(d.data().agentId as string))
        .map(d => d.data().year as number)
    )].filter(y => y !== year).sort((a, b) => b - a);

    // ── Fetch goals ───────────────────────────────────────────────────────
    const goalSegment = view === 'team' && teamId ? teamId : `agent_${uid}`;
    const goalsSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', year).where('segment', '==', goalSegment).get();
    const goalsMap = new Map<number, { grossMarginGoal: number | null; volumeGoal: number | null; salesCountGoal: number | null }>();
    goalsSnap.docs.forEach(d => {
      const g = d.data();
      goalsMap.set(g.month, {
        grossMarginGoal: g.grossMarginGoal ?? null,
        volumeGoal: g.volumeGoal ?? null,
        salesCountGoal: g.salesCountGoal ?? null,
      });
    });

    // ── Build 12-month data ───────────────────────────────────────────────
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

    const totals = {
      totalGCI: 0, grossMargin: 0, grossMarginPct: 0, transactionFees: 0,
      closedVolume: 0, pendingVolume: 0, closedCount: 0, pendingCount: 0,
      // Agent-specific: net income (what agent takes home)
      netIncome: 0, pendingNetIncome: 0,
    };

    const categoryBreakdown = { closed: emptyCategoryMetrics(), pending: emptyCategoryMetrics() };

    // Also track monthly net income for agents
    const monthlyNetIncome: number[] = new Array(12).fill(0);
    const monthlyPendingNetIncome: number[] = new Array(12).fill(0);

    for (const t of transactions) {
      const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
      const companyRetained = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
      const agentNet = t.splitSnapshot?.agentNetCommission ?? (gci - companyRetained);
      const dealValue = t.dealValue ?? 0;
      const txFee = t.transactionFee ?? 0;
      const rawType = (t.transactionType || 'unknown').toLowerCase();
      const catKey = (rawType in categoryBreakdown.closed ? rawType : 'unknown') as keyof CategoryMetrics;

      if (t.status === 'closed') {
        const closedDate = parseDate(t.closedDate);
        if (!closedDate || closedDate.getFullYear() !== year) continue;
        const mi = closedDate.getMonth();

        months[mi].totalGCI += gci;
        months[mi].grossMargin += companyRetained;
        months[mi].transactionFees += txFee;
        months[mi].closedVolume += dealValue;
        months[mi].closedCount += 1;
        monthlyNetIncome[mi] += agentNet;

        totals.totalGCI += gci;
        totals.grossMargin += companyRetained;
        totals.transactionFees += txFee;
        totals.closedVolume += dealValue;
        totals.closedCount += 1;
        totals.netIncome += agentNet;

        categoryBreakdown.closed[catKey].count += 1;
        categoryBreakdown.closed[catKey].netRevenue += agentNet;
      } else if (t.status === 'pending' || t.status === 'under_contract') {
        const contractDate = parseDate(t.contractDate);
        const mi = contractDate && contractDate.getFullYear() === year ? contractDate.getMonth() : null;

        totals.pendingVolume += dealValue;
        totals.pendingCount += 1;
        totals.pendingNetIncome += agentNet;

        if (mi !== null) {
          months[mi].pendingVolume += dealValue;
          months[mi].pendingCount += 1;
          monthlyPendingNetIncome[mi] += agentNet;
        }

        categoryBreakdown.pending[catKey].count += 1;
        categoryBreakdown.pending[catKey].netRevenue += agentNet;
      }
    }

    // Gross margin %
    for (const md of months) {
      md.grossMarginPct = md.totalGCI > 0
        ? Math.round((md.grossMargin / md.totalGCI) * 10000) / 100 : 0;
    }
    totals.grossMarginPct = totals.totalGCI > 0
      ? Math.round((totals.grossMargin / totals.totalGCI) * 10000) / 100 : 0;

    // ── Previous year stats ───────────────────────────────────────────────
    let prevTotalVolume = 0, prevTotalCount = 0, prevTotalGCI = 0, prevTotalNet = 0;
    const prevMonthly = Array.from({ length: 12 }, () => ({
      closedVolume: 0, closedCount: 0, totalGCI: 0, netIncome: 0,
    }));

    for (const t of prevTransactions) {
      if (t.status !== 'closed') continue;
      const closedDate = parseDate(t.closedDate);
      if (!closedDate || closedDate.getFullYear() !== prevYear) continue;
      const m = closedDate.getMonth();
      const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
      const companyRetained = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
      const agentNet = t.splitSnapshot?.agentNetCommission ?? (gci - companyRetained);
      const vol = t.dealValue ?? 0;

      prevMonthly[m].closedVolume += vol;
      prevMonthly[m].closedCount += 1;
      prevMonthly[m].totalGCI += gci;
      prevMonthly[m].netIncome += agentNet;

      prevTotalVolume += vol;
      prevTotalCount += 1;
      prevTotalGCI += gci;
      prevTotalNet += agentNet;
    }

    const seasonality = prevMonthly.map((pm, i) => ({
      month: i + 1,
      label: format(new Date(2000, i), 'MMM'),
      volumePct: prevTotalVolume > 0 ? Math.round((pm.closedVolume / prevTotalVolume) * 10000) / 100 : 8.33,
      salesPct: prevTotalCount > 0 ? Math.round((pm.closedCount / prevTotalCount) * 10000) / 100 : 8.33,
      closedVolume: pm.closedVolume,
      closedCount: pm.closedCount,
      totalGCI: pm.totalGCI,
      grossMargin: pm.netIncome, // For agents, "margin" = their net income
    }));

    const prevYearStats = {
      year: prevYear,
      totalVolume: prevTotalVolume,
      totalSales: prevTotalCount,
      totalGCI: prevTotalGCI,
      totalGrossMargin: prevTotalNet,
      avgSalePrice: prevTotalCount > 0 ? Math.round(prevTotalVolume / prevTotalCount) : 0,
      avgGCI: prevTotalCount > 0 ? Math.round(prevTotalGCI / prevTotalCount) : 0,
      avgGrossMargin: prevTotalCount > 0 ? Math.round(prevTotalNet / prevTotalCount) : 0,
      avgMarginPct: prevTotalGCI > 0 ? Math.round((prevTotalNet / prevTotalGCI) * 10000) / 100 : 0,
      avgCommissionPct: prevTotalVolume > 0 ? Math.round((prevTotalGCI / prevTotalVolume) * 100000) / 1000 : 0,
      seasonality,
    };

    // ── Comparison year ───────────────────────────────────────────────────
    let comparisonData = null;
    if (compareYear && compareTransactions.length > 0) {
      const compMonths = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, label: format(new Date(2000, i), 'MMM'),
        grossMargin: 0, closedVolume: 0, closedCount: 0, totalGCI: 0, netIncome: 0,
      }));

      for (const t of compareTransactions) {
        if (t.status !== 'closed') continue;
        const closedDate = parseDate(t.closedDate);
        if (!closedDate || closedDate.getFullYear() !== compareYear) continue;
        const m = closedDate.getMonth();
        const gci = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
        const companyRetained = t.splitSnapshot?.companyRetained ?? t.brokerProfit ?? 0;
        const agentNet = t.splitSnapshot?.agentNetCommission ?? (gci - companyRetained);
        const vol = t.dealValue ?? 0;

        compMonths[m].grossMargin += companyRetained;
        compMonths[m].closedVolume += vol;
        compMonths[m].closedCount += 1;
        compMonths[m].totalGCI += gci;
        compMonths[m].netIncome += agentNet;
      }

      comparisonData = { year: compareYear, months: compMonths };
    }

    // ── Response ──────────────────────────────────────────────────────────
    const overview: BrokerCommandOverview = { year, totals, months, categoryBreakdown };

    return NextResponse.json({
      overview,
      prevYearStats,
      availableYears,
      comparisonData,
      // Agent-specific data
      agentView: {
        view,
        viewLabel,
        isTeamLeader,
        availableTeams,
        monthlyNetIncome,
        monthlyPendingNetIncome,
        netIncome: totals.netIncome,
        pendingNetIncome: totals.pendingNetIncome,
        goalSegment,
      },
    });
  } catch (error: any) {
    console.error('[api/agent/command-metrics]', error);
    if (error.code?.startsWith('auth/')) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
