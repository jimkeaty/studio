// GET + POST /api/broker/recruiting-metrics
// GET: returns 12-month recruiting data, pipeline, and agent activity
// POST: save monthly recruiting tracking data
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { format } from 'date-fns';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function requireAuth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try { return await adminAuth.verifyIdToken(h.slice(7)); } catch { return null; }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');
    // Allow admin + team leaders
    // For now, just require admin
    if (decoded.uid !== ADMIN_UID) {
      // Check if team leader
      const profileSnap = await adminDb.collection('agentProfiles')
        .where('agentId', '==', decoded.uid).limit(1).get();
      if (profileSnap.empty || profileSnap.docs[0].data().teamRole !== 'leader') {
        return jsonError(403, 'Admin or team leader required');
      }
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const compareYearParam = searchParams.get('compareYear');
    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : null;

    // 1. Fetch recruiting tracking data for year
    const trackingSnap = await adminDb.collection('recruitingTracking')
      .where('year', '==', year).orderBy('month', 'asc').get();
    const trackingMap = new Map<number, any>();
    trackingSnap.docs.forEach(d => {
      const data = d.data();
      trackingMap.set(data.month, { id: d.id, ...data });
    });

    // Comparison year tracking
    let compareTrackingMap = new Map<number, any>();
    if (compareYear) {
      const compSnap = await adminDb.collection('recruitingTracking')
        .where('year', '==', compareYear).orderBy('month', 'asc').get();
      compSnap.docs.forEach(d => {
        const data = d.data();
        compareTrackingMap.set(data.month, data);
      });
    }

    // 2. Fetch recruiting goals
    const goalsSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', year).where('segment', '==', 'RECRUITING').get();
    const goalsMap = new Map<number, any>();
    goalsSnap.docs.forEach(d => {
      const g = d.data();
      goalsMap.set(g.month, g);
    });

    // 3. Fetch recruiting plan/assumptions
    const planRef = adminDb.collection('recruitingPlans').doc(String(year));
    const planSnap = await planRef.get();
    const plan = planSnap.exists ? planSnap.data() : null;

    // 4. Get transaction counts per month for deals-per-agent calc
    const txSnap = await adminDb.collection('transactions')
      .where('year', '==', year).where('status', '==', 'closed').get();

    const monthlyDeals: number[] = new Array(12).fill(0);
    txSnap.docs.forEach(d => {
      const t = d.data();
      if (t.closedDate) {
        let closedDate: Date | null = null;
        if (typeof (t.closedDate as any).toDate === 'function') {
          closedDate = (t.closedDate as any).toDate();
        } else if (typeof t.closedDate === 'string') {
          const parsed = new Date(t.closedDate);
          if (!isNaN(parsed.getTime())) closedDate = parsed;
        }
        if (closedDate && closedDate.getFullYear() === year) {
          monthlyDeals[closedDate.getMonth()] += 1;
        }
      }
    });

    // 5. Get available years
    const yearsSnap = await adminDb.collection('recruitingTracking').select('year').get();
    const availableYears = [...new Set(yearsSnap.docs.map(d => d.data().year as number))]
      .filter(y => y !== year).sort((a, b) => b - a);

    // 6. Build 12-month response
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const tracking = trackingMap.get(m) || {};
      const goals = goalsMap.get(m) || {};
      const compareTracking = compareTrackingMap.get(m) || {};

      const activeAgents = tracking.activeAgents ?? 0;
      const deals = monthlyDeals[i];
      const dealsPerAgent = activeAgents > 0 ? Math.round((deals / activeAgents) * 100) / 100 : 0;

      return {
        month: m,
        label: format(new Date(2000, i), 'MMM'),
        // Current year actuals
        activeAgents,
        newHires: tracking.newHires ?? 0,
        departures: tracking.departures ?? 0,
        inTraining: tracking.inTraining ?? 0,
        committed: tracking.committed ?? 0,
        interviewsHeld: tracking.interviewsHeld ?? 0,
        interviewsSet: tracking.interviewsSet ?? 0,
        prospectCalls: tracking.prospectCalls ?? 0,
        hotProspects: tracking.hotProspects ?? 0,
        nurtureProspects: tracking.nurtureProspects ?? 0,
        watchProspects: tracking.watchProspects ?? 0,
        // Calculated
        closedDeals: deals,
        dealsPerAgent,
        // Goals
        activeAgentsGoal: goals.salesCountGoal ?? null, // reuse salesCountGoal for agent count
        newHiresGoal: goals.grossMarginGoal ?? null,    // reuse grossMarginGoal for new hires
        // Comparison year
        compareActiveAgents: compareTracking.activeAgents ?? null,
        compareNewHires: compareTracking.newHires ?? null,
        compareDealsPerAgent: compareTracking.activeAgents > 0
          ? Math.round(((compareTracking.closedDeals ?? 0) / compareTracking.activeAgents) * 100) / 100
          : null,
      };
    });

    // 7. Yearly totals
    const totalActiveAgents = months.length > 0 ? months[months.length - 1].activeAgents : 0; // latest month
    const totalNewHires = months.reduce((s, m) => s + m.newHires, 0);
    const totalDepartures = months.reduce((s, m) => s + m.departures, 0);
    const totalDeals = months.reduce((s, m) => s + m.closedDeals, 0);
    const avgDealsPerAgent = totalActiveAgents > 0 ? Math.round((totalDeals / totalActiveAgents) * 100) / 100 : 0;
    const totalInterviews = months.reduce((s, m) => s + m.interviewsHeld, 0);
    const totalProspectCalls = months.reduce((s, m) => s + m.prospectCalls, 0);

    // 8. Recruiting funnel calculations (like business plan)
    const conversionRates = plan?.conversionRates || {
      callToInterview: 0.20,      // 20% of calls → interview set
      interviewSetToHeld: 0.70,   // 70% of set → actually held
      interviewToOffer: 0.50,     // 50% of interviews → offer
      offerToCommit: 0.60,        // 60% of offers → committed
      commitToOnboard: 0.85,      // 85% of committed → onboarded
      expectedAttritionPct: 0.15, // 15% of agents leave per year
    };

    const yearlyNewHiresGoal = plan?.yearlyNewHiresGoal ?? null;
    const yearlyActiveAgentsGoal = plan?.yearlyActiveAgentsGoal ?? null;

    // Reverse-calculate from goal
    let funnelTargets = null;
    if (yearlyNewHiresGoal && yearlyNewHiresGoal > 0) {
      const { callToInterview, interviewSetToHeld, interviewToOffer, offerToCommit, commitToOnboard } = conversionRates;
      const onboarded = yearlyNewHiresGoal;
      const committed = Math.ceil(onboarded / commitToOnboard);
      const offers = Math.ceil(committed / offerToCommit);
      const interviewsHeld = Math.ceil(offers / interviewToOffer);
      const interviewsSet = Math.ceil(interviewsHeld / interviewSetToHeld);
      const calls = Math.ceil(interviewsSet / callToInterview);

      funnelTargets = {
        yearly: { calls, interviewsSet, interviewsHeld, offers, committed, onboarded },
        monthly: {
          calls: Math.ceil(calls / 12),
          interviewsSet: Math.ceil(interviewsSet / 12),
          interviewsHeld: Math.ceil(interviewsHeld / 12),
          offers: Math.ceil(offers / 12),
          committed: Math.ceil(committed / 12),
          onboarded: Math.ceil(onboarded / 12),
        },
        weekly: {
          calls: Math.ceil(calls / 50), // 50 working weeks
          interviewsSet: Math.ceil(interviewsSet / 50),
          interviewsHeld: Math.ceil(interviewsHeld / 50),
        },
      };
    }

    // Grade each lead indicator
    const grades: Record<string, { actual: number; goal: number; pct: number; grade: string }> = {};
    if (funnelTargets) {
      const calcGrade = (actual: number, goal: number) => {
        const pct = goal > 0 ? Math.round((actual / goal) * 100) : 0;
        let grade = 'F';
        if (pct >= 100) grade = 'A';
        else if (pct >= 85) grade = 'B';
        else if (pct >= 70) grade = 'C';
        else if (pct >= 50) grade = 'D';
        return { actual, goal, pct, grade };
      };

      grades.prospectCalls = calcGrade(totalProspectCalls, funnelTargets.yearly.calls);
      grades.interviewsHeld = calcGrade(totalInterviews, funnelTargets.yearly.interviewsHeld);
      grades.newHires = calcGrade(totalNewHires, funnelTargets.yearly.onboarded);
      if (yearlyActiveAgentsGoal) {
        grades.activeAgents = calcGrade(totalActiveAgents, yearlyActiveAgentsGoal);
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      months,
      totals: {
        activeAgents: totalActiveAgents,
        newHires: totalNewHires,
        departures: totalDepartures,
        totalDeals,
        avgDealsPerAgent,
        totalInterviews,
        totalProspectCalls,
      },
      plan: {
        yearlyNewHiresGoal,
        yearlyActiveAgentsGoal,
        conversionRates,
        expectedAttritionPct: conversionRates.expectedAttritionPct,
      },
      funnelTargets,
      grades,
      availableYears,
    });
  } catch (err: any) {
    console.error('[api/broker/recruiting-metrics GET]', err);
    return jsonError(500, err.message);
  }
}

