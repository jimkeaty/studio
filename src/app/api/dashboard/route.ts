// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { APP_CONFIG } from "@/lib/config";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "smart-broker-usa",
    });
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}

const db = admin.firestore();

type Role = "agent" | "broker" | "admin";

/**
 * Ensures that a dashboard data object has default values for all numeric fields
 * to prevent UI crashes on formatting.
 * @param data The raw dashboard data from Firestore.
 * @returns A sanitized dashboard data object or null.
 */
const sanitizeDashboardData = (data: any | null) => {
    if (!data) return null;

    const safeData = { ...data };

    // Default top-level numbers
    safeData.netEarned = safeData.netEarned ?? 0;
    safeData.netPending = safeData.netPending ?? 0;
    safeData.expectedYTDIncomeGoal = safeData.expectedYTDIncomeGoal ?? 0;
    safeData.ytdTotalPotential = safeData.ytdTotalPotential ?? 0;
    safeData.totalClosedIncomeForYear = safeData.totalClosedIncomeForYear ?? 0;
    safeData.totalPendingIncomeForYear = safeData.totalPendingIncomeForYear ?? 0;
    safeData.totalIncomeWithPipelineForYear = safeData.totalIncomeWithPipelineForYear ?? 0;

    // Default nested KPI numbers
    safeData.kpis = safeData.kpis || {};
    const kpiKeys = ['calls', 'engagements', 'appointmentsSet', 'appointmentsHeld', 'contractsWritten', 'closings'];
    kpiKeys.forEach(key => {
        safeData.kpis[key] = safeData.kpis[key] || {};
        safeData.kpis[key].actual = safeData.kpis[key].actual ?? 0;
        safeData.kpis[key].target = safeData.kpis[key].target ?? 0;
        safeData.kpis[key].performance = safeData.kpis[key].performance ?? 0;
    });

    // Default nested stats numbers
    safeData.stats = safeData.stats || {};
    const statKeys = ['ytdVolume', 'avgSalesPrice', 'buyerClosings', 'sellerClosings', 'renterClosings', 'avgCommission', 'engagementValue'];
    statKeys.forEach(key => {
        safeData.stats[key] = safeData.stats[key] ?? 0;
    });

    return safeData;
}


function getYearFromReq(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : APP_CONFIG.DEFAULT_DASHBOARD_YEAR;
  return Number.isFinite(year) ? year : APP_CONFIG.DEFAULT_DASHBOARD_YEAR;
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split("Bearer ")[1]?.trim() || null;
}

export async function GET(req: NextRequest) {
  try {
    // 1) Auth
    const idToken = extractBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const year = getYearFromReq(req);

    // 2) Data Guard for 2025-only strategy
    if (!APP_CONFIG.ALLOWED_DASHBOARD_YEARS.includes(year)) {
        return NextResponse.json(
            { error: `Data for year ${year} is not available. Please select one of the allowed years.` },
            { status: 400 }
        );
    }

    // 3) Load user profile (role + brokerageId)
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const role = (userData?.role ?? null) as Role | null;
    const brokerageId = (userData?.brokerageId ?? null) as string | null;

    // 4) Load dashboard + plan docs
    const dashboardRef = db.collection("dashboards").doc(uid).collection("agent").doc(String(year));
    const planRef = db.collection("users").doc(uid).collection("plans").doc(String(year));

    const [dashSnap, planSnap] = await Promise.all([dashboardRef.get(), planRef.get()]);

    const rawDashboard = dashSnap.exists() ? dashSnap.data() : null;
    const dashboard = sanitizeDashboardData(rawDashboard);
    const plan = planSnap.exists ? planSnap.data() : null;

    // 5) YTD Metrics calculation
    let ytd: any | null = null;
    try {
      const txQuery = db
        .collection("transactions")
        .where("year", "==", year)
        .where("agentId", "==", uid);

      const txSnap = await txQuery.get();

      let closedCount = 0;
      let pendingCount = 0;
      let brokerProfitClosed = 0;
      let volumeClosed = 0;

      txSnap.forEach((doc) => {
        const t = doc.data() as any;
        const status = t.status;
        const dealValue = Number(t.dealValue || 0);
        const brokerProfit = Number(t.brokerProfit || 0);

        if (status === "closed") {
          closedCount++;
          brokerProfitClosed += brokerProfit;
          volumeClosed += dealValue;
        } else if (status === "pending" || status === "under_contract") {
          pendingCount++;
        }
      });

      ytd = {
        year,
        closedCount,
        pendingCount,
        brokerProfitClosed,
        volumeClosed,
      };
    } catch (e) {
      console.warn("Could not calculate YTD metrics, possibly due to missing transaction data.", e);
      ytd = null;
    }

    return NextResponse.json({
      ok: true,
      uid,
      year,
      role,
      brokerageId,
      dashboard,
      plan,
      ytdMetrics: ytd,
    });
  } catch (error: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("[API/dashboard] Error:", { code: error.code, message: error.message });
    }
    if (error.code && String(error.code).startsWith("auth/")) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
