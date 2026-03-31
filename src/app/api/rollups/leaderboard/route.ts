import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getEffectiveRollups } from "@/lib/rollupsService";

function titleCaseWords(s: string) {
  return s
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackDisplayName(agentId: string) {
  const id = String(agentId || "").trim();
  if (!id) return "Agent";
  if (id.includes("@")) return titleCaseWords(id.split("@")[0]);
  const human = titleCaseWords(id);
  if (human) return human;
  const tail = id.slice(-6);
  return tail ? `Agent ${tail}` : "Agent";
}

function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type RecentDeal = {
  address: string;
  agentId: string;
  agentName: string;
  dealValue: number;
  gci: number;
  date: string;
  status: string;
};

/**
 * GET /api/rollups/leaderboard
 *
 * Query params:
 *   year       - calendar year (default: current)
 *   period     - "yearly" | "quarterly" | "monthly" (default: yearly)
 *   quarter    - 1-4 (required if period=quarterly)
 *   month      - 1-12 (required if period=monthly)
 *   includeInactive - "true" to show non-active agents
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());
    const period = searchParams.get("period") || "yearly";
    const quarter = Number(searchParams.get("quarter") || 0);
    const month = Number(searchParams.get("month") || 0);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const db = adminDb();

    // For yearly, use the pre-built rollups (fast path)
    if (period === "yearly") {
      return handleYearly(db, year, includeInactive);
    }

    // For quarterly/monthly, query transactions directly
    return handlePeriod(db, year, period, quarter, month, includeInactive);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}

// ── Yearly (from rollups) ──────────────────────────────────────────────────
async function handleYearly(db: any, year: number, includeInactive: boolean) {
  const rollups = await getEffectiveRollups(db, year);

  // Also fetch recent pendings and recent sold from transactions
  const recentSnap = await db
    .collection("transactions")
    .where("year", "==", year)
    .orderBy("updatedAt", "desc")
    .limit(500)
    .get()
    .catch(() => ({ docs: [] }));

  const recentPendings: RecentDeal[] = [];
  const recentSold: RecentDeal[] = [];

  for (const doc of recentSnap.docs) {
    const t = doc.data() as any;
    const status = String(t.status || "").toLowerCase();
    const deal: RecentDeal = {
      address: String(t.address || "").trim(),
      agentId: String(t.agentId || ""),
      agentName: String(t.agentDisplayName || t.agentId || ""),
      dealValue: num(t.dealValue),
      gci: num(t.commission),
      date: "",
      status,
    };

    if (status === "pending" || status === "under_contract") {
      deal.date = formatDate(toDate(t.contractDate || t.pendingDate));
      if (recentPendings.length < 10) recentPendings.push(deal);
    } else if (status === "closed") {
      deal.date = formatDate(toDate(t.closedDate || t.closingDate));
      if (recentSold.length < 10) recentSold.push(deal);
    }
  }

  const rows = (rollups || [])
    .filter((r: any) => {
      if (includeInactive) return true;
      const status = String(r.agentStatus || "active");
      return status === "active" || status === "grace_period" || status === "";
    })
    .map((r: any) => ({
      agentId: String(r.agentId || "").trim(),
      displayName:
        String(r.displayName || r.agentName || "").trim() ||
        fallbackDisplayName(String(r.agentId || "")),
      avatarUrl: r.avatarUrl ?? null,
      closed: num(r.closed),
      pending: num(r.pending),
      listings: num(r.listings?.active),
      closedVolume: num(r.closedVolume),
      totalGCI: num(r.totalGCI),
      agentNetCommission: num(r.agentNetCommission),
      companyDollar: num(r.companyDollar),
      isCorrected: r._overrideApplied ?? false,
      correctionReason: r.correctionReason ?? "",
    }));

  rows.sort((a: any, b: any) => {
    if (b.closed !== a.closed) return b.closed - a.closed;
    if (b.closedVolume !== a.closedVolume) return b.closedVolume - a.closedVolume;
    if (b.pending !== a.pending) return b.pending - a.pending;
    return (a.displayName || "").localeCompare(b.displayName || "");
  });

  // Team totals
  const teamTotals = {
    totalVolume: rows.reduce((s: number, r: any) => s + r.closedVolume, 0),
    totalSales: rows.reduce((s: number, r: any) => s + r.closed, 0),
    totalGCI: rows.reduce((s: number, r: any) => s + r.totalGCI, 0),
    totalAgentNet: rows.reduce((s: number, r: any) => s + r.agentNetCommission, 0),
    totalCompanyDollar: rows.reduce((s: number, r: any) => s + r.companyDollar, 0),
    totalPending: rows.reduce((s: number, r: any) => s + r.pending, 0),
    totalListings: rows.reduce((s: number, r: any) => s + r.listings, 0),
  };

  return NextResponse.json({
    ok: true,
    year,
    period: "yearly",
    rows,
    teamTotals,
    recentPendings,
    recentSold,
  });
}

// ── Quarterly / Monthly (from transactions) ────────────────────────────────
async function handlePeriod(
  db: any,
  year: number,
  period: string,
  quarter: number,
  month: number,
  includeInactive: boolean
) {
  // Determine date range
  let startMonth: number;
  let endMonth: number;

  if (period === "quarterly") {
    const q = Math.max(1, Math.min(4, quarter || currentQuarter()));
    startMonth = (q - 1) * 3; // 0-indexed
    endMonth = startMonth + 2;
  } else {
    // monthly
    const m = Math.max(1, Math.min(12, month || new Date().getMonth() + 1));
    startMonth = m - 1;
    endMonth = m - 1;
  }

  const rangeStart = new Date(Date.UTC(year, startMonth, 1));
  const rangeEnd = new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59, 999));

  // Fetch all transactions for the year
  const snap = await db
    .collection("transactions")
    .where("year", "==", year)
    .get();

  // Also fetch agent profiles for status filtering
  const profileSnap = await db.collection("agentProfiles").get();
  const profileMap = new Map<string, any>();
  for (const doc of profileSnap.docs) {
    profileMap.set(doc.id, doc.data());
  }

  // Aggregate by agent
  const agentMap = new Map<
    string,
    {
      closed: number;
      pending: number;
      closedVolume: number;
      totalGCI: number;
      agentNetCommission: number;
      companyDollar: number;
    }
  >();

  for (const doc of snap.docs) {
    const t = doc.data() as any;
    const status = String(t.status || "").toLowerCase();
    const agentId = String(t.agentId || "").trim();
    if (!agentId) continue;

    // Determine the relevant date for this transaction
    let txDate: Date | null = null;
    if (status === "closed") {
      txDate = toDate(t.closedDate || t.closingDate);
    } else if (status === "pending" || status === "under_contract") {
      txDate = toDate(t.contractDate || t.pendingDate || t.underContractDate);
    }
    if (!txDate) continue;

    // Check if within range
    if (txDate < rangeStart || txDate > rangeEnd) continue;

    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, {
        closed: 0,
        pending: 0,
        closedVolume: 0,
        totalGCI: 0,
        agentNetCommission: 0,
        companyDollar: 0,
      });
    }
    const agg = agentMap.get(agentId)!;

    if (status === "closed") {
      agg.closed += 1;
      agg.closedVolume += num(t.dealValue);
      agg.totalGCI += num(t.commission);
      agg.agentNetCommission += num(
        t.splitSnapshot?.agentNetCommission ?? t.commission
      );
      agg.companyDollar += num(t.splitSnapshot?.companyRetained ?? 0);
    } else if (status === "pending" || status === "under_contract") {
      agg.pending += 1;
    }
  }

  // Build rows
  const rows = Array.from(agentMap.entries())
    .filter(([agentId]) => {
      if (includeInactive) return true;
      const profile = profileMap.get(agentId);
      const status = String(profile?.status || "active");
      return status === "active" || status === "grace_period" || status === "";
    })
    .map(([agentId, agg]) => {
      const profile = profileMap.get(agentId);
      return {
        agentId,
        displayName:
          String(
            profile?.displayName || profile?.name || profile?.agentName || ""
          ).trim() || fallbackDisplayName(agentId),
        avatarUrl: profile?.avatarUrl ?? null,
        ...agg,
        listings: 0,
        isCorrected: false,
        correctionReason: "",
      };
    });

  rows.sort((a, b) => {
    if (b.closed !== a.closed) return b.closed - a.closed;
    if (b.closedVolume !== a.closedVolume) return b.closedVolume - a.closedVolume;
    return (a.displayName || "").localeCompare(b.displayName || "");
  });

  const teamTotals = {
    totalVolume: rows.reduce((s, r) => s + r.closedVolume, 0),
    totalSales: rows.reduce((s, r) => s + r.closed, 0),
    totalGCI: rows.reduce((s, r) => s + r.totalGCI, 0),
    totalAgentNet: rows.reduce((s, r) => s + r.agentNetCommission, 0),
    totalCompanyDollar: rows.reduce((s, r) => s + r.companyDollar, 0),
    totalPending: rows.reduce((s, r) => s + r.pending, 0),
    totalListings: 0,
  };

  return NextResponse.json({
    ok: true,
    year,
    period,
    ...(period === "quarterly" ? { quarter } : {}),
    ...(period === "monthly" ? { month } : {}),
    rows,
    teamTotals,
    recentPendings: [],
    recentSold: [],
  });
}

function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}
