import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRollups } from "@/lib/rollupsService";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || 2025);
    // Support ?includeInactive=true for admin views that need all agents
    const includeInactive = searchParams.get("includeInactive") === "true";

    const allRows = await getEffectiveRollups(adminDb(), year);

    // Filter to active agents only (unless admin explicitly requests all)
    const rows = includeInactive
      ? allRows
      : allRows.filter((r: any) => {
          const status = String(r.agentStatus || 'active');
          return status === 'active' || status === 'grace_period' || status === '';
        });

    return NextResponse.json({ ok: true, year, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load top agents" },
      { status: 500 }
    );
  }
}
