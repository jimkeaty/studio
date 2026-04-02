/**
 * GET /api/projections?year=2026&viewAs=<uid>
 *
 * Projection engine — appointment-held-driven, net income based.
 *
 * MATH MODEL:
 * 1. Load plan targets (already calculated and stored by the Business Plan page)
 * 2. Load YTD actuals from daily logs + closed transactions
 * 3. Compute elapsed/remaining work weeks
 * 4. ON-TRACK numbers = plan_target × (elapsed_weeks / total_work_weeks)
 * 5. FULL-YEAR PROJECTION = YTD actual + (remaining weeks × actual weekly pace)
 *    — driven by appointments held per week as the primary KPI
 * 6. CATCH-UP TARGETS = (what's still needed) ÷ (weeks remaining)
 *    — always recalibrated, never the original weekly goal
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return isFinite(x) ? x : fallback;
}

function safeDiv(num: number, den: number, fallback = 0): number {
  return den > 0 ? num / den : fallback;
}

function countWorkWeeks(start: Date, end: Date): number {
  if (end <= start) return 0;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return (end.getTime() - start.getTime()) / msPerWeek;
}

// ── GET /api/projections ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const viewAs = searchParams.get('viewAs');

    // Auth
    const token = extractBearer(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    let uid = decoded.uid;

    if (viewAs) {
      const callerIsAdmin = await isAdminLike(decoded.uid);
      if (!callerIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      uid = viewAs;
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const now = new Date();
    // Use start-of-today as "as of" date
    const asOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // ── 1. Load Business Plan ────────────────────────────────────────────────
    const planSnap = await adminDb
      .collection('businessPlans')
      .where('userId', '==', uid)
      .where('year', '==', year)
      .limit(1)
      .get();

    const plan = planSnap.empty ? null : planSnap.docs[0].data();

    // Plan assumptions
    const annualIncomeGoal = n(plan?.annualIncomeGoal, 100000);
    const avgNetCommission = n(plan?.assumptions?.avgCommission, 5000);
    const workingDaysPerMonth = n(plan?.assumptions?.workingDaysPerMonth, 21);
    const weeksOff = n(plan?.assumptions?.weeksOff, 2);
    const workingWeeksInYear = Math.max(1, 52 - weeksOff);
    const workingDaysInYear = Math.max(1, workingDaysPerMonth * 12 - weeksOff * 5);

    // Plan conversion rates
    const cr = plan?.assumptions?.conversionRates ?? {};
    const planCallToEng = n(cr.callToEngagement, 0.1);
    const planEngToApptSet = n(cr.engagementToAppointmentSet, 0.1);
    const planApptSetToHeld = n(cr.appointmentSetToHeld, 0.9);
    const planApptHeldToContract = n(cr.appointmentHeldToContract, 0.2);
    const planContractToClose = n(cr.contractToClosing, 0.8);

    // Plan annual targets (pre-calculated by Business Plan page, stored in Firestore)
    const pt = plan?.calculatedTargets ?? {};
    const planTargets = {
      closings: n(pt.closings?.yearly),
      contractsWritten: n(pt.contractsWritten?.yearly),
      appointmentsHeld: n(pt.appointmentsHeld?.yearly),
      appointmentsSet: n(pt.appointmentsSet?.yearly),
      engagements: n(pt.engagements?.yearly),
      calls: n(pt.calls?.yearly),
      // Weekly plan targets
      closingsPerWeek: n(pt.closings?.weekly),
      contractsPerWeek: n(pt.contractsWritten?.weekly),
      apptsHeldPerWeek: n(pt.appointmentsHeld?.weekly),
      apptsSetPerWeek: n(pt.appointmentsSet?.weekly),
      engagementsPerWeek: n(pt.engagements?.weekly),
      callsPerWeek: n(pt.calls?.weekly),
    };

    // Effective plan start date
    const rawStart = plan?.resetStartDate ?? plan?.planStartDate ?? `${year}-01-01`;
    const [sy, sm, sd] = rawStart.split('-').map(Number);
    const planStart = new Date(Date.UTC(sy, sm - 1, sd));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const effectiveStart = planStart < yearStart ? yearStart : planStart;

    // ── 2. Time calculations ─────────────────────────────────────────────────
    const elapsedWeeks = asOf <= effectiveStart ? 0 : countWorkWeeks(effectiveStart, asOf);
    const remainingWeeks = asOf >= yearEnd ? 0 : countWorkWeeks(asOf, yearEnd);
    const totalWeeks = elapsedWeeks + remainingWeeks;
    const yearPct = totalWeeks > 0 ? elapsedWeeks / workingWeeksInYear : 0;

    // ── 3. Load YTD Daily Logs ───────────────────────────────────────────────
    const logsSnap = await adminDb
      .collection('dailyLogs')
      .where('userId', '==', uid)
      .get();

    let callsActual = 0;
    let engagementsActual = 0;
    let appointmentsSetActual = 0;
    let appointmentsHeldActual = 0;
    let contractsWrittenActual = 0;

    for (const doc of logsSnap.docs) {
      const d = doc.data();
      const logDate = d.date ? new Date(d.date) : null;
      if (!logDate) continue;
      if (logDate.getUTCFullYear() !== year) continue;
      callsActual += n(d.callsCount);
      engagementsActual += n(d.engagementsCount);
      appointmentsSetActual += n(d.appointmentsSetCount);
      appointmentsHeldActual += n(d.appointmentsHeldCount);
      contractsWrittenActual += n(d.contractsWrittenCount);
    }

    // ── 4. Load YTD Transactions (agent net income only) ─────────────────────
    const txSnap = await adminDb
      .collection('transactions')
      .where('agentId', '==', uid)
      .where('year', '==', year)
      .get();

    let netEarned = 0;
    let closedUnits = 0;
    let pendingUnits = 0;
    let pendingNetIncome = 0;

    for (const doc of txSnap.docs) {
      const tx = doc.data();
      const status = (tx.status ?? '').toLowerCase();
      // Agent net = splitSnapshot.agentNetCommission (never GCI)
      const agentNet = n(tx.splitSnapshot?.agentNetCommission ?? tx.splitSnapshot?.agentDollar ?? tx.commission);
      if (['closed', 'sold'].includes(status)) {
        netEarned += agentNet;
        closedUnits += 1;
      } else if (['pending', 'under_contract', 'active'].includes(status)) {
        pendingNetIncome += agentNet;
        pendingUnits += 1;
      }
    }

    // Actual avg net per closing (use plan avgCommission if no closings yet)
    const actualAvgNetPerClosing = closedUnits > 0 ? netEarned / closedUnits : avgNetCommission;

    // ── 5. On-track numbers (where agent SHOULD be today) ────────────────────
    const onTrack = {
      closings: planTargets.closings * yearPct,
      contractsWritten: planTargets.contractsWritten * yearPct,
      appointmentsHeld: planTargets.appointmentsHeld * yearPct,
      appointmentsSet: planTargets.appointmentsSet * yearPct,
      engagements: planTargets.engagements * yearPct,
      calls: planTargets.calls * yearPct,
      netEarned: annualIncomeGoal * yearPct,
    };

    // ── 6. Actual YTD conversion rates ───────────────────────────────────────
    const actualApptHeldToClose = closedUnits > 0 && appointmentsHeldActual > 0
      ? closedUnits / appointmentsHeldActual
      : null;
    const actualContractToClose = closedUnits > 0 && contractsWrittenActual > 0
      ? closedUnits / contractsWrittenActual
      : null;
    const actualApptSetToHeld = appointmentsHeldActual > 0 && appointmentsSetActual > 0
      ? appointmentsHeldActual / appointmentsSetActual
      : null;
    const actualEngToApptSet = appointmentsSetActual > 0 && engagementsActual > 0
      ? appointmentsSetActual / engagementsActual
      : null;
    const actualCallToEng = engagementsActual > 0 && callsActual > 0
      ? engagementsActual / callsActual
      : null;

    // Use actual if available, fall back to plan
    const useApptHeldToClose = actualApptHeldToClose ?? (planApptHeldToContract * planContractToClose);
    const useContractToClose = actualContractToClose ?? planContractToClose;
    const useApptSetToHeld = actualApptSetToHeld ?? planApptSetToHeld;
    const useEngToApptSet = actualEngToApptSet ?? planEngToApptSet;
    const useCallToEng = actualCallToEng ?? planCallToEng;

    // ── 7. Full-year projection at CURRENT PACE ───────────────────────────────
    // Primary driver: appointments held per week (actual pace)
    const actualApptsHeldPerWeek = elapsedWeeks > 0 ? appointmentsHeldActual / elapsedWeeks : 0;
    const projectedFullYearApptsHeld = actualApptsHeldPerWeek * workingWeeksInYear;
    const projectedFullYearClosings = projectedFullYearApptsHeld * useApptHeldToClose;
    const remainingProjectedClosings = Math.max(projectedFullYearClosings - closedUnits, 0);
    const projectedFullYearIncome = netEarned + (remainingProjectedClosings * actualAvgNetPerClosing);

    // Chain back up through the funnel for full projection
    const projectedFullYearContracts = safeDiv(projectedFullYearClosings, useContractToClose);
    const projectedFullYearApptsSet = safeDiv(projectedFullYearApptsHeld, useApptSetToHeld);
    const projectedFullYearEngagements = safeDiv(projectedFullYearApptsSet, useEngToApptSet);
    const projectedFullYearCalls = safeDiv(projectedFullYearEngagements, useCallToEng);

    // ── 8. Pace status ───────────────────────────────────────────────────────
    // Based on appointments held vs on-track
    const paceRatio = onTrack.appointmentsHeld > 0
      ? appointmentsHeldActual / onTrack.appointmentsHeld
      : 1;
    const paceStatus: 'on_track' | 'slightly_behind' | 'behind' =
      paceRatio >= 1.0 ? 'on_track' :
      paceRatio >= 0.85 ? 'slightly_behind' : 'behind';

    // ── 9. CATCH-UP CALCULATOR (recalibrated weekly targets) ─────────────────
    // "What do I need to do each week FROM NOW to still hit my goal?"
    // This is always: (total needed - already done) / weeks remaining
    // NOT the original weekly goal — it increases when you fall behind

    const closingsStillNeeded = Math.max(planTargets.closings - closedUnits, 0);
    const contractsStillNeeded = Math.max(planTargets.contractsWritten - contractsWrittenActual, 0);
    const apptsHeldStillNeeded = Math.max(planTargets.appointmentsHeld - appointmentsHeldActual, 0);
    const apptsSetStillNeeded = Math.max(planTargets.appointmentsSet - appointmentsSetActual, 0);
    const engagementsStillNeeded = Math.max(planTargets.engagements - engagementsActual, 0);
    const callsStillNeeded = Math.max(planTargets.calls - callsActual, 0);

    const catchUpPerWeek = {
      closings: safeDiv(closingsStillNeeded, remainingWeeks),
      contractsWritten: safeDiv(contractsStillNeeded, remainingWeeks),
      appointmentsHeld: safeDiv(apptsHeldStillNeeded, remainingWeeks),
      appointmentsSet: safeDiv(apptsSetStillNeeded, remainingWeeks),
      engagements: safeDiv(engagementsStillNeeded, remainingWeeks),
      calls: safeDiv(callsStillNeeded, remainingWeeks),
    };

    const catchUpPerDay = {
      closings: safeDiv(closingsStillNeeded, remainingWeeks * 5),
      contractsWritten: safeDiv(contractsStillNeeded, remainingWeeks * 5),
      appointmentsHeld: safeDiv(apptsHeldStillNeeded, remainingWeeks * 5),
      appointmentsSet: safeDiv(apptsSetStillNeeded, remainingWeeks * 5),
      engagements: safeDiv(engagementsStillNeeded, remainingWeeks * 5),
      calls: safeDiv(callsStillNeeded, remainingWeeks * 5),
    };

    const incomeStillNeeded = Math.max(annualIncomeGoal - netEarned, 0);

    return NextResponse.json({
      year,
      hasPlan: !planSnap.empty,
      annualIncomeGoal,
      avgNetCommission: actualAvgNetPerClosing,
      workingWeeksInYear,
      workingDaysInYear,
      elapsedWeeks,
      remainingWeeks,
      yearPct,

      planTargets,

      ytdActuals: {
        calls: callsActual,
        engagements: engagementsActual,
        appointmentsSet: appointmentsSetActual,
        appointmentsHeld: appointmentsHeldActual,
        contractsWritten: contractsWrittenActual,
        closings: closedUnits,
        pendingUnits,
        netEarned,
        pendingNetIncome,
        apptsHeldPerWeek: actualApptsHeldPerWeek,
      },

      onTrack,

      paceStatus,
      paceRatio,

      actualConversions: {
        apptHeldToClosing: actualApptHeldToClose,
        contractToClosing: actualContractToClose,
        apptSetToHeld: actualApptSetToHeld,
        engagementToApptSet: actualEngToApptSet,
        callToEngagement: actualCallToEng,
      },

      projection: {
        calls: projectedFullYearCalls,
        engagements: projectedFullYearEngagements,
        appointmentsSet: projectedFullYearApptsSet,
        appointmentsHeld: projectedFullYearApptsHeld,
        contractsWritten: projectedFullYearContracts,
        closings: projectedFullYearClosings,
        income: projectedFullYearIncome,
      },

      catchUp: {
        incomeStillNeeded,
        closingsStillNeeded,
        perWeek: catchUpPerWeek,
        perDay: catchUpPerDay,
        // Deficit: how many behind on each metric vs on-track
        deficit: {
          appointmentsHeld: Math.max(onTrack.appointmentsHeld - appointmentsHeldActual, 0),
          closings: Math.max(onTrack.closings - closedUnits, 0),
          netEarned: Math.max(onTrack.netEarned - netEarned, 0),
        },
      },
    });
  } catch (err) {
    console.error('[/api/projections] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
