import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRollups } from "@/lib/rollupsService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || 2025);

    const rows = await getEffectiveRollups(year);

    return NextResponse.json({ ok: true, year, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load top agents" },
      { status: 500 }
    );
  }
}
