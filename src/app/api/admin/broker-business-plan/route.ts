// src/app/api/admin/broker-business-plan/route.ts
// Unified Broker & Recruiting Business Plan API
// Stores everything in brokerBusinessPlans/{year} and syncs to the three
// legacy collections (brokerCommandGoals, brokerKpiGoals, recruitingPlans)
// so existing dashboards continue to work.

import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.match(/^Bearer (.+)$/i)?.[1] ?? null;
}

function jsonError(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function requireAdmin(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

// ── Default assumptions ────────────────────────────────────────────────────
const DEFAULT_ASSUMPTIONS = {
  // Plan mode: 'calendar' | 'rolling_back' | 'rolling_forward' | 'custom'
  planMode: 'calendar',
  planStartDate: '',
  resetStartDate: '',
  customRangeStart: '',
  customRangeEnd: '',

  // Financial assumptions
  netMarginGoal: 1700000,
  companyRetentionPct: 29,          // % of GCI the company keeps
  avgSalePrice: 229449,
  avgCommissionPct: 2.97,           // total GCI % per side
  attritionPct: 15,                 // % of agents lost per year
  avgDealsPerAgentPerMonth: 0.78,

  // Recruiting funnel conversion rates (%)
  conversionRates: {
    callToInterview: 20,
    interviewSetToHeld: 70,
    interviewHeldToOffer: 60,
    offerToCommitted: 80,
    committedToOnboarded: 90,
  },

  // Agent KPI conversion rates (%)
  agentConversionRates: {
    callToEngagement: 20,
    engagementToAppointmentSet: 40,
    appointmentSetToHeld: 75,
    appointmentHeldToContract: 35,
    contractToClosing: 85,
  },

  // Seasonality weights (1-12, each is % of annual)
  seasonWeights: {} as Record<string, { salesPct: string; volumePct: string }>,

  // Recruiting headcount goals
  yearlyActiveAgentsGoal: 85,
  yearlyNewHiresGoal: 20,
  netGainGoal: 5,

  // Production goals (annual)
  annualVolumeGoal: 0,
  annualSalesCountGoal: 0,
  annualGrossMarginGoal: 0,

  // Agent KPI annual goals
  callsGoal: 0,
  engagementsGoal: 0,
  appointmentsSetGoal: 0,
  appointmentsHeldGoal: 0,
  contractsWrittenGoal: 0,
  closingsGoal: 0,
};

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

  try {
    // Load the broker business plan document
    const planRef = adminDb.collection('brokerBusinessPlans').doc(String(year));
    const planSnap = await planRef.get();
    const plan = planSnap.exists ? (planSnap.data() ?? {}) : {};

    // Load live data from recruiting-metrics for reference
    const [recruitingSnap, kpiSnap] = await Promise.all([
      adminDb.collection('recruitingPlans').doc(String(year)).get(),
      adminDb.collection('brokerKpiGoals').doc(String(year)).get(),
    ]);
    const recruitingPlan = recruitingSnap.exists ? (recruitingSnap.data() ?? {}) : {};
    const kpiGoals = kpiSnap.exists ? (kpiSnap.data() ?? {}) : {};

    // Load live transaction stats for the year (for reference boxes)
    const txSnap = await adminDb.collection('transactions')
      .where('year', '==', year)
      .where('status', '==', 'closed')
      .get();

    let totalVolume = 0, totalGCI = 0, totalCompanyRetained = 0;
    let volumeCount = 0, gciCount = 0, retainedCount = 0;

    for (const doc of txSnap.docs) {
      const t = doc.data();
      const sp = t.salePrice || t.salesPrice || t.soldPrice || 0;
      // splitSnapshot.grossCommission is the total GCI before any agent/broker split
      // (splitSnapshot.totalGCI does not exist — that was a field name bug)
      const gci = t.splitSnapshot?.grossCommission || t.grossCommission || 0;
      const retained = t.splitSnapshot?.companyRetained || t.brokerProfit || 0;

      if (sp > 0) { totalVolume += sp; volumeCount++; }
      if (gci > 0) { totalGCI += gci; gciCount++; }
      if (retained > 0) { totalCompanyRetained += retained; retainedCount++; }
    }

    const liveAvgSalePrice = volumeCount > 0 ? totalVolume / volumeCount : null;
    const liveAvgCommissionPct = (volumeCount > 0 && totalVolume > 0)
      ? (totalGCI / totalVolume) * 100 : null;
    const liveAvgCompanyFeePerDeal = retainedCount > 0 ? totalCompanyRetained / retainedCount : null;
    // liveAvgDealsPerAgentPerMonth is computed below, after rosterCount is available

    // Load all-time summary
    const allTimeSnap = await adminDb.collection('brokerAllTimeSummary').doc('summary').get();
    const allTime = allTimeSnap.exists ? allTimeSnap.data() : null;

    // Load agent history for current active count
    const agentHistSnap = await adminDb.collection('agentYearlyActivity')
      .where('year', '==', year).get();
    const rosterCount = agentHistSnap.docs.filter(d => d.data().onRoster).length;
    // Correct formula: total closed deals ÷ 12 months ÷ active agents on roster
    // Previously this always divided by 1 (bug), giving ~29 instead of ~0.7
    const liveAvgDealsPerAgentPerMonth = (txSnap.size > 0 && rosterCount > 0)
      ? txSnap.size / 12 / rosterCount
      : null;

    // Load seasonality
    const seasonSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', year).get();
    const monthlyGoalsFromDB: Record<number, any> = {};
    for (const doc of seasonSnap.docs) {
      const d = doc.data();
      if (d.month && d.segment === 'TOTAL') {
        monthlyGoalsFromDB[d.month] = {
          grossMarginGoal: d.grossMarginGoal ?? null,
          volumeGoal: d.volumeGoal ?? null,
          salesCountGoal: d.salesCountGoal ?? null,
        };
      }
    }

    // Merge defaults ← legacy collections ← broker business plan (most specific wins)
    const merged = {
      ...DEFAULT_ASSUMPTIONS,
      // From legacy recruiting plan
      netMarginGoal: recruitingPlan.netMarginGoal ?? DEFAULT_ASSUMPTIONS.netMarginGoal,
      companyRetentionPct: recruitingPlan.companyRetentionPct ?? DEFAULT_ASSUMPTIONS.companyRetentionPct,
      yearlyActiveAgentsGoal: recruitingPlan.yearlyActiveAgentsGoal ?? DEFAULT_ASSUMPTIONS.yearlyActiveAgentsGoal,
      yearlyNewHiresGoal: recruitingPlan.yearlyNewHiresGoal ?? DEFAULT_ASSUMPTIONS.yearlyNewHiresGoal,
      netGainGoal: recruitingPlan.netGainGoal ?? DEFAULT_ASSUMPTIONS.netGainGoal,
      conversionRates: recruitingPlan.conversionRates
        ? {
            callToInterview: (recruitingPlan.conversionRates.callToInterview ?? 20),
            interviewSetToHeld: (recruitingPlan.conversionRates.interviewSetToHeld ?? 70),
            interviewHeldToOffer: (recruitingPlan.conversionRates.interviewHeldToOffer ?? 60),
            offerToCommitted: (recruitingPlan.conversionRates.offerToCommitted ?? 80),
            committedToOnboarded: (recruitingPlan.conversionRates.committedToOnboarded ?? 90),
          }
        : DEFAULT_ASSUMPTIONS.conversionRates,
      // From legacy KPI goals
      callsGoal: kpiGoals.callsGoal ?? DEFAULT_ASSUMPTIONS.callsGoal,
      engagementsGoal: kpiGoals.engagementsGoal ?? DEFAULT_ASSUMPTIONS.engagementsGoal,
      appointmentsSetGoal: kpiGoals.appointmentsSetGoal ?? DEFAULT_ASSUMPTIONS.appointmentsSetGoal,
      appointmentsHeldGoal: kpiGoals.appointmentsHeldGoal ?? DEFAULT_ASSUMPTIONS.appointmentsHeldGoal,
      contractsWrittenGoal: kpiGoals.contractsWrittenGoal ?? DEFAULT_ASSUMPTIONS.contractsWrittenGoal,
      closingsGoal: kpiGoals.closingsGoal ?? DEFAULT_ASSUMPTIONS.closingsGoal,
      agentConversionRates: {
        callToEngagement: kpiGoals.callToEngagement ?? DEFAULT_ASSUMPTIONS.agentConversionRates.callToEngagement,
        engagementToAppointmentSet: kpiGoals.engagementToAppointmentSet ?? DEFAULT_ASSUMPTIONS.agentConversionRates.engagementToAppointmentSet,
        appointmentSetToHeld: kpiGoals.appointmentSetToHeld ?? DEFAULT_ASSUMPTIONS.agentConversionRates.appointmentSetToHeld,
        appointmentHeldToContract: kpiGoals.appointmentHeldToContract ?? DEFAULT_ASSUMPTIONS.agentConversionRates.appointmentHeldToContract,
        contractToClosing: kpiGoals.contractToClosing ?? DEFAULT_ASSUMPTIONS.agentConversionRates.contractToClosing,
      },
      // Override with broker business plan (most specific)
      ...plan,
    };

    return NextResponse.json({
      ok: true,
      year,
      plan: merged,
      monthlyGoals: monthlyGoalsFromDB,
      liveData: {
        avgSalePrice: liveAvgSalePrice,
        avgCommissionPct: liveAvgCommissionPct,
        avgCompanyFeePerDeal: liveAvgCompanyFeePerDeal,
        avgDealsPerAgentPerMonth: liveAvgDealsPerAgentPerMonth,
        closedTransactions: txSnap.size,
        totalVolume,
        totalGCI,
      },
      allTime,
      currentActiveAgents: rosterCount,
    });
  } catch (err: any) {
    console.error('[api/admin/broker-business-plan GET]', err);
    return jsonError(500, err.message);
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const year = parseInt(body.year || String(new Date().getFullYear()), 10);

    const {
      // Plan mode
      planMode, planStartDate, resetStartDate, customRangeStart, customRangeEnd,
      // Financial
      netMarginGoal, companyRetentionPct, avgSalePrice, avgCommissionPct,
      attritionPct, avgDealsPerAgentPerMonth,
      // Recruiting funnel
      conversionRates,
      // Agent KPI
      agentConversionRates,
      callsGoal, engagementsGoal, appointmentsSetGoal,
      appointmentsHeldGoal, contractsWrittenGoal, closingsGoal,
      // Headcount
      yearlyActiveAgentsGoal, yearlyNewHiresGoal, netGainGoal,
      // Production
      annualVolumeGoal, annualSalesCountGoal, annualGrossMarginGoal,
      // Monthly goals + seasonality
      monthlyGoals, seasonWeights,
    } = body;

    const ts = admin.firestore.FieldValue.serverTimestamp();
    const batch = adminDb.batch();

    // ── 1. Write to brokerBusinessPlans/{year} ────────────────────────────
    const planData: Record<string, any> = { updatedAt: ts, updatedBy: decoded.uid, year };
    const fields: Record<string, any> = {
      planMode, planStartDate, resetStartDate, customRangeStart, customRangeEnd,
      netMarginGoal, companyRetentionPct, avgSalePrice, avgCommissionPct,
      attritionPct, avgDealsPerAgentPerMonth,
      conversionRates, agentConversionRates,
      callsGoal, engagementsGoal, appointmentsSetGoal,
      appointmentsHeldGoal, contractsWrittenGoal, closingsGoal,
      yearlyActiveAgentsGoal, yearlyNewHiresGoal, netGainGoal,
      annualVolumeGoal, annualSalesCountGoal, annualGrossMarginGoal,
      seasonWeights,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) planData[k] = v;
    }
    const planRef = adminDb.collection('brokerBusinessPlans').doc(String(year));
    batch.set(planRef, planData, { merge: true });

    // ── 2. Sync monthly goals → brokerCommandGoals ────────────────────────
    if (monthlyGoals && typeof monthlyGoals === 'object') {
      for (const [monthStr, goals] of Object.entries(monthlyGoals as Record<string, any>)) {
        const month = parseInt(monthStr, 10);
        if (month < 1 || month > 12) continue;
        const docId = `${year}-${String(month).padStart(2, '0')}-TOTAL`;
        const docRef = adminDb.collection('brokerCommandGoals').doc(docId);
        batch.set(docRef, {
          year,
          month,
          segment: 'TOTAL',
          grossMarginGoal: goals.grossMarginGoal ?? null,
          volumeGoal: goals.volumeGoal ?? null,
          salesCountGoal: goals.salesCountGoal ?? null,
          activeAgentsGoal: goals.activeAgentsGoal ?? null,
          updatedAt: new Date().toISOString(),
          updatedBy: decoded.uid,
        }, { merge: true });
      }
    }

    // ── 3. Sync KPI goals → brokerKpiGoals ───────────────────────────────
    const kpiData: Record<string, any> = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    const kpiFields = ['callsGoal','engagementsGoal','appointmentsSetGoal',
      'appointmentsHeldGoal','contractsWrittenGoal','closingsGoal'];
    for (const k of kpiFields) {
      if (body[k] != null) kpiData[k] = Number(body[k]) || null;
    }
    if (agentConversionRates) {
      kpiData.callToEngagement = agentConversionRates.callToEngagement ?? null;
      kpiData.engagementToAppointmentSet = agentConversionRates.engagementToAppointmentSet ?? null;
      kpiData.appointmentSetToHeld = agentConversionRates.appointmentSetToHeld ?? null;
      kpiData.appointmentHeldToContract = agentConversionRates.appointmentHeldToContract ?? null;
      kpiData.contractToClosing = agentConversionRates.contractToClosing ?? null;
    }
    if (seasonWeights) kpiData.seasonWeights = seasonWeights;
    if (avgSalePrice != null) kpiData.goalAvgSalePrice = Number(avgSalePrice);
    if (avgCommissionPct != null) kpiData.goalAvgCommissionPct = Number(avgCommissionPct);
    batch.set(adminDb.collection('brokerKpiGoals').doc(String(year)), kpiData, { merge: true });

    // ── 4. Sync recruiting goals → recruitingPlans ───────────────────────
    const recData: Record<string, any> = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
    if (netMarginGoal != null) recData.netMarginGoal = Number(netMarginGoal);
    if (companyRetentionPct != null) recData.companyRetentionPct = Number(companyRetentionPct);
    if (yearlyActiveAgentsGoal != null) recData.yearlyActiveAgentsGoal = Number(yearlyActiveAgentsGoal);
    if (yearlyNewHiresGoal != null) recData.yearlyNewHiresGoal = Number(yearlyNewHiresGoal);
    if (netGainGoal != null) recData.netGainGoal = Number(netGainGoal);
    if (conversionRates) recData.conversionRates = conversionRates;
    if (avgSalePrice != null) recData.avgSalePriceOverride = Number(avgSalePrice);
    if (avgCommissionPct != null) recData.avgCommissionPctOverride = Number(avgCommissionPct);
    if (attritionPct != null) recData.attritionPct = Number(attritionPct);
    if (avgDealsPerAgentPerMonth != null) recData.avgDealsPerAgentPerMonthOverride = Number(avgDealsPerAgentPerMonth);
    batch.set(adminDb.collection('recruitingPlans').doc(String(year)), recData, { merge: true });

    await batch.commit();
    return NextResponse.json({ ok: true, year });
  } catch (err: any) {
    console.error('[api/admin/broker-business-plan POST]', err);
    return jsonError(500, err.message);
  }
}
