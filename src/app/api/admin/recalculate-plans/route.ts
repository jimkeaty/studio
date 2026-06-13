// src/app/api/admin/recalculate-plans/route.ts
// Admin endpoint: re-calculates calculatedTargets for all agent plans that have
// daily: 0 for activity targets (the old bug). Fixes appointments set/held,
// contracts written, closings goals on the KPI report card.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isAdminLike } from "@/lib/auth/staffAccess";
import type { PlanTargets } from "@/lib/types";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function asNumber(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function calculateTargets(
  annualIncomeGoal: number,
  assumptions: any
): Record<string, PlanTargets> | null {
  const {
    avgCommission,
    workingDaysPerMonth,
    weeksOff,
    conversionRates,
  } = assumptions ?? {};

  if (!annualIncomeGoal || !avgCommission || avgCommission <= 0) return null;

  const yearlyClosings = annualIncomeGoal / avgCommission;
  const cr = conversionRates ?? {};
  const contractToClosing = asNumber(cr.contractToClosing) || 0.85;
  const apptHeldToContract = asNumber(cr.appointmentHeldToContract) || 0.5;
  const apptSetToHeld = asNumber(cr.appointmentSetToHeld) || 0.65;
  const engToApptSet = asNumber(cr.engagementToAppointmentSet) || 0.03;
  const callToEng = asNumber(cr.callToEngagement) || 0.15;

  const yearlyContracts = yearlyClosings / contractToClosing;
  const yearlyApptHeld = yearlyContracts / apptHeldToContract;
  const yearlyApptSet = yearlyApptHeld / apptSetToHeld;
  const yearlyEngagements = yearlyApptSet / engToApptSet;
  const yearlyCalls = yearlyEngagements / callToEng;

  const wdpm = asNumber(workingDaysPerMonth) || 21;
  const wo = asNumber(weeksOff) || 4;
  const workingWeeksInYear = 52 - wo;
  const workingDaysInYear = Math.max(1, wdpm * 12 - wo * 5);

  const createTargets = (yearlyValue: number): PlanTargets => {
    if (yearlyValue <= 0 || !Number.isFinite(yearlyValue)) {
      return { yearly: 0, monthly: 0, weekly: 0, daily: 0 };
    }
    const monthly = yearlyValue / 12;
    const weekly = workingWeeksInYear > 0 ? yearlyValue / workingWeeksInYear : 0;
    const daily = workingDaysInYear > 0 ? yearlyValue / workingDaysInYear : 0;
    return {
      yearly: Math.ceil(yearlyValue),
      monthly: Math.ceil(monthly),
      // Store raw fractional values so dashboard can multiply by elapsed workdays
      weekly: weekly <= 0 ? 0 : weekly,
      daily: daily <= 0 ? 0 : daily,
    };
  };

  return {
    closings: createTargets(yearlyClosings),
    contractsWritten: createTargets(yearlyContracts),
    appointmentsHeld: createTargets(yearlyApptHeld),
    appointmentsSet: createTargets(yearlyApptSet),
    engagements: createTargets(yearlyEngagements),
    calls: createTargets(yearlyCalls),
  };
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const year = String(body?.year ?? new Date().getFullYear());
    const dryRun = body?.dryRun === true;

    // Fetch all agent plan docs for the given year
    const plansSnap = await adminDb
      .collection("dashboards")
      .doc(year)
      .collection("agent")
      .get();

    const results: Array<{
      agentId: string;
      status: "fixed" | "skipped" | "no_plan" | "error";
      reason?: string;
      before?: any;
      after?: any;
    }> = [];

    for (const agentDoc of plansSnap.docs) {
      const agentId = agentDoc.id;
      try {
        const planRef = adminDb
          .collection("dashboards")
          .doc(year)
          .collection("agent")
          .doc(agentId)
          .collection("plans")
          .doc("plan");

        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          results.push({ agentId, status: "no_plan" });
          continue;
        }

        const plan = planSnap.data() ?? {};
        const annualIncomeGoal = asNumber(plan.annualIncomeGoal);
        const assumptions = plan.assumptions;

        if (!annualIncomeGoal || !assumptions) {
          results.push({ agentId, status: "skipped", reason: "No income goal or assumptions" });
          continue;
        }

        // Check if any activity target has daily: 0 (the bug)
        const existing = plan.calculatedTargets ?? {};
        const hasBuggyZero =
          asNumber(existing?.appointmentsSet?.daily) === 0 ||
          asNumber(existing?.appointmentsHeld?.daily) === 0 ||
          asNumber(existing?.contractsWritten?.daily) === 0;

        if (!hasBuggyZero) {
          results.push({ agentId, status: "skipped", reason: "Already has correct daily values" });
          continue;
        }

        const newTargets = calculateTargets(annualIncomeGoal, assumptions);
        if (!newTargets) {
          results.push({ agentId, status: "skipped", reason: "Could not calculate targets" });
          continue;
        }

        if (!dryRun) {
          await planRef.update({ calculatedTargets: newTargets });
        }

        results.push({
          agentId,
          status: "fixed",
          before: {
            appointmentsSet_daily: asNumber(existing?.appointmentsSet?.daily),
            appointmentsHeld_daily: asNumber(existing?.appointmentsHeld?.daily),
            contractsWritten_daily: asNumber(existing?.contractsWritten?.daily),
          },
          after: {
            appointmentsSet_daily: newTargets.appointmentsSet.daily,
            appointmentsHeld_daily: newTargets.appointmentsHeld.daily,
            contractsWritten_daily: newTargets.contractsWritten.daily,
          },
        });
      } catch (err: any) {
        results.push({ agentId, status: "error", reason: err?.message });
      }
    }

    const fixed = results.filter(r => r.status === "fixed").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;

    return NextResponse.json({
      ok: true,
      dryRun,
      year,
      summary: { total: results.length, fixed, skipped, errors },
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
