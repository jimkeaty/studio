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
    const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

    // Allow admin to view any agent's dashboard via ?viewAs=agentId
    const reqParams = new URL(req.url).searchParams;
    const viewAs = reqParams.get('viewAs');
    const uid = (viewAs && decoded.uid === ADMIN_UID) ? viewAs : decoded.uid;

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
    let closedVolume = 0;
    let pendingVolume = 0;
    let totalGCI = 0;

    for (const doc of txSnap.docs) {
      const t = doc.data() || {};
      const status = String(t.status || "").trim();
      const net = getTransactionNet(t);
      const dealValue = asNumber(t.dealValue);
      const gci = asNumber(t.splitSnapshot?.grossCommission || t.commission);

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
          closedVolume += dealValue;
          totalGCI += gci;
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
          pendingVolume += dealValue;
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

    // ── Fetch agent profile for grace period check ────────────────────────
    let isMetricsGracePeriod = false;
    try {
      // Try matching by agentId patterns: uid directly, or by email
      const profileByIdSnap = await adminDb.collection('agentProfiles').doc(uid).get();
      if (profileByIdSnap.exists) {
        const profile = profileByIdSnap.data();
        if (profile?.gracePeriodEnabled === true) {
          // Check if agent started within last 90 days
          const startDate = toDate(profile.startDate);
          if (startDate) {
            const daysSinceStart = Math.floor((todayUtc.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            isMetricsGracePeriod = daysSinceStart <= 90;
          } else {
            isMetricsGracePeriod = true; // gracePeriodEnabled but no start date → assume grace
          }
        }
      } else {
        // Try finding by email from decoded token
        const email = decoded.email || '';
        if (email) {
          const profileByEmailSnap = await adminDb.collection('agentProfiles')
            .where('email', '==', email)
            .limit(1)
            .get();
          if (!profileByEmailSnap.empty) {
            const profile = profileByEmailSnap.docs[0].data();
            if (profile?.gracePeriodEnabled === true) {
              const startDate = toDate(profile.startDate);
              if (startDate) {
                const daysSinceStart = Math.floor((todayUtc.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                isMetricsGracePeriod = daysSinceStart <= 90;
              } else {
                isMetricsGracePeriod = true;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[dashboard] Failed to check grace period:', err);
    }

    const dashboard: AgentDashboardData = {
      userId: uid,

      leadIndicatorGrade: gradeFromPerformance(performance(engagementsActual, engagementsTarget)),
      leadIndicatorPerformance: performance(engagementsActual, engagementsTarget),
      isLeadIndicatorGracePeriod: elapsedWorkdays < 5,

      incomeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(incomePerformance),
      incomePerformance,
      isIncomeGracePeriod: elapsedWorkdays < 5,
      isMetricsGracePeriod,
      expectedYTDIncomeGoal,
      ytdTotalPotential,

      pipelineAdjustedIncome: {
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(pipelinePerformance),
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
        ytdVolume: Number(closedVolume.toFixed(2)),
        avgSalesPrice: closedUnits > 0 ? Number((closedVolume / closedUnits).toFixed(2)) : 0,
        buyerClosings: 0,
        sellerClosings: 0,
        renterClosings: 0,
        avgCommission: closedUnits > 0 ? Number((netEarned / closedUnits).toFixed(2)) : 0,
        engagementValue: engagementsActual > 0 ? Number((netEarned / engagementsActual).toFixed(2)) : 0,
        appointmentValue: appointmentsHeldActual > 0 ? Number((netEarned / appointmentsHeldActual).toFixed(2)) : 0,
        avgCommissionPct: closedVolume > 0 ? Number(((totalGCI / closedVolume) * 100).toFixed(2)) : 0,
        pendingVolume: Number(pendingVolume.toFixed(2)),
      },
    };

    // ── Fetch agent goals (volume + sales count) ─────────────────────────
    const goalSegment = `agent_${uid}`;
    const goalsSnap = await adminDb.collection("brokerCommandGoals")
      .where("year", "==", yearNum)
      .where("segment", "==", goalSegment)
      .get();

    let yearlyVolumeGoal = 0;
    let yearlySalesGoal = 0;
    for (const gDoc of goalsSnap.docs) {
      const g = gDoc.data();
      yearlyVolumeGoal += asNumber(g.volumeGoal);
      yearlySalesGoal += asNumber(g.salesCountGoal);
    }

    // Prorate goals to elapsed workdays
    const volumeGoalToDate = totalWorkdaysInYear > 0
      ? Number(((yearlyVolumeGoal * elapsedWorkdays) / totalWorkdaysInYear).toFixed(2))
      : 0;
    const salesGoalToDate = totalWorkdaysInYear > 0
      ? Number(((yearlySalesGoal * elapsedWorkdays) / totalWorkdaysInYear).toFixed(2))
      : 0;

    const volumePerf = performance(closedVolume, volumeGoalToDate);
    const projectedVolumePerf = performance(closedVolume + pendingVolume, volumeGoalToDate);
    const dealsPerf = performance(closedUnits, salesGoalToDate);

    dashboard.volumeMetrics = {
      closedVolume: Number(closedVolume.toFixed(2)),
      pendingVolume: Number(pendingVolume.toFixed(2)),
      totalVolume: Number((closedVolume + pendingVolume).toFixed(2)),
      volumeGoal: yearlyVolumeGoal > 0 ? yearlyVolumeGoal : null,
      volumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(volumePerf),
      volumePerformance: volumePerf,
      projectedVolumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(projectedVolumePerf),
      projectedVolumePerformance: projectedVolumePerf,
      closedDeals: closedUnits,
      pendingDeals: pendingUnits,
      dealsGoal: yearlySalesGoal > 0 ? yearlySalesGoal : null,
      dealsGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(dealsPerf),
      dealsPerformance: dealsPerf,
    };

    // ── Previous year comparison ─────────────────────────────────────────
    const compareYearParam = reqParams.get("compareYear");
    let prevYearComparison: typeof dashboard.prevYearComparison = null;

    const compYear = compareYearParam ? Number(compareYearParam) : yearNum - 1;

    // Always try to load comparison data
    const prevTxSnap = await adminDb
      .collection("transactions")
      .where("agentId", "==", uid)
      .where("year", "==", compYear)
      .get();

    if (!prevTxSnap.empty) {
      let prevNetEarned = 0;
      let prevClosedVolume = 0;
      let prevClosedUnits = 0;
      let prevTotalGCI = 0;

      for (const doc of prevTxSnap.docs) {
        const t = doc.data() || {};
        if (String(t.status || "").trim() !== "closed") continue;
        const d = getTransactionDateForEarned(t);
        if (!d) continue;
        prevNetEarned += getTransactionNet(t);
        prevClosedVolume += asNumber(t.dealValue);
        prevTotalGCI += asNumber(t.splitSnapshot?.grossCommission || t.commission);
        prevClosedUnits += 1;
      }

      // Get prev year activity for engagement/appointment values
      const prevActivitySnap = await adminDb
        .collection("daily_activity")
        .where("agentId", "==", uid)
        .where("date", ">=", `${compYear}-01-01`)
        .where("date", "<=", `${compYear}-12-31`)
        .get();

      let prevEngagements = 0;
      let prevAppointmentsHeld = 0;
      for (const doc of prevActivitySnap.docs) {
        const a = doc.data() || {};
        prevEngagements += asNumber(a.engagementsCount);
        prevAppointmentsHeld += asNumber(a.appointmentsHeldCount);
      }

      prevYearComparison = {
        year: compYear,
        avgSalesPrice: prevClosedUnits > 0 ? Number((prevClosedVolume / prevClosedUnits).toFixed(2)) : 0,
        avgCommissionPct: prevClosedVolume > 0 ? Number(((prevTotalGCI / prevClosedVolume) * 100).toFixed(2)) : 0,
        engagementValue: prevEngagements > 0 ? Number((prevNetEarned / prevEngagements).toFixed(2)) : 0,
        appointmentValue: prevAppointmentsHeld > 0 ? Number((prevNetEarned / prevAppointmentsHeld).toFixed(2)) : 0,
        netEarned: Number(prevNetEarned.toFixed(2)),
        closedVolume: Number(prevClosedVolume.toFixed(2)),
        closedDeals: prevClosedUnits,
      };
    }

    dashboard.prevYearComparison = prevYearComparison;

    // Available comparison years
    const allTxYearsSnap = await adminDb
      .collection("transactions")
      .where("agentId", "==", uid)
      .select("year")
      .get();
    const availableYears = [...new Set(allTxYearsSnap.docs.map(d => asNumber(d.data().year)))]
      .filter(y => y > 0 && y !== yearNum)
      .sort((a, b) => b - a);

    dashboard.availableComparisonYears = availableYears;

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
