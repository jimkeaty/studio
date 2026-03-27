// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

import type { AgentDashboardData, BusinessPlan } from "@/lib/types";

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

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

    // ── Phase 1: Fetch plan + agent profile in parallel ────────────────
    const [planSnap, agentProfileData] = await Promise.all([
      planDocRef(adminDb, uid, year).get(),
      (async () => {
        try {
          // Strategy 1: uid IS the agentId (doc ID)
          const profileByIdSnap = await adminDb.collection('agentProfiles').doc(uid).get();
          if (profileByIdSnap.exists) return profileByIdSnap.data();

          // Strategy 2: Search by agentId field
          const profileByAgentIdSnap = await adminDb.collection('agentProfiles')
            .where('agentId', '==', uid)
            .limit(1)
            .get();
          if (!profileByAgentIdSnap.empty) return profileByAgentIdSnap.docs[0].data();

          // Strategy 3: Match by email from auth token
          const email = decoded.email || '';
          if (email) {
            const profileByEmailSnap = await adminDb.collection('agentProfiles')
              .where('email', '==', email)
              .limit(1)
              .get();
            if (!profileByEmailSnap.empty) return profileByEmailSnap.docs[0].data();
          }

          return null;
        } catch (err) {
          console.warn('[dashboard] Failed to fetch agent profile:', err);
          return null;
        }
      })(),
    ]);

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
    // Initial estimate using workday proration; will be overridden by actual
    // monthly goals from brokerCommandGoals if they exist (see below).
    let expectedYTDIncomeGoal = Number(
      ((annualIncomeGoal * elapsedWorkdays) / totalWorkdaysInYear).toFixed(2)
    );

    const dailyEngagementTarget = asNumber(plan.calculatedTargets?.engagements?.daily);
    const engagementGoalToDate = Number((dailyEngagementTarget * elapsedWorkdays).toFixed(2));

    // ── Phase 2: Fetch transactions, daily activity, and goals in parallel ─
    const goalSegment = `agent_${uid}`;
    const [txSnap, activitySnap, goalsSnap] = await Promise.all([
      adminDb
        .collection("transactions")
        .where("agentId", "==", uid)
        .where("year", "==", yearNum)
        .get(),
      adminDb
        .collection("daily_activity")
        .where("agentId", "==", uid)
        .where("date", ">=", toYmd(effectiveStart))
        .where("date", "<=", toYmd(asOf))
        .get(),
      adminDb.collection("brokerCommandGoals")
        .where("year", "==", yearNum)
        .where("segment", "==", goalSegment)
        .get(),
    ]);

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
    let grossGCIYTD = 0;
    let pendingGrossGCI = 0;
    let latestPendingCloseMonth = 0; // 1-based month of the latest pending expected close

    for (const doc of txSnap.docs) {
      const t = doc.data() || {};
      const status = String(t.status || "").trim();
      const net = getTransactionNet(t);
      const dealValue = asNumber(t.dealValue);
      const gci = asNumber(t.splitSnapshot?.grossCommission || t.commission);
      // Tier progression tracks total gross commission (progressionCompanyDollarCredit = commission).
      // Fall back to grossCommission if creditSnapshot not present.
      const tierGCI = asNumber(
        t.creditSnapshot?.progressionCompanyDollarCredit
        || t.splitSnapshot?.grossCommission
        || t.commission
      );

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
          grossGCIYTD += tierGCI;
        }
      } else if (status === "pending" || status === "under_contract") {
        const d = getTransactionDateForPending(t);
        if (!d) continue;

        const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const monthIndex = dUtc.getUTCMonth();

        monthlyBuckets[monthIndex].pending += net;

        // Track expected close date for projection grading
        const expectedCloseDate = toDate(
          t.projectedCloseDate || t.closedDate || t.closingDate
        );
        if (expectedCloseDate) {
          const closeMonth = expectedCloseDate.getUTCMonth() + 1; // 1-based
          if (closeMonth > latestPendingCloseMonth) {
            latestPendingCloseMonth = closeMonth;
          }
        }

        if (
          dUtc.getTime() >= effectiveStart.getTime() &&
          dUtc.getTime() <= asOf.getTime()
        ) {
          netPending += net;
          pendingUnits += 1;
          pendingVolume += dealValue;
          pendingGrossGCI += tierGCI;
        }
      }
    }

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

    // ── Grace period from agent profile (fetched in Phase 1) ───────────
    let isMetricsGracePeriod = false;
    if (agentProfileData?.gracePeriodEnabled === true) {
      const startDate = toDate(agentProfileData.startDate);
      if (startDate) {
        const daysSinceStart = Math.floor((todayUtc.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        isMetricsGracePeriod = daysSinceStart <= 90;
      } else {
        isMetricsGracePeriod = true; // gracePeriodEnabled but no start date → assume grace
      }
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

    // ── Process agent goals (volume + sales count + income) ────────────
    // Current month (1-based)
    const currentMonth = asOf.getUTCMonth() + 1; // 1=Jan, 12=Dec

    let yearlyVolumeGoal = 0;
    let yearlySalesGoal = 0;
    let yearlyIncomeGoalFromMonthly = 0;
    let volumeGoalToDate = 0;
    let salesGoalToDate = 0;
    let incomeGoalToDate = 0;
    // Projected goals: through the latest pending close month (for grading projections)
    const projectedMonth = Math.max(currentMonth, latestPendingCloseMonth);
    let projectedIncomeGoal = 0;
    let projectedVolumeGoal = 0;
    let projectedSalesGoal = 0;

    for (const gDoc of goalsSnap.docs) {
      const g = gDoc.data();
      const gMonth = asNumber(g.month); // 1-12
      yearlyVolumeGoal += asNumber(g.volumeGoal);
      yearlySalesGoal += asNumber(g.salesCountGoal);
      yearlyIncomeGoalFromMonthly += asNumber(g.grossMarginGoal);

      // Sum goals for months 1 through current month for YTD targets
      if (gMonth >= 1 && gMonth <= currentMonth) {
        volumeGoalToDate += asNumber(g.volumeGoal);
        salesGoalToDate += asNumber(g.salesCountGoal);
        incomeGoalToDate += asNumber(g.grossMarginGoal);
      }

      // Sum goals through projected month (when pending deals close)
      if (gMonth >= 1 && gMonth <= projectedMonth) {
        projectedIncomeGoal += asNumber(g.grossMarginGoal);
        projectedVolumeGoal += asNumber(g.volumeGoal);
        projectedSalesGoal += asNumber(g.salesCountGoal);
      }
    }

    volumeGoalToDate = Number(volumeGoalToDate.toFixed(2));
    salesGoalToDate = Number(salesGoalToDate.toFixed(2));
    incomeGoalToDate = Number(incomeGoalToDate.toFixed(2));
    projectedIncomeGoal = Number(projectedIncomeGoal.toFixed(2));
    projectedVolumeGoal = Number(projectedVolumeGoal.toFixed(2));
    projectedSalesGoal = Number(projectedSalesGoal.toFixed(2));

    // Override income YTD goal with actual monthly goals if available
    if (incomeGoalToDate > 0) {
      expectedYTDIncomeGoal = incomeGoalToDate;
      const recalcIncomePerf = performance(netEarned, expectedYTDIncomeGoal);
      // Projected: grade closed+pending against goal at their close date
      const projIncomeTarget = projectedIncomeGoal > 0 ? projectedIncomeGoal : expectedYTDIncomeGoal;
      const recalcPipelinePerf = performance(ytdTotalPotential, projIncomeTarget);
      dashboard.expectedYTDIncomeGoal = expectedYTDIncomeGoal;
      dashboard.incomeGrade = isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcIncomePerf);
      dashboard.incomePerformance = recalcIncomePerf;
      dashboard.pipelineAdjustedIncome = {
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcPipelinePerf),
        performance: recalcPipelinePerf,
      };
      dashboard.incomeDeltaToGoal = Number((netEarned - expectedYTDIncomeGoal).toFixed(2));
    }

    // Override KPI closings target with monthly sales goals if available
    if (salesGoalToDate > 0) {
      const recalcClosingsPerf = performance(closedUnits, salesGoalToDate);
      dashboard.kpis.closings = {
        actual: closedUnits,
        target: salesGoalToDate,
        performance: recalcClosingsPerf,
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcClosingsPerf),
      };
    }

    // Volume & deals: grade closed against current YTD goal,
    // projected against goal at pending close date
    const volumePerf = performance(closedVolume, volumeGoalToDate);
    const projVolTarget = projectedVolumeGoal > 0 ? projectedVolumeGoal : volumeGoalToDate;
    const projectedVolumePerf = performance(closedVolume + pendingVolume, projVolTarget);
    const dealsPerf = performance(closedUnits, salesGoalToDate);
    const projDealsTarget = projectedSalesGoal > 0 ? projectedSalesGoal : salesGoalToDate;
    const projectedDealsPerf = performance(closedUnits + pendingUnits, projDealsTarget);

    dashboard.volumeMetrics = {
      closedVolume: Number(closedVolume.toFixed(2)),
      pendingVolume: Number(pendingVolume.toFixed(2)),
      totalVolume: Number((closedVolume + pendingVolume).toFixed(2)),
      volumeGoal: volumeGoalToDate > 0 ? volumeGoalToDate : null,
      volumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(volumePerf),
      volumePerformance: volumePerf,
      projectedVolumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(projectedVolumePerf),
      projectedVolumePerformance: projectedVolumePerf,
      closedDeals: closedUnits,
      pendingDeals: pendingUnits,
      dealsGoal: salesGoalToDate > 0 ? salesGoalToDate : null,
      dealsGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(dealsPerf),
      dealsPerformance: dealsPerf,
      projectedDealsGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(projectedDealsPerf),
      projectedDealsPerformance: projectedDealsPerf,
      projectedVolumeGoal: projectedVolumeGoal > 0 ? projectedVolumeGoal : null,
      projectedDealsGoal: projectedSalesGoal > 0 ? projectedSalesGoal : null,
      projectedIncomeGoal: projectedIncomeGoal > 0 ? projectedIncomeGoal : null,
    };

    // ── Tier / Cap progress ──────────────────────────────────────────────
    // Build tiers from profile (independent agents) OR team plan (team agents)
    let resolvedTiers: { tierName: string; fromCompanyDollar: number; toCompanyDollar: number | null; agentSplitPercent: number; companySplitPercent: number }[] = [];

    // 1) Try individual tiers from profile
    if (Array.isArray(agentProfileData?.tiers) && agentProfileData.tiers.length > 0) {
      resolvedTiers = agentProfileData.tiers.map((t: any, i: number) => ({
        tierName: t.tierName || `Tier ${i + 1}`,
        fromCompanyDollar: asNumber(t.fromCompanyDollar),
        toCompanyDollar: t.toCompanyDollar != null ? asNumber(t.toCompanyDollar) : null,
        agentSplitPercent: asNumber(t.agentSplitPercent),
        companySplitPercent: asNumber(t.companySplitPercent),
      }));
    }

    // 2) If no individual tiers, try team plan bands (for team leaders/members)
    if (resolvedTiers.length === 0 && agentProfileData?.primaryTeamId) {
      try {
        const teamId = agentProfileData.primaryTeamId;
        const teamRole = agentProfileData.teamRole; // 'leader' | 'member'

        // Find the team to get teamPlanId
        const teamSnap = await adminDb.collection('teams').doc(teamId).get();
        const teamData = teamSnap.exists ? teamSnap.data() : null;
        const teamPlanId = teamData?.teamPlanId;

        if (teamPlanId) {
          const tpSnap = await adminDb.collection('teamPlans').doc(teamPlanId).get();
          const tpData = tpSnap.exists ? tpSnap.data() : null;

          if (tpData) {
            if (teamRole === 'leader' && Array.isArray(tpData.leaderStructureBands)) {
              // Leader: leaderPercent = agent side, companyPercent = company side
              resolvedTiers = tpData.leaderStructureBands.map((b: any, i: number) => ({
                tierName: b.tierName || `Tier ${i + 1}`,
                fromCompanyDollar: asNumber(b.fromCompanyDollar),
                toCompanyDollar: b.toCompanyDollar != null ? asNumber(b.toCompanyDollar) : null,
                agentSplitPercent: asNumber(b.leaderPercent),
                companySplitPercent: asNumber(b.companyPercent),
              }));
            } else if (teamRole === 'member') {
              // Check for custom member plan first
              const agentIdForMember = agentProfileData.agentId || uid;
              const memberPlanSnap = await adminDb.collection('memberPlans')
                .where('agentId', '==', agentIdForMember)
                .where('teamId', '==', teamId)
                .limit(1)
                .get();

              if (!memberPlanSnap.empty) {
                const mp = memberPlanSnap.docs[0].data();
                if (Array.isArray(mp.payoutBands)) {
                  resolvedTiers = mp.payoutBands.map((b: any, i: number) => ({
                    tierName: b.tierName || `Tier ${i + 1}`,
                    fromCompanyDollar: asNumber(b.fromCompanyDollar),
                    toCompanyDollar: b.toCompanyDollar != null ? asNumber(b.toCompanyDollar) : null,
                    agentSplitPercent: asNumber(b.memberPercent),
                    companySplitPercent: Number((100 - asNumber(b.memberPercent)).toFixed(1)),
                  }));
                }
              } else if (Array.isArray(tpData.memberDefaultBands)) {
                // Fall back to team's default member bands
                resolvedTiers = tpData.memberDefaultBands.map((b: any, i: number) => ({
                  tierName: b.tierName || `Tier ${i + 1}`,
                  fromCompanyDollar: asNumber(b.fromCompanyDollar),
                  toCompanyDollar: b.toCompanyDollar != null ? asNumber(b.toCompanyDollar) : null,
                  agentSplitPercent: asNumber(b.memberPercent),
                  companySplitPercent: Number((100 - asNumber(b.memberPercent)).toFixed(1)),
                }));
              }
            }
          }
        }
      } catch (teamErr) {
        console.warn('[dashboard] Failed to load team plan tiers:', teamErr);
      }
    }
    console.log(`[dashboard] tiers resolved: ${resolvedTiers.length}, grossGCI: ${grossGCIYTD.toFixed(2)}, profile: ${!!agentProfileData}`);

    // Start date + anniversary (tier reset) date — always compute regardless of tiers
    const agentStartDate = agentProfileData?.startDate || null;
    const annivMonth = asNumber(agentProfileData?.anniversaryMonth);
    const annivDay = asNumber(agentProfileData?.anniversaryDay);
    let anniversaryDate: string | null = null;
    let daysUntilReset: number | null = null;

    if (annivMonth >= 1 && annivMonth <= 12 && annivDay >= 1) {
      let annivYear = yearNum;
      const annivThisYear = new Date(Date.UTC(annivYear, annivMonth - 1, annivDay));
      if (annivThisYear.getTime() < todayUtc.getTime()) annivYear += 1;
      const nextAnniv = new Date(Date.UTC(annivYear, annivMonth - 1, annivDay));
      anniversaryDate = nextAnniv.toISOString().slice(0, 10);
      daysUntilReset = Math.ceil((nextAnniv.getTime() - todayUtc.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Sort tiers and compute progress
    if (resolvedTiers.length > 0) {
      const sortedTiers = [...resolvedTiers].sort(
        (a, b) => a.fromCompanyDollar - b.fromCompanyDollar
      );

      const totalGCIForTier = grossGCIYTD;

      // Find current tier
      let currentTierIndex = 0;
      for (let i = sortedTiers.length - 1; i >= 0; i--) {
        if (totalGCIForTier >= sortedTiers[i].fromCompanyDollar) {
          currentTierIndex = i;
          break;
        }
      }

      const currentTier = sortedTiers[currentTierIndex];
      const nextTier = currentTierIndex < sortedTiers.length - 1 ? sortedTiers[currentTierIndex + 1] : null;

      const tierFrom = currentTier.fromCompanyDollar;
      const tierTo = currentTier.toCompanyDollar != null
        ? currentTier.toCompanyDollar
        : (nextTier ? nextTier.fromCompanyDollar : null);

      let progressInCurrentTier = 0;
      let capReached = false;
      if (tierTo != null && tierTo > tierFrom) {
        progressInCurrentTier = Math.min(100, Math.round(((totalGCIForTier - tierFrom) / (tierTo - tierFrom)) * 100));
      } else if (!nextTier) {
        capReached = totalGCIForTier > tierFrom;
        progressInCurrentTier = 100;
      }

      dashboard.tierProgress = {
        tiers: sortedTiers,
        grossGCIYTD: Number(grossGCIYTD.toFixed(2)),
        pendingGrossGCI: Number(pendingGrossGCI.toFixed(2)),
        currentTierIndex,
        currentTierName: currentTier.tierName || `Tier ${currentTierIndex + 1}`,
        nextTierName: nextTier ? (nextTier.tierName || `Tier ${currentTierIndex + 2}`) : null,
        nextTierThreshold: nextTier ? nextTier.fromCompanyDollar : null,
        progressInCurrentTier,
        capReached,
        effectiveStartDate: agentStartDate,
        anniversaryDate,
        daysUntilReset,
      };
    } else {
      // No tiers resolved — still provide start date info + diagnostic data
      dashboard.tierProgress = {
        tiers: [],
        grossGCIYTD: Number(grossGCIYTD.toFixed(2)),
        pendingGrossGCI: Number(pendingGrossGCI.toFixed(2)),
        currentTierIndex: 0,
        currentTierName: 'No Tier',
        nextTierName: null,
        nextTierThreshold: null,
        progressInCurrentTier: 0,
        capReached: false,
        effectiveStartDate: agentStartDate,
        anniversaryDate,
        daysUntilReset,
        // Diagnostic: why tiers weren't resolved
        _debug: {
          profileFound: !!agentProfileData,
          agentType: agentProfileData?.agentType ?? null,
          tiersOnProfile: Array.isArray(agentProfileData?.tiers) ? agentProfileData.tiers.length : 0,
          primaryTeamId: agentProfileData?.primaryTeamId ?? null,
          teamRole: agentProfileData?.teamRole ?? null,
        },
      } as any;
    }

    // ── Phase 3: Previous year comparison + available years in parallel ─
    const compareYearParam = reqParams.get("compareYear");
    let prevYearComparison: typeof dashboard.prevYearComparison = null;

    const compYear = compareYearParam ? Number(compareYearParam) : yearNum - 1;

    const [prevTxSnap, prevActivitySnap, allTxYearsSnap] = await Promise.all([
      adminDb
        .collection("transactions")
        .where("agentId", "==", uid)
        .where("year", "==", compYear)
        .get(),
      adminDb
        .collection("daily_activity")
        .where("agentId", "==", uid)
        .where("date", ">=", `${compYear}-01-01`)
        .where("date", "<=", `${compYear}-12-31`)
        .get(),
      adminDb
        .collection("transactions")
        .where("agentId", "==", uid)
        .select("year")
        .get(),
    ]);

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

    const availableYears = [...new Set(allTxYearsSnap.docs.map(d => asNumber(d.data().year)))]
      .filter(y => y > 0 && y !== yearNum)
      .sort((a, b) => b - a);

    dashboard.availableComparisonYears = availableYears;

    return NextResponse.json({
      ok: true,
      year: yearNum,
      dashboard,
      plan: serializeFirestore(plan),
      ytdMetrics: null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
