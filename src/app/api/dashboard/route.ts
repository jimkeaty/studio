// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

import type { AgentDashboardData, BusinessPlan } from "@/lib/types";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function planDocRef(db: FirebaseFirestore.Firestore, uid: string, year: string) {
  return db
    .collection("dashboards")
    .doc(year)
    .collection("agent")
    .doc(uid)
    .collection("plans")
    .doc("plan");
}

function parseYear(req: NextRequest): string {
  const { searchParams } = new URL(req.url);
  const fallback = String(new Date().getFullYear());
  const year = searchParams.get("year") || fallback;
  const n = Number(year);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return fallback;
  return String(n);
}

function asNumber(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function toYmd(value: any): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function monthLabel(index: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

function endOfYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function countWeekdaysInclusive(start: Date, end: Date): number {
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  if (s.getTime() > e.getTime()) return 0;

  let count = 0;
  const cur = new Date(s);
  while (cur.getTime() <= e.getTime()) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function gradeFromPerformance(performance: number): "A" | "B" | "C" | "D" | "F" {
  if (performance >= 90) return "A";
  if (performance >= 80) return "B";
  if (performance >= 70) return "C";
  if (performance >= 60) return "D";
  return "F";
}

function performance(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Number(((actual / target) * 100).toFixed(1));
}

function getTransactionNet(t: any): number {
  const splitNet = asNumber(t?.splitSnapshot?.agentNetCommission);
  if (splitNet > 0) return splitNet;
  return asNumber(t?.commission);
}

function getTransactionDateForEarned(t: any): Date | null {
  return toDate(t?.closedDate || t?.closingDate || null);
}

function getTransactionDateForPending(t: any): Date | null {
  return toDate(t?.contractDate || t?.pendingDate || t?.underContractDate || null);
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const year = parseYear(req);
    const yearNum = Number(year);

    const planSnap = await planDocRef(adminDb, uid, year).get();
    const plan = (planSnap.exists ? (planSnap.data() ?? {}) : {}) as Partial<BusinessPlan>;

    const yearStart = startOfYear(yearNum);
    const yearEnd = endOfYear(yearNum);

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const asOf = minDate(todayUtc, yearEnd);

    const derivedPlanStart = toDate(
      plan.resetStartDate || plan.planStartDate || `${year}-01-01`
    ) || yearStart;

    const effectiveStart = maxDate(
      new Date(Date.UTC(derivedPlanStart.getUTCFullYear(), derivedPlanStart.getUTCMonth(), derivedPlanStart.getUTCDate())),
      yearStart
    );

    const totalWorkdaysInYear =
      Math.max(
        1,
        asNumber(plan.assumptions?.workingDaysPerMonth) * 12 -
          asNumber(plan.assumptions?.weeksOff) * 5
      );

    const elapsedWorkdays =
      asOf.getTime() < effectiveStart.getTime()
        ? 0
        : countWeekdaysInclusive(effectiveStart, asOf);

    const annualIncomeGoal = asNumber(plan.annualIncomeGoal);
    const expectedYTDIncomeGoal = Number(
      ((annualIncomeGoal * elapsedWorkdays) / totalWorkdaysInYear).toFixed(2)
    );

    const dailyEngagementTarget = asNumber(plan.calculatedTargets?.engagements?.daily);
    const engagementGoalToDate = Number((dailyEngagementTarget * elapsedWorkdays).toFixed(2));

    const txSnap = await adminDb
      .collection("transactions")
      .where("agentId", "==", uid)
      .where("year", "==", yearNum)
      .get();

    let netEarned = 0;
    let netPending = 0;

    const monthlyBuckets = Array.from({ length: 12 }, (_, idx) => ({
      month: monthLabel(idx),
      closed: 0,
      pending: 0,
      goal: 0,
    }));

    const monthlyGoal = asNumber(plan.calculatedTargets?.monthlyNetIncome);
    for (let i = 0; i < 12; i += 1) {
      monthlyBuckets[i].goal = monthlyGoal;
    }

    let closedUnits = 0;
    let pendingUnits = 0;

    for (const doc of txSnap.docs) {
      const t = doc.data() || {};
      const status = String(t.status || "").trim();
      const net = getTransactionNet(t);

      if (status === "closed") {
        const d = getTransactionDateForEarned(t);
        if (!d) continue;

        const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const monthIndex = dUtc.getUTCMonth();

        monthlyBuckets[monthIndex].closed += net;

        if (
          dUtc.getTime() >= effectiveStart.getTime() &&
          dUtc.getTime() <= asOf.getTime()
        ) {
          netEarned += net;
          closedUnits += 1;
        }
      } else if (status === "pending" || status === "under_contract") {
        const d = getTransactionDateForPending(t);
        if (!d) continue;

        const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const monthIndex = dUtc.getUTCMonth();

        monthlyBuckets[monthIndex].pending += net;

        if (
          dUtc.getTime() >= effectiveStart.getTime() &&
          dUtc.getTime() <= asOf.getTime()
        ) {
          netPending += net;
          pendingUnits += 1;
        }
      }
    }

    const activitySnap = await adminDb
      .collection("daily_activity")
      .where("agentId", "==", uid)
      .where("date", ">=", toYmd(effectiveStart))
      .where("date", "<=", toYmd(asOf))
      .get();

    let callsActual = 0;
    let engagementsActual = 0;
    let appointmentsSetActual = 0;
    let appointmentsHeldActual = 0;
    let contractsWrittenActual = 0;

    for (const doc of activitySnap.docs) {
      const a = doc.data() || {};
      callsActual += asNumber(a.callsCount);
      engagementsActual += asNumber(a.engagementsCount);
      appointmentsSetActual += asNumber(a.appointmentsSetCount);
      appointmentsHeldActual += asNumber(a.appointmentsHeldCount);
      contractsWrittenActual += asNumber(a.contractsWrittenCount);
    }

    const ytdTotalPotential = Number((netEarned + netPending).toFixed(2));
    const incomePerformance = performance(netEarned, expectedYTDIncomeGoal);
    const pipelinePerformance = performance(ytdTotalPotential, expectedYTDIncomeGoal);

    const callsTarget = Number((asNumber(plan.calculatedTargets?.calls?.daily) * elapsedWorkdays).toFixed(2));
    const engagementsTarget = Number((dailyEngagementTarget * elapsedWorkdays).toFixed(2));
    const appointmentsSetTarget = Number((asNumber(plan.calculatedTargets?.appointmentsSet?.daily) * elapsedWorkdays).toFixed(2));
    const appointmentsHeldTarget = Number((asNumber(plan.calculatedTargets?.appointmentsHeld?.daily) * elapsedWorkdays).toFixed(2));
    const contractsWrittenTarget = Number((asNumber(plan.calculatedTargets?.contractsWritten?.daily) * elapsedWorkdays).toFixed(2));
    const closingsTarget = Number((asNumber(plan.calculatedTargets?.closings?.daily) * elapsedWorkdays).toFixed(2));

    const engagementDelta = Number((engagementsActual - engagementGoalToDate).toFixed(2));
    const catchUpWindowDays = 20;
    const behindAmount = Math.max(0, engagementGoalToDate - engagementsActual);
    const catchUpDailyRequired = Number(
      (asNumber(plan.calculatedTargets?.engagements?.daily) + behindAmount / catchUpWindowDays).toFixed(2)
    );

    const dashboard: AgentDashboardData = {
      userId: uid,

      leadIndicatorGrade: gradeFromPerformance(performance(engagementsActual, engagementsTarget)),
      leadIndicatorPerformance: performance(engagementsActual, engagementsTarget),
      isLeadIndicatorGracePeriod: elapsedWorkdays < 5,

      incomeGrade: gradeFromPerformance(incomePerformance),
      incomePerformance,
      isIncomeGracePeriod: elapsedWorkdays < 5,
      expectedYTDIncomeGoal,
      ytdTotalPotential,

      pipelineAdjustedIncome: {
        grade: gradeFromPerformance(pipelinePerformance),
        performance: pipelinePerformance,
      },

      kpis: {
        calls: {
          actual: callsActual,
          target: callsTarget,
          performance: performance(callsActual, callsTarget),
          grade: gradeFromPerformance(performance(callsActual, callsTarget)),
        },
        engagements: {
          actual: engagementsActual,
          target: engagementsTarget,
          performance: performance(engagementsActual, engagementsTarget),
          grade: gradeFromPerformance(performance(engagementsActual, engagementsTarget)),
        },
        appointmentsSet: {
          actual: appointmentsSetActual,
          target: appointmentsSetTarget,
          performance: performance(appointmentsSetActual, appointmentsSetTarget),
          grade: gradeFromPerformance(performance(appointmentsSetActual, appointmentsSetTarget)),
        },
        appointmentsHeld: {
          actual: appointmentsHeldActual,
          target: appointmentsHeldTarget,
          performance: performance(appointmentsHeldActual, appointmentsHeldTarget),
          grade: gradeFromPerformance(performance(appointmentsHeldActual, appointmentsHeldTarget)),
        },
        contractsWritten: {
          actual: contractsWrittenActual,
          target: contractsWrittenTarget,
          performance: performance(contractsWrittenActual, contractsWrittenTarget),
          grade: gradeFromPerformance(performance(contractsWrittenActual, contractsWrittenTarget)),
        },
        closings: {
          actual: closedUnits,
          target: closingsTarget,
          performance: performance(closedUnits, closingsTarget),
          grade: gradeFromPerformance(performance(closedUnits, closingsTarget)),
        },
      },

      netEarned: Number(netEarned.toFixed(2)),
      netPending: Number(netPending.toFixed(2)),

      monthlyIncome: monthlyBuckets.map((m) => ({
        month: m.month,
        closed: Number(m.closed.toFixed(2)),
        pending: Number(m.pending.toFixed(2)),
        goal: Number(m.goal.toFixed(2)),
      })),

      totalClosedIncomeForYear: Number(netEarned.toFixed(2)),
      totalPendingIncomeForYear: Number(netPending.toFixed(2)),
      totalIncomeWithPipelineForYear: Number(ytdTotalPotential.toFixed(2)),

      effectiveStartDate: toYmd(effectiveStart) || undefined,
      annualIncomeGoal,
      projectedNetIncome: Number(ytdTotalPotential.toFixed(2)),
      incomeDeltaToGoal: Number((netEarned - expectedYTDIncomeGoal).toFixed(2)),

      engagementGoalToDate: Number(engagementGoalToDate.toFixed(2)),
      engagementDelta,
      catchUpWindowDays,
      catchUpDailyRequired,

      forecast: {
        projectedClosings: pendingUnits + closedUnits,
        paceBasedNetIncome: Number(ytdTotalPotential.toFixed(2)),
      },

      conversions: {
        callToEngagement: {
          actual: callsActual > 0 ? Number((engagementsActual / callsActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.callToEngagement),
        },
        engagementToAppointmentSet: {
          actual: engagementsActual > 0 ? Number((appointmentsSetActual / engagementsActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.engagementToAppointmentSet),
        },
        appointmentSetToHeld: {
          actual: appointmentsSetActual > 0 ? Number((appointmentsHeldActual / appointmentsSetActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.appointmentSetToHeld),
        },
        appointmentHeldToContract: {
          actual: appointmentsHeldActual > 0 ? Number((contractsWrittenActual / appointmentsHeldActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.appointmentHeldToContract),
        },
        contractToClosing: {
          actual: contractsWrittenActual > 0 ? Number((closedUnits / contractsWrittenActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.contractToClosing),
        },
      },

      stats: {
        ytdVolume: 0,
        avgSalesPrice: 0,
        buyerClosings: 0,
        sellerClosings: 0,
        renterClosings: 0,
        avgCommission: closedUnits > 0 ? Number((netEarned / closedUnits).toFixed(2)) : 0,
        engagementValue: engagementsActual > 0 ? Number((netEarned / engagementsActual).toFixed(2)) : 0,
      },
    };

    return NextResponse.json({
      ok: true,
      year: yearNum,
      dashboard,
      plan,
      ytdMetrics: null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
