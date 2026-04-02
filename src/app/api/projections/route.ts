import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function countWeekdays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function safeDivide(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
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

    // Admin impersonation
    if (viewAs) {
      const callerIsAdmin = await isAdminLike(decoded.uid);
      if (!callerIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      uid = viewAs;
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const now = new Date();
    const asOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    // ── 1. Load Business Plan ────────────────────────────────────────────────
    const planSnap = await adminDb
      .collection('businessPlans')
      .where('userId', '==', uid)
      .where('year', '==', year)
      .limit(1)
      .get();

    const plan = planSnap.empty ? null : planSnap.docs[0].data();

    const annualIncomeGoal = asNumber(plan?.annualIncomeGoal, 100000);
    const workingDaysPerMonth = asNumber(plan?.assumptions?.workingDaysPerMonth, 21);
    const weeksOff = asNumber(plan?.assumptions?.weeksOff, 2);
    const totalWorkdaysInYear = Math.max(1, workingDaysPerMonth * 12 - weeksOff * 5);
    const avgCommission = asNumber(plan?.assumptions?.avgCommission, 5000);

    // Plan conversion rates (fallback to typical industry rates)
    const planConv = plan?.assumptions?.conversionRates ?? {};
    const planCallToEngagement = asNumber(planConv.callToEngagement, 0.1);
    const planEngToApptSet = asNumber(planConv.engagementToAppointmentSet, 0.1);
    const planApptSetToHeld = asNumber(planConv.appointmentSetToHeld, 0.9);
    const planApptHeldToContract = asNumber(planConv.appointmentHeldToContract, 0.2);
    const planContractToClosing = asNumber(planConv.contractToClosing, 0.8);

    // Plan annual targets
    const planTargets = {
      calls: asNumber(plan?.calculatedTargets?.calls?.yearly),
      engagements: asNumber(plan?.calculatedTargets?.engagements?.yearly),
      appointmentsSet: asNumber(plan?.calculatedTargets?.appointmentsSet?.yearly),
      appointmentsHeld: asNumber(plan?.calculatedTargets?.appointmentsHeld?.yearly),
      contractsWritten: asNumber(plan?.calculatedTargets?.contractsWritten?.yearly),
      closings: asNumber(plan?.calculatedTargets?.closings?.yearly),
    };

    // Effective start date
    const rawStart = plan?.resetStartDate ?? plan?.planStartDate ?? `${year}-01-01`;
    const [sy, sm, sd] = rawStart.split('-').map(Number);
    const planStart = new Date(Date.UTC(sy, sm - 1, sd));
    const effectiveStart = planStart < yearStart ? yearStart : planStart;

    // ── 2. Load YTD Daily Logs ───────────────────────────────────────────────
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
      const logYear = logDate.getUTCFullYear();
      if (logYear !== year) continue;
      callsActual += asNumber(d.callsCount);
      engagementsActual += asNumber(d.engagementsCount);
      appointmentsSetActual += asNumber(d.appointmentsSetCount);
      appointmentsHeldActual += asNumber(d.appointmentsHeldCount);
      contractsWrittenActual += asNumber(d.contractsWrittenCount);
    }

    // ── 3. Load YTD Transactions ─────────────────────────────────────────────
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
      const status = tx.status ?? '';
      const net = asNumber(tx.splitSnapshot?.agentNetCommission ?? tx.commission);
      if (['closed', 'sold'].includes(status)) {
        netEarned += net;
        closedUnits += 1;
      } else if (['pending', 'under_contract', 'active'].includes(status)) {
        pendingNetIncome += net;
        pendingUnits += 1;
      }
    }

    // ── 4. Time calculations ─────────────────────────────────────────────────
    const elapsedWorkdays = asOf < effectiveStart ? 0 : countWeekdays(effectiveStart, asOf);
    const remainingWorkdays = asOf > yearEnd ? 0 : countWeekdays(asOf, yearEnd);
    const weeksRemaining = remainingWorkdays / 5;
    const monthsRemaining = Math.max(0, 12 - (asOf.getUTCMonth() + 1));

    // ── 5. Actual conversion rates (YTD) ─────────────────────────────────────
    const actualCallToEngagement = safeDivide(engagementsActual, callsActual);
    const actualEngToApptSet = safeDivide(appointmentsSetActual, engagementsActual);
    const actualApptSetToHeld = safeDivide(appointmentsHeldActual, appointmentsSetActual);
    const actualApptHeldToContract = safeDivide(contractsWrittenActual, appointmentsHeldActual);
    const actualContractToClosing = safeDivide(closedUnits, contractsWrittenActual);

    // Use actual conversion rates if available, fall back to plan rates
    const useCallToEng = actualCallToEngagement ?? planCallToEngagement;
    const useEngToAppt = actualEngToApptSet ?? planEngToApptSet;
    const useApptToHeld = actualApptSetToHeld ?? planApptSetToHeld;
    const useHeldToContract = actualApptHeldToContract ?? planApptHeldToContract;
    const useContractToClose = actualContractToClosing ?? planContractToClosing;

    // ── 6. Full-year projection using ACTUAL pace ─────────────────────────────
    // Project calls for the full year based on YTD daily rate
    const dailyCallRate = elapsedWorkdays > 0 ? callsActual / elapsedWorkdays : 0;
    const projectedFullYearCalls = dailyCallRate * totalWorkdaysInYear;

    // Chain through actual conversion rates
    const projectedFullYearEngagements = projectedFullYearCalls * useCallToEng;
    const projectedFullYearApptsSet = projectedFullYearEngagements * useEngToAppt;
    const projectedFullYearApptsHeld = projectedFullYearApptsSet * useApptToHeld;
    const projectedFullYearContracts = projectedFullYearApptsHeld * useHeldToContract;
    const projectedFullYearClosings = projectedFullYearContracts * useContractToClose;

    // Avg net per closing: use actual if we have closings, otherwise use plan avgCommission
    const avgNetPerClosing = closedUnits > 0 ? netEarned / closedUnits : avgCommission;

    // Full-year projected income = YTD actual + projected remaining closings × avg net
    const remainingProjectedClosings = Math.max(projectedFullYearClosings - closedUnits, 0);
    const projectedFullYearIncome = netEarned + (remainingProjectedClosings * avgNetPerClosing);

    // ── 7. Catch-up calculator ────────────────────────────────────────────────
    const incomeLeftToGo = Math.max(annualIncomeGoal - netEarned, 0);
    const closingsNeededForGoal = avgNetPerClosing > 0 ? Math.ceil(incomeLeftToGo / avgNetPerClosing) : 0;

    const contractsNeeded = useContractToClose > 0 ? Math.ceil(closingsNeededForGoal / useContractToClose) : 0;
    const apptsHeldNeeded = useHeldToContract > 0 ? Math.ceil(contractsNeeded / useHeldToContract) : 0;
    const apptsSetNeeded = useApptToHeld > 0 ? Math.ceil(apptsHeldNeeded / useApptToHeld) : 0;
    const engagementsNeeded = useEngToAppt > 0 ? Math.ceil(apptsSetNeeded / useEngToAppt) : 0;
    const callsNeeded = useCallToEng > 0 ? Math.ceil(engagementsNeeded / useCallToEng) : 0;

    const makeRate = (total: number, done: number) => {
      const remaining = Math.max(total - done, 0);
      return {
        remaining,
        perDay: remainingWorkdays > 0 ? remaining / remainingWorkdays : 0,
        perWeek: weeksRemaining > 0 ? remaining / weeksRemaining : 0,
        perMonth: monthsRemaining > 0 ? remaining / monthsRemaining : 0,
      };
    };

    return NextResponse.json({
      year,
      annualIncomeGoal,
      avgNetPerClosing,
      totalWorkdaysInYear,
      elapsedWorkdays,
      remainingWorkdays,
      weeksRemaining,
      monthsRemaining,
      yearPct: totalWorkdaysInYear > 0 ? elapsedWorkdays / totalWorkdaysInYear : 0,
      hasPlan: !planSnap.empty,

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
      },

      planTargets,

      actualConversions: {
        callToEngagement: actualCallToEngagement,
        engagementToAppointmentSet: actualEngToApptSet,
        appointmentSetToHeld: actualApptSetToHeld,
        appointmentHeldToContract: actualApptHeldToContract,
        contractToClosing: actualContractToClosing,
      },

      planConversions: {
        callToEngagement: planCallToEngagement,
        engagementToAppointmentSet: planEngToApptSet,
        appointmentSetToHeld: planApptSetToHeld,
        appointmentHeldToContract: planApptHeldToContract,
        contractToClosing: planContractToClosing,
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
        incomeLeftToGo,
        closingsNeeded: Math.max(closingsNeededForGoal - closedUnits, 0),
        metrics: {
          closings: makeRate(closingsNeededForGoal, closedUnits),
          contractsWritten: makeRate(contractsNeeded, contractsWrittenActual),
          appointmentsHeld: makeRate(apptsHeldNeeded, appointmentsHeldActual),
          appointmentsSet: makeRate(apptsSetNeeded, appointmentsSetActual),
          engagements: makeRate(engagementsNeeded, engagementsActual),
          calls: makeRate(callsNeeded, callsActual),
        },
      },
    });
  } catch (err) {
    console.error('[/api/projections] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
