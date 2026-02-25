
// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { APP_CONFIG } from "@/lib/config";
import type { BusinessPlan, YtdValueMetrics, AgentDashboardData } from "@/lib/types";
import { type Timestamp } from 'firebase-admin/firestore';


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
const sanitizeDashboardData = (data: any | null): AgentDashboardData | null => {
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

    return safeData as AgentDashboardData;
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
    const plan = planSnap.exists() ? planSnap.data() as BusinessPlan : null;

    // 5) YTD Metrics calculation
    let ytdMetrics: YtdValueMetrics | null = null;
    try {
        // Query transactions (simplified to avoid composite index)
        const txQuery = db.collection("transactions").where("agentId", "==", uid);
        const txSnap = await txQuery.get();
    
        let closedNetCommission = 0;
        txSnap.forEach((doc) => {
            const t = doc.data();
            if (t.status !== 'closed') return;

            const commissionNet = Number(t.commissionNet || 0);
            let closeDate: Date | null = null;
            
            // Handle different possible date formats from Firestore
            if (t.closeDate) {
                // Firestore Admin SDK Timestamp
                if (typeof t.closeDate.toDate === 'function') {
                    closeDate = t.closeDate.toDate();
                } 
                // ISO Date String
                else if (typeof t.closeDate === 'string') {
                    const parsed = new Date(t.closeDate);
                    if (!isNaN(parsed.getTime())) {
                        closeDate = parsed;
                    }
                }
            }

            if (closeDate && closeDate.getFullYear() === year) {
                closedNetCommission += commissionNet;
            }
        });
    
        // Query daily activities
        const activityQuery = db.collection("daily_activity").where("agentId", "==", uid);
        const activitySnap = await activityQuery.get();
    
        let totalEngagements = 0;
        let totalAppointmentsHeld = 0;
        activitySnap.forEach((doc) => {
            const activity = doc.data();
            if (activity.date.startsWith(String(year))) {
                totalEngagements += Number(activity.engagementsCount || 0);
                totalAppointmentsHeld += Number(activity.appointmentsHeldCount || 0);
            }
        });
    
        // Calculate target values from business plan (already fetched)
        let targetValuePerEngagement: number | null = null;
        let targetValuePerAppointmentHeld: number | null = null;
        
        if (plan) {
            const incomeGoal = plan.annualIncomeGoal;
            const engagementGoal = plan.calculatedTargets?.engagements.yearly;
            const apptsHeldGoal = plan.calculatedTargets?.appointmentsHeld.yearly;
    
            if (incomeGoal > 0 && engagementGoal > 0) {
                targetValuePerEngagement = incomeGoal / engagementGoal;
            }
            if (incomeGoal > 0 && apptsHeldGoal > 0) {
                targetValuePerAppointmentHeld = incomeGoal / apptsHeldGoal;
            }
        }
    
        ytdMetrics = {
            year,
            closedNetCommission,
            engagements: totalEngagements,
            appointmentsHeld: totalAppointmentsHeld,
            valuePerEngagement: totalEngagements > 0 ? closedNetCommission / totalEngagements : null,
            valuePerAppointmentHeld: totalAppointmentsHeld > 0 ? closedNetCommission / totalAppointmentsHeld : null,
            targetValuePerEngagement,
            targetValuePerAppointmentHeld,
        };
    } catch (e: any) {
        console.warn(`[API/dashboard] Could not calculate YTD metrics for ${uid} in ${year}:`, e.message);
        ytdMetrics = null;
    }

    return NextResponse.json({
      ok: true,
      uid,
      year,
      role,
      brokerageId,
      dashboard,
      plan,
      ytdMetrics,
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
