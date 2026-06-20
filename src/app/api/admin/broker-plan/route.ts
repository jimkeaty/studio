// /api/admin/broker-plan
// Unified GET/POST for the Broker Business Plan.
// Reads from and writes to all three goal collections:
//   brokerCommandGoals/{year-month-TOTAL}  — monthly production goals
//   brokerKpiGoals/{year}                  — agent KPI activity goals
//   recruitingPlans/{year}                 — recruiting goals & assumptions
// Also reads live transaction data for reference (avg sale price, avg commission %, avg gross margin %)

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

// ── GET /api/admin/broker-plan?year=2026 ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const prevYear = year - 1;

    // ── Fetch all data sources in parallel ──────────────────────────────────
    const [
      kpiGoalsSnap,
      recruitingPlanSnap,
      monthlyGoalsSnap,
      prevKpiGoalsSnap,
      prevRecruitingPlanSnap,
      prevMonthlyGoalsSnap,
    ] = await Promise.all([
      adminDb.collection('brokerKpiGoals').doc(String(year)).get(),
      adminDb.collection('recruitingPlans').doc(String(year)).get(),
      adminDb.collection('brokerCommandGoals')
        .where('year', '==', year)
        .where('segment', '==', 'TOTAL')
        .orderBy('month', 'asc')
        .get(),
      adminDb.collection('brokerKpiGoals').doc(String(prevYear)).get(),
      adminDb.collection('recruitingPlans').doc(String(prevYear)).get(),
      adminDb.collection('brokerCommandGoals')
        .where('year', '==', prevYear)
        .where('segment', '==', 'TOTAL')
        .orderBy('month', 'asc')
        .get(),
    ]);

    const kpiGoals = kpiGoalsSnap.exists ? kpiGoalsSnap.data()! : {};
    const recruitingPlan = recruitingPlanSnap.exists ? recruitingPlanSnap.data()! : {};

    // Build monthly production goals map
    const monthlyGoals: Record<number, { grossMarginGoal: number | null; volumeGoal: number | null; salesCountGoal: number | null }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyGoals[m] = { grossMarginGoal: null, volumeGoal: null, salesCountGoal: null };
    }
    monthlyGoalsSnap.docs.forEach(d => {
      const data = d.data();
      monthlyGoals[data.month] = {
        grossMarginGoal: data.grossMarginGoal ?? null,
        volumeGoal: data.volumeGoal ?? null,
        salesCountGoal: data.salesCountGoal ?? null,
      };
    });

    // Compute yearly totals from monthly goals
    const yearlyVolumeGoal = Object.values(monthlyGoals).reduce((s, m) => s + (m.volumeGoal ?? 0), 0);
    const yearlyMarginGoal = Object.values(monthlyGoals).reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0);
    const yearlySalesCountGoal = Object.values(monthlyGoals).reduce((s, m) => s + (m.salesCountGoal ?? 0), 0);

    // ── Previous year actuals for reference ──────────────────────────────────
    const prevKpiGoals = prevKpiGoalsSnap.exists ? prevKpiGoalsSnap.data()! : {};
    const prevRecruitingPlan = prevRecruitingPlanSnap.exists ? prevRecruitingPlanSnap.data()! : {};
    const prevMonthlyGoals: Record<number, any> = {};
    prevMonthlyGoalsSnap.docs.forEach(d => {
      const data = d.data();
      prevMonthlyGoals[data.month] = data;
    });
    const prevYearlyVolumeGoal = Object.values(prevMonthlyGoals).reduce((s: number, m: any) => s + (m.volumeGoal ?? 0), 0);
    const prevYearlyMarginGoal = Object.values(prevMonthlyGoals).reduce((s: number, m: any) => s + (m.grossMarginGoal ?? 0), 0);
    const prevYearlySalesGoal = Object.values(prevMonthlyGoals).reduce((s: number, m: any) => s + (m.salesCountGoal ?? 0), 0);

    // ── Live transaction data for reference ──────────────────────────────────
    // Get last year's closed transactions for avg sale price, commission %, margin %
    const txSnap = await adminDb.collection('transactions')
      .where('status', '==', 'Closed')
      .where('closeYear', '==', prevYear)
      .get();

    let totalVolume = 0, totalGCI = 0, totalCompanyRetained = 0, txCount = 0;
    txSnap.docs.forEach(d => {
      const tx = d.data();
      const vol = tx.salePrice ?? tx.listPrice ?? 0;
      const gci = tx.splitSnapshot?.totalGCI ?? tx.gciAmount ?? 0;
      const retained = tx.splitSnapshot?.companyRetained ?? tx.splitSnapshot?.brokerProfit ?? 0;
      if (vol > 0) { totalVolume += vol; txCount++; }
      totalGCI += gci;
      totalCompanyRetained += retained;
    });

    const liveReference = txCount > 0 ? {
      year: prevYear,
      avgSalePrice: Math.round(totalVolume / txCount),
      avgCommissionPct: totalVolume > 0 ? parseFloat(((totalGCI / totalVolume) * 100).toFixed(2)) : null,
      avgGrossMarginPct: totalGCI > 0 ? parseFloat(((totalCompanyRetained / totalGCI) * 100).toFixed(1)) : null,
      avgCompanyFeePerDeal: txCount > 0 ? Math.round(totalCompanyRetained / txCount) : null,
      totalDeals: txCount,
      totalVolume,
      totalGCI,
      totalCompanyRetained,
    } : null;

    // ── Compose unified plan response ────────────────────────────────────────
    const plan = {
      year,
      // Production goals
      yearlyVolumeGoal: yearlyVolumeGoal || null,
      yearlyMarginGoal: yearlyMarginGoal || null,
      yearlySalesCountGoal: yearlySalesCountGoal || null,
      monthlyGoals,
      // Agent KPI activity goals
      callsGoal: kpiGoals.callsGoal ?? null,
      engagementsGoal: kpiGoals.engagementsGoal ?? null,
      appointmentsSetGoal: kpiGoals.appointmentsSetGoal ?? null,
      appointmentsHeldGoal: kpiGoals.appointmentsHeldGoal ?? null,
      contractsWrittenGoal: kpiGoals.contractsWrittenGoal ?? null,
      closingsGoal: kpiGoals.closingsGoal ?? null,
      // Recruiting goals
      yearlyNewHiresGoal: recruitingPlan.yearlyNewHiresGoal ?? null,
      yearlyActiveAgentsGoal: recruitingPlan.yearlyActiveAgentsGoal ?? null,
      netGainGoal: recruitingPlan.netGainGoal ?? null,
      // Company financial assumptions
      netMarginGoal: recruitingPlan.netMarginGoal ?? null,
      companyRetentionPct: recruitingPlan.companyRetentionPct ?? 0.29,
      avgCompanyFeePerDealOverride: recruitingPlan.avgCompanyFeePerDealOverride ?? null,
      // Recruiting funnel conversion rates
      conversionRates: recruitingPlan.conversionRates ?? {
        callToInterview: 0.20,
        interviewSetToHeld: 0.70,
        interviewToOffer: 0.50,
        offerToCommit: 0.60,
        commitToOnboard: 0.85,
        expectedAttritionPct: 0.15,
      },
      // Agent KPI conversion rates (from kpiGoals if stored, else defaults)
      agentConversionRates: {
        callToEngagement: kpiGoals.callToEngagement ?? 0.10,
        engagementToAppointmentSet: kpiGoals.engagementToAppointmentSet ?? 0.50,
        appointmentSetToHeld: kpiGoals.appointmentSetToHeld ?? 0.80,
        appointmentHeldToContract: kpiGoals.appointmentHeldToContract ?? 0.50,
        contractToClosing: kpiGoals.contractToClosing ?? 0.90,
      },
      // Target averages (for auto-calculation)
      goalAvgSalePrice: kpiGoals.goalAvgSalePrice ?? liveReference?.avgSalePrice ?? null,
      goalAvgCommissionPct: kpiGoals.goalAvgCommissionPct ?? liveReference?.avgCommissionPct ?? null,
      goalAvgMarginPct: kpiGoals.goalAvgMarginPct ?? liveReference?.avgGrossMarginPct ?? null,
      // Seasonality weights (stored in kpiGoals for simplicity)
      seasonWeights: kpiGoals.seasonWeights ?? null,
    };

    // Previous year reference
    const prevPlan = {
      year: prevYear,
      yearlyVolumeGoal: prevYearlyVolumeGoal || null,
      yearlyMarginGoal: prevYearlyMarginGoal || null,
      yearlySalesCountGoal: prevYearlySalesGoal || null,
      yearlyNewHiresGoal: prevRecruitingPlan.yearlyNewHiresGoal ?? null,
      yearlyActiveAgentsGoal: prevRecruitingPlan.yearlyActiveAgentsGoal ?? null,
      callsGoal: prevKpiGoals.callsGoal ?? null,
      closingsGoal: prevKpiGoals.closingsGoal ?? null,
    };

    return NextResponse.json({ ok: true, plan, prevPlan, liveReference });
  } catch (err: any) {
    console.error('[api/admin/broker-plan GET]', err);
    return jsonError(500, err.message);
  }
}

