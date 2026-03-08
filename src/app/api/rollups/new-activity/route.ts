import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    const lookbackDays = 60;
    const showTopN = 25;

    const db = adminDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);

    const [transactionsSnap, agentNameMap] = await Promise.all([
      db.collection("transactions").where("year", "==", year).get(),
      getAgentNameMap(db, year),
    ]);

    const newListings: any[] = [];
    const newContracts: any[] = [];

    for (const doc of transactionsSnap.docs) {
      const t = doc.data() || {};

      const agentId = String(t.agentId || t.userId || "").trim();
      const agentDisplayName =
        String(t.agentDisplayName || t.displayName || t.agentName || "").trim() ||
        agentNameMap.get(agentId) ||
        fallbackDisplayName(agentId);

      const addressShort = shortAddress(
        t.address ||
        t.propertyAddress ||
        t.streetAddress ||
        t.transactionType ||
        "Transaction"
      );
      const price = toMoney(t.dealValue ?? t.price ?? t.salePrice ?? t.netCommission);

      const closedDateRaw = t.closedDate || t.closingDate || null;
      const contractDateRaw = t.contractDate || t.pendingDate || t.underContractDate || null;

      const closedDate = toDate(closedDateRaw);
      const contractDate = toDate(contractDateRaw);

      if (closedDate && closedDate >= cutoff) {
        newListings.push({
          id: `${doc.id}_closed`,
          date: toYmd(closedDateRaw),
          agentDisplayName,
          addressShort,
          price,
        });
      }

      if (
        (t.status === "pending" || t.status === "under_contract") &&
        contractDate &&
        contractDate >= cutoff
      ) {
        newContracts.push({
          id: `${doc.id}_contract`,
          date: toYmd(contractDateRaw),
          agentDisplayName,
          addressShort,
          price,
        });
      }
    }

    newListings.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    newContracts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return NextResponse.json({
      ok: true,
      year,
      lookbackDays,
      generatedAt: new Date().toISOString(),
      newListings: newListings.slice(0, showTopN),
      newContracts: newContracts.slice(0, showTopN),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load new activity" },
      { status: 500 }
    );
  }
}
