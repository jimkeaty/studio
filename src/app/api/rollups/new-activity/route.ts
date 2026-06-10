import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

function fallbackDisplayName(agentId: string) {
  const id = String(agentId || "").trim();
  if (!id) return "Unknown Agent";
  return id
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function toYmd(value: any): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function shortAddress(value: any): string {
  const s = String(value || "").trim();
  if (!s) return "Address unavailable";
  return s;
}

function toMoney(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function getAgentNameMap(db: any, year: number) {
  const snap = await db
    .collection("agentYearRollups")
    .where("year", "==", year)
    .limit(5000)
    .get();

  const map = new Map<string, string>();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const agentId = String(data.agentId || data.userId || "").trim();
    if (!agentId) continue;

    const displayName =
      String(data.displayName || data.agentName || data.name || "").trim() ||
      fallbackDisplayName(agentId);

    if (!map.has(agentId)) {
      map.set(agentId, displayName);
    }
  }

  return map;
}

/** Fetch all demo account agentIds so they can be excluded from public boards. */
async function getDemoAgentIds(db: any): Promise<Set<string>> {
  const snap = await db
    .collection("agentProfiles")
    .where("isDemoAccount", "==", true)
    .get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const id = String(d.agentId || doc.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

// Closing types that represent the listing/seller side
const LISTING_CLOSING_TYPES = new Set(["listing", "dual"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    // Read display config from Firestore boardConfig
    const configDoc = await adminDb.collection('boardConfig').doc('activityBoard').get();
    const boardCfg = configDoc.exists ? configDoc.data()! : {};
    const lookbackDays: number = Number(boardCfg.lookbackDays ?? 60);
    const showTopN: number = Number(boardCfg.showTopN ?? 25);

    const db = adminDb;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);

    const [transactionsSnap, agentNameMap, demoAgentIds] = await Promise.all([
      db.collection("transactions").where("year", "==", year).get(),
      getAgentNameMap(db, year),
      getDemoAgentIds(db),
    ]);

    const recentSold: any[] = [];       // closed within lookback
    const newActiveListings: any[] = []; // status=active, listingDate within lookback
    const underContracts: any[] = [];    // pending/under_contract within lookback

    // YTD totals
    let ytdVolume = 0;
    let ytdSales = 0;
    let ytdAgentCommissions = 0;

    for (const doc of transactionsSnap.docs) {
      const t = doc.data() || {};

      const agentId = String(t.agentId || t.userId || "").trim();

      // Skip demo account transactions from all public displays
      if (demoAgentIds.size > 0 && demoAgentIds.has(agentId)) continue;

      const agentDisplayName =
        String(t.agentDisplayName || t.displayName || t.agentName || "").trim() ||
        agentNameMap.get(agentId) ||
        fallbackDisplayName(agentId);

      const addressShort = shortAddress(
        t.address ||
          t.propertyAddress ||
          t.streetAddress ||
          "Transaction"
      );
      const price = toMoney(t.salePrice ?? t.listPrice ?? t.price);
      const status = String(t.status || "").toLowerCase();
      const closingType = String(t.closingType || t.transactionType || "").toLowerCase();

      const closedDateRaw = t.closedDate || t.closingDate || null;
      const contractDateRaw =
        t.contractDate || t.pendingDate || t.underContractDate || null;
      const listingDateRaw = t.listingDate || t.listDate || null;

      const closedDate = toDate(closedDateRaw);
      const contractDate = toDate(contractDateRaw);
      const listingDate = toDate(listingDateRaw);

      // YTD totals for closed transactions
      if (status === "closed") {
        ytdVolume += price;
        ytdSales += 1;
        ytdAgentCommissions += toMoney(
          t.splitSnapshot?.agentNetCommission ?? t.commission
        );
      }

      // ── Recent Sold (closed within lookback) ──────────────────────────────
      if (closedDate && closedDate >= cutoff && status === "closed") {
        recentSold.push({
          id: `${doc.id}_closed`,
          date: toYmd(closedDateRaw),
          agentDisplayName,
          addressShort,
          price,
        });
      }

      // ── New Active Listings (status=active, listing side, listed within lookback) ──
      // Falls back to createdAt if listingDate is not set so newly added listings still appear
      const listingEffectiveDate = listingDate ?? toDate(t.createdAt ?? null);
      if (
        status === "active" &&
        LISTING_CLOSING_TYPES.has(closingType) &&
        listingEffectiveDate &&
        listingEffectiveDate >= cutoff
      ) {
        newActiveListings.push({
          id: `${doc.id}_active`,
          date: toYmd(listingDateRaw ?? t.createdAt ?? null),
          agentDisplayName,
          addressShort,
          price: toMoney(t.listPrice ?? t.salePrice ?? t.price),
        });
      }

      // ── Under Contract (pending/under_contract within lookback) ───────────
      if (
        (status === "pending" || status === "under_contract") &&
        contractDate &&
        contractDate >= cutoff
      ) {
        underContracts.push({
          id: `${doc.id}_contract`,
          date: toYmd(contractDateRaw),
          agentDisplayName,
          addressShort,
          price,
        });
      }
    }

    recentSold.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    newActiveListings.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    underContracts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return NextResponse.json({
      ok: true,
      year,
      lookbackDays,
      generatedAt: new Date().toISOString(),
      // New field names — keep legacy aliases for backwards compat
      recentSold: recentSold.slice(0, showTopN),
      newActiveListings: newActiveListings.slice(0, showTopN),
      underContracts: underContracts.slice(0, showTopN),
      // Legacy aliases so any existing consumers don't break
      newListings: recentSold.slice(0, showTopN),
      newContracts: underContracts.slice(0, showTopN),
      ytdTotals: {
        totalVolume: ytdVolume,
        totalSales: ytdSales,
        totalAgentCommissions: ytdAgentCommissions,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load new activity" },
      { status: 500 }
    );
  }
}
