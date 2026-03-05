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

  // If it looks like an email, use the local part
  if (id.includes("@")) return titleCaseWords(id.split("@")[0]);

  // Otherwise make it readable, but guaranteed non-empty
  const human = titleCaseWords(id);
  if (human) return human;

  const tail = id.slice(-6);
  return tail ? `Agent ${tail}` : "Agent";
}

type AgentProfile = {
  displayName: string;
  avatarUrl?: string | null;
};

async function getAgentProfileMap(db: any, year: number) {
  const snap = await db
    .collection("agentYearRollups")
    .where("year", "==", year)
    .limit(5000)
    .get();

  const map = new Map<string, AgentProfile>();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const agentId = String(data.agentId || "").trim();
    if (!agentId) continue;

    const displayName =
      String(data.displayName || data.agentName || data.name || "").trim() ||
      fallbackDisplayName(agentId);

    const avatarUrl = data.avatarUrl ? String(data.avatarUrl) : null;

    if (!map.has(agentId)) {
      map.set(agentId, { displayName, avatarUrl });
    }
  }

  return map;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    const db = adminDb();

    const [rollups, agentMap] = await Promise.all([
      getEffectiveRollups(db, year),
      getAgentProfileMap(db, year),
    ]);

    const rows = (rollups || []).map((r: any) => {
      const agentId = String(r.agentId || "").trim();
      const profile = agentMap.get(agentId);

      const displayName =
        String(r.displayName || r.agentName || "").trim() ||
        profile?.displayName ||
        fallbackDisplayName(agentId);

      const avatarUrl =
        (r.avatarUrl ?? null) ||
        (profile?.avatarUrl ?? null);

      return {
        ...r,
        agentId,
        displayName,
        avatarUrl,
      };
    });

    return NextResponse.json({ ok: true, year, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