// ── POST /api/admin/broker-plan ──────────────────────────────────────────────
// Accepts the full unified plan and writes to all three collections atomically.
export async function POST(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const {
      year,
      // Production
      monthlyGoals,          // Record<number, { grossMarginGoal, volumeGoal, salesCountGoal }>
      goalAvgSalePrice,
      goalAvgCommissionPct,
      goalAvgMarginPct,
      seasonWeights,
      // Agent KPI activity goals
      callsGoal, engagementsGoal, appointmentsSetGoal,
      appointmentsHeldGoal, contractsWrittenGoal, closingsGoal,
      // Agent KPI conversion rates
      agentConversionRates,
      // Recruiting goals
      yearlyNewHiresGoal, yearlyActiveAgentsGoal, netGainGoal,
      // Company financial assumptions
      netMarginGoal, companyRetentionPct, avgCompanyFeePerDealOverride,
      // Recruiting funnel conversion rates
      conversionRates,
    } = body;

    const y = parseInt(year || String(new Date().getFullYear()), 10);
    const batch = adminDb.batch();

    // ── 1. Save monthly production goals ─────────────────────────────────────
    if (monthlyGoals && typeof monthlyGoals === 'object') {
      for (const [monthStr, goals] of Object.entries(monthlyGoals as Record<string, any>)) {
        const month = parseInt(monthStr, 10);
        if (month < 1 || month > 12) continue;
        const docId = `${y}-${String(month).padStart(2, '0')}-TOTAL`;
        const docRef = adminDb.collection('brokerCommandGoals').doc(docId);
        batch.set(docRef, {
          year: y,
          month,
          segment: 'TOTAL',
          grossMarginGoal: goals.grossMarginGoal ?? null,
          volumeGoal: goals.volumeGoal ?? null,
          salesCountGoal: goals.salesCountGoal ?? null,
          updatedAt: new Date().toISOString(),
          updatedBy: decoded.uid,
        }, { merge: true });
      }
    }

    // ── 2. Save KPI goals + target averages + seasonality ────────────────────
    const kpiData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
    };
    const kpiFields = [
      'callsGoal', 'engagementsGoal', 'appointmentsSetGoal',
      'appointmentsHeldGoal', 'contractsWrittenGoal', 'closingsGoal',
    ];
    for (const key of kpiFields) {
      if (key in body) kpiData[key] = body[key] != null && body[key] !== '' ? Number(body[key]) : null;
    }
    if (goalAvgSalePrice != null) kpiData.goalAvgSalePrice = Number(goalAvgSalePrice);
    if (goalAvgCommissionPct != null) kpiData.goalAvgCommissionPct = Number(goalAvgCommissionPct);
    if (goalAvgMarginPct != null) kpiData.goalAvgMarginPct = Number(goalAvgMarginPct);
    if (seasonWeights != null) kpiData.seasonWeights = seasonWeights;
    if (agentConversionRates != null) {
      kpiData.callToEngagement = agentConversionRates.callToEngagement ?? null;
      kpiData.engagementToAppointmentSet = agentConversionRates.engagementToAppointmentSet ?? null;
      kpiData.appointmentSetToHeld = agentConversionRates.appointmentSetToHeld ?? null;
      kpiData.appointmentHeldToContract = agentConversionRates.appointmentHeldToContract ?? null;
      kpiData.contractToClosing = agentConversionRates.contractToClosing ?? null;
    }
    const kpiRef = adminDb.collection('brokerKpiGoals').doc(String(y));
    batch.set(kpiRef, kpiData, { merge: true });

    // ── 3. Save recruiting plan ───────────────────────────────────────────────
    const recruitingData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
    };
    if (yearlyNewHiresGoal != null) recruitingData.yearlyNewHiresGoal = Number(yearlyNewHiresGoal) || null;
    if (yearlyActiveAgentsGoal != null) recruitingData.yearlyActiveAgentsGoal = Number(yearlyActiveAgentsGoal) || null;
    if (netGainGoal != null) recruitingData.netGainGoal = Number(netGainGoal) || null;
    if (netMarginGoal != null) recruitingData.netMarginGoal = Number(netMarginGoal) || null;
    if (companyRetentionPct != null) recruitingData.companyRetentionPct = Number(companyRetentionPct);
    if (avgCompanyFeePerDealOverride != null) recruitingData.avgCompanyFeePerDealOverride = Number(avgCompanyFeePerDealOverride) || null;
    if (conversionRates != null) recruitingData.conversionRates = conversionRates;
    const recruitingRef = adminDb.collection('recruitingPlans').doc(String(y));
    batch.set(recruitingRef, recruitingData, { merge: true });

    await batch.commit();

    return NextResponse.json({ ok: true, year: y });
  } catch (err: any) {
    console.error('[api/admin/broker-plan POST]', err);
    return jsonError(500, err.message);
  }
}
