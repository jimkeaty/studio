import { NextRequest, NextResponse } from "next/server";
import { getNewActivityRows } from "@/lib/rollupsService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") || new Date().getFullYear());

    const rows = await getNewActivityRows(year);

    return NextResponse.json({ ok: true, year, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load new activity" },
      { status: 500 }
    );
  }
}