// ── POST — save monthly tracking data ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Admin only');

    const body = await req.json();
    const { action } = body;

    if (action === 'saveTracking') {
      const { year, month, data } = body;
      if (!year || !month) return jsonError(400, 'year and month required');

      const docId = `${year}-${String(month).padStart(2, '0')}`;
      await adminDb.collection('recruitingTracking').doc(docId).set({
        year, month,
        activeAgents: data.activeAgents ?? 0,
        newHires: data.newHires ?? 0,
        departures: data.departures ?? 0,
        inTraining: data.inTraining ?? 0,
        committed: data.committed ?? 0,
        interviewsHeld: data.interviewsHeld ?? 0,
        interviewsSet: data.interviewsSet ?? 0,
        prospectCalls: data.prospectCalls ?? 0,
        hotProspects: data.hotProspects ?? 0,
        nurtureProspects: data.nurtureProspects ?? 0,
        watchProspects: data.watchProspects ?? 0,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid,
      }, { merge: true });

      return NextResponse.json({ ok: true });
    }

    if (action === 'savePlan') {
      const { year, yearlyNewHiresGoal, yearlyActiveAgentsGoal, conversionRates } = body;
      if (!year) return jsonError(400, 'year required');

      await adminDb.collection('recruitingPlans').doc(String(year)).set({
        year,
        yearlyNewHiresGoal: yearlyNewHiresGoal ?? null,
        yearlyActiveAgentsGoal: yearlyActiveAgentsGoal ?? null,
        conversionRates: conversionRates ?? {},
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid,
      }, { merge: true });

      return NextResponse.json({ ok: true });
    }

    return jsonError(400, 'Unknown action');
  } catch (err: any) {
    console.error('[api/broker/recruiting-metrics POST]', err);
    return jsonError(500, err.message);
  }
}
