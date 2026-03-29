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
  dealSource?: string;
  year: number;
  splitSnapshot?: {
    grossCommission?: number;
    companyRetained?: number;
    agentNetCommission?: number;
    primaryTeamId?: string | null;
  };
}

type SourceBucket = { count: number; volume: number; netRevenue: number };
function addToSource(
  bucket: Record<string, SourceBucket>,
  src: string,
  volume: number,
  netRevenue: number
) {
  if (!bucket[src]) bucket[src] = { count: 0, volume: 0, netRevenue: 0 };
  bucket[src].count += 1;
  bucket[src].volume += volume;
  bucket[src].netRevenue += netRevenue;
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
    // uid may be a slug (e.g. 'ashley-lombas') when admin uses viewAs, or a Firebase UID.
    // Try slug lookup first; if that fails, try direct document lookup by UID.
    let profileSnap = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid).limit(1).get();
    let profileDocId: string | null = profileSnap.empty ? null : profileSnap.docs[0].id;
    if (profileSnap.empty) {
      // uid might already be a Firebase UID — try direct doc lookup
      const directDoc = await adminDb.collection('agentProfiles').doc(uid).get();
      if (directDoc.exists) {
        profileDocId = directDoc.id;
        profileSnap = { empty: false, docs: [directDoc] } as any;
      }
    }
    const profile = profileSnap.empty ? null : profileSnap.docs[0].data();
    // The canonical Firebase UID for this agent — used as the goal segment key.
    // This ensures goals saved by the agent (keyed by their UID) are always found
    // regardless of whether viewAs was passed as a slug or a UID.
    const agentFirebaseUid = profileDocId ?? uid;

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
    // Query by agentId (not year field) so transactions missing the year field are included.
    // Firestore IN batched at 30 per query.
    const agentIdList = [...agentIds];
    const allTxSnaps = await Promise.all(
      Array.from({ length: Math.ceil(agentIdList.length / 30) }, (_, i) =>
        adminDb.collection('transactions')
          .where('agentId', 'in', agentIdList.slice(i * 30, i * 30 + 30))
          .get()
      )
    );
    const allAgentTx: Transaction[] = allTxSnaps.flatMap(s => s.docs.map(d => d.data() as Transaction));

    // Derive each transaction's year from the year field (if present) or from closedDate/contractDate
    const getTxYear = (t: Transaction): number | null => {
      if (t.year && typeof t.year === 'number') return t.year;
      const cd = parseDate(t.closedDate) ?? parseDate(t.contractDate);
      return cd ? cd.getFullYear() : null;
    };

    const prevYear = year - 1;
    const transactions = allAgentTx.filter(t => getTxYear(t) === year);
    const prevTransactions = allAgentTx.filter(t => getTxYear(t) === prevYear);
    const compareTransactions = compareYear
      ? allAgentTx.filter(t => getTxYear(t) === compareYear)
      : [];

    // Available years — derived from allAgentTx (already fetched above), no extra query needed
    const availableYears = [...new Set(
      allAgentTx
        .filter(t => t.status === 'closed')
        .map(t => getTxYear(t))
        .filter((y): y is number => y !== null && !isNaN(y))
    )].filter(y => y !== year).sort((a, b) => b - a);

     // ── Fetch goals ────────────────────────────────────────────────────
    // Use agentFirebaseUid (the profile doc ID) so goals are always found regardless
    // of whether viewAs was a slug or a Firebase UID.
    const goalSegment = view === 'team' && teamId ? teamId : `agent_${agentFirebaseUid}`;
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
      agentNetCommission: 0, // alias for netIncome — satisfies BrokerCommandOverview type
      netIncome: 0, pendingNetIncome: 0,
    };

    const categoryBreakdown = { closed: emptyCategoryMetrics(), pending: emptyCategoryMetrics() };
    const sourceBreakdown: { closed: Record<string, SourceBucket>; pending: Record<string, SourceBucket> } = {
      closed: {}, pending: {},
    };

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
      const srcKey = (t.dealSource || 'other').toLowerCase();

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
        totals.agentNetCommission += agentNet;

        categoryBreakdown.closed[catKey].count += 1;
        categoryBreakdown.closed[catKey].netRevenue += agentNet;
        addToSource(sourceBreakdown.closed, srcKey, dealValue, agentNet);
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
        addToSource(sourceBreakdown.pending, srcKey, dealValue, agentNet);
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
    let comparisonData: { year: number; months: { month: number; label: string; grossMargin: number; closedVolume: number; closedCount: number; totalGCI: number; netIncome: number }[] } | null = null;
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
    const isAdminCaller = decoded.uid === ADMIN_UID;
    const overview: BrokerCommandOverview = { year, totals, months, categoryBreakdown, sourceBreakdown };

    // ── Strip commission split data for non-admin callers ─────────────────
    // Agents only receive their net income; all gross commission / broker
    // retained / split percentage fields are removed server-side.
    function stripCommissionFromTotals(t: typeof totals) {
      const { netIncome, pendingNetIncome, closedVolume, pendingVolume, closedCount, pendingCount } = t;
      return { netIncome, pendingNetIncome, closedVolume, pendingVolume, closedCount, pendingCount };
    }

    function stripCommissionFromMonths(ms: typeof months) {
      return ms.map(m => ({
        month: m.month, label: m.label,
        closedVolume: m.closedVolume, pendingVolume: m.pendingVolume,
        closedCount: m.closedCount, pendingCount: m.pendingCount,
        grossMarginGoal: m.grossMarginGoal, // renamed: this is the agent's income goal
        volumeGoal: m.volumeGoal, salesCountGoal: m.salesCountGoal,
      }));
    }

    function stripCommissionFromPrevYearStats(ps: typeof prevYearStats | undefined) {
      if (!ps) return undefined;
      return {
        year: ps.year,
        totalVolume: ps.totalVolume,
        totalSales: ps.totalSales,
        avgSalePrice: ps.avgSalePrice,
        // Retain seasonality shapes for projection math; strip revenue fields
        seasonality: ps.seasonality.map(s => ({
          month: s.month, label: s.label,
          volumePct: s.volumePct, salesPct: s.salesPct,
        })),
      };
    }

    function stripCommissionFromComparisonData(cd: typeof comparisonData) {
      if (!cd) return null;
      return {
        year: cd.year,
        months: cd.months.map((m: any) => ({
          closedVolume: m.closedVolume, closedCount: m.closedCount, netIncome: m.netIncome,
        })),
      };
    }

    const agentSafeOverview = isAdminCaller ? overview : {
      year,
      totals: stripCommissionFromTotals(totals),
      months: stripCommissionFromMonths(months),
      categoryBreakdown, // netRevenue here = agent net, fine to include
      sourceBreakdown,   // netRevenue here = agent net, fine to include
    };

    return NextResponse.json({
      overview: agentSafeOverview,
      prevYearStats: isAdminCaller ? prevYearStats : stripCommissionFromPrevYearStats(prevYearStats),
      availableYears,
      comparisonData: isAdminCaller ? comparisonData : stripCommissionFromComparisonData(comparisonData),
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
