// src/app/api/recruiting/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from '@/lib/firebase/admin';
import { add, subDays } from "date-fns";

type QualificationProgress = {
  status: "qualified" | "in_progress" | "expired";
  closedCompanyGciGrossInWindow: number;
  pendingCompanyGciGrossInWindow: number;
  remainingToThreshold: number;
  progressPercentage: number;
  windowEndsAt: Date;
  timeRemainingDays: number;
  qualifiedAt: Date | null;
  annualPayout: number;
};

type DownlineMember = {
  agentId: string;
  displayName: string;
  tier: 1 | 2;
  referrerId?: string;
  hireDate: Date;
  qualificationProgress: QualificationProgress | null;
};

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split("Bearer ")[1]?.trim() || null;
}

/**
 * Server-side mock data, matching the dev mock in referralsService.ts,
 * so the Recruiting Tracker UI works immediately.
 */
function getMockFullDownline(): DownlineMember[] {
  const now = new Date();

  const createMockProgress = (
    status: "qualified" | "in_progress" | "expired",
    closedGci: number,
    pendingGci: number
  ): QualificationProgress => {
    const threshold = 40000;
    const remaining = Math.max(0, threshold - closedGci);
    const progressPct = threshold > 0 ? (closedGci / threshold) * 100 : 0;

    return {
      status,
      closedCompanyGciGrossInWindow: closedGci,
      pendingCompanyGciGrossInWindow: pendingGci,
      remainingToThreshold: remaining,
      progressPercentage: progressPct,
      windowEndsAt: add(now, { months: status === "in_progress" ? 6 : -6 }),
      timeRemainingDays: status === "in_progress" ? 180 : 0,
      qualifiedAt: status === "qualified" ? subDays(now, 100) : null,
      annualPayout: status === "qualified" ? 500 : 0,
    };
  };

  return [
    {
      agentId: "jenna-stone",
      displayName: "Jenna Stone",
      tier: 1,
      hireDate: subDays(now, 200),
      qualificationProgress: createMockProgress("qualified", 55000, 5000),
    },
    {
      agentId: "brian-miller",
      displayName: "Brian Miller",
      tier: 1,
      hireDate: subDays(now, 150),
      qualificationProgress: createMockProgress("in_progress", 25000, 8000),
    },
    {
      agentId: "sam-wilson",
      displayName: "Sam Wilson",
      tier: 2,
      referrerId: "brian-miller",
      hireDate: subDays(now, 400),
      qualificationProgress: createMockProgress("expired", 15000, 0),
    },
    {
      agentId: "olivia-chen",
      displayName: "Olivia Chen",
      tier: 2,
      referrerId: "jenna-stone",
      hireDate: subDays(now, 90),
      qualificationProgress: createMockProgress("in_progress", 8000, 12000),
    },
    {
      agentId: "missing-data-agent",
      displayName: "Missing Data Agent",
      tier: 1,
      hireDate: subDays(now, 60),
      qualificationProgress: null, // simulate missing data
    },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Verify user
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // For now, always return mock data so dashboard works immediately.
    // Later we’ll replace this with real agent_referrals + transactions aggregation.
    const downline = getMockFullDownline();

    // Helpful summary (optional; UI can compute too)
    const summary = downline.reduce(
      (acc, m) => {
        if (m.tier === 1) acc.tier1Count++;
        if (m.tier === 2) acc.tier2Count++;
        if (m.qualificationProgress?.status === "qualified") acc.qualifiedCount++;
        acc.totalRecruits++;
        return acc;
      },
      { tier1Count: 0, tier2Count: 0, qualifiedCount: 0, totalRecruits: 0 }
    );

    return NextResponse.json({
      ok: true,
      uid,
      summary,
      downline,
    });
  } catch (e: any) {
    console.error("[api/recruiting] error:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: "Failed to load recruiting data" },
      { status: 500 }
    );
  }
}
