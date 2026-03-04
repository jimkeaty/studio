import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardRows } from "@/lib/rollupsService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    const rows = await getLeaderboardRows(year);

    return NextResponse.json({ ok: true, year, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
