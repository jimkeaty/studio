// GET + POST /api/broker/recruiting-metrics
// GET: returns 12-month recruiting data, pipeline, and agent activity
// POST: save monthly recruiting tracking data
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { format, addMonths } from 'date-fns';
import type admin from 'firebase-admin';


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
    if (!(await isAdminLike(decoded.uid))) {
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
    const viewMode = searchParams.get('viewMode') || 'calendar';

    // Build 12 slots for the view mode
    const nowRM = new Date();
    function toYM(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
    const rmSlots: { ym: string; year: number; month: number; label: string; isFuture: boolean }[] = [];
    if (viewMode === 'rolling_back') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(nowRM.getFullYear(), nowRM.getMonth() - i, 1);
        rmSlots.push({ ym: toYM(d), year: d.getFullYear(), month: d.getMonth()+1, label: format(d,'MMM yy'), isFuture: false });
      }
    } else if (viewMode === 'rolling_forward') {
      for (let i = 0; i < 12; i++) {
        const d = new Date(nowRM.getFullYear(), nowRM.getMonth() + i, 1);
        const ym = toYM(d);
        rmSlots.push({ ym, year: d.getFullYear(), month: d.getMonth()+1, label: format(d,'MMM yy'), isFuture: ym > toYM(nowRM) });
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const d = new Date(year, i, 1);
        const ym = toYM(d);
        rmSlots.push({ ym, year, month: i+1, label: format(d,'MMM'), isFuture: ym > toYM(nowRM) });
      }
    }

    // Collect all years needed for tracking data fetch
    const yearsNeeded = [...new Set(rmSlots.map(s => s.year))];

    // 1. Fetch recruiting tracking data for year(s)
    const allTrackingDocs: any[] = [];
    for (const y of yearsNeeded) {
      const snap = await adminDb.collection('recruitingTracking').where('year', '==', y).get();
      snap.docs.forEach(d => allTrackingDocs.push({ ...d.data(), _year: y }));
    }
    const trackingMap = new Map<string, any>(); // key: "YYYY-M"
    allTrackingDocs.forEach(d => trackingMap.set(`${d._year}-${d.month}`, d));

    // Legacy single-year trackingSnap (for backward compat with savePlan and other POST code)
    const trackingSnap = await adminDb.collection('recruitingTracking')
      .where('year', '==', year).orderBy('month', 'asc').get();
    // legacyTrackingMap: month number → doc (for the primary year only, used by POST/save)
    const legacyTrackingMap = new Map<number, any>();
    trackingSnap.docs.forEach(d => {
      const data = d.data();
      legacyTrackingMap.set(data.month, { id: d.id, ...data });
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
      // Dual Agent counts as 2 sides (1 buyer + 1 listing)
      const isDual = String(t.closingType || '').toLowerCase() === 'dual';
      const sideCount = isDual ? 2 : 1;
      if (t.closedDate) {
        let closedDate: Date | null = null;
        if (typeof (t.closedDate as any).toDate === 'function') {
          closedDate = (t.closedDate as any).toDate();
        } else if (typeof t.closedDate === 'string') {
          const parsed = new Date(t.closedDate);
          if (!isNaN(parsed.getTime())) closedDate = parsed;
        }
        if (closedDate && closedDate.getFullYear() === year) {
          monthlyDeals[closedDate.getMonth()] += sideCount;
        }
      }
    });

    // 5. Get available years
    // Build from recruitingTracking collection, but always include the past 5 years
    // as a fallback so the Compare To dropdown is never empty.
    const yearsSnap = await adminDb.collection('recruitingTracking').select('year').get();
    const yearSet = new Set<number>(yearsSnap.docs.map(d => d.data().year as number));
    // Fallback: always include past 5 years
    for (let offset = 1; offset <= 5; offset++) yearSet.add(year - offset);
    const availableYears = [...yearSet]
      .filter(y => y !== year && y >= 2018)
      .sort((a, b) => b - a)
      .slice(0, 8);

    // 5b. Fetch agent profiles to compute real monthly departures and in-training counts
    function parseAgentDate(raw: admin.firestore.Timestamp | string | undefined | null): Date | null {
      if (!raw) return null;
      if (typeof (raw as any).toDate === 'function') return (raw as admin.firestore.Timestamp).toDate();
      if (typeof raw === 'string') {
        const d = new Date(raw + 'T00:00:00');
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    }
    const agentSnap = await adminDb.collection('agentProfiles').get();
    const INACTIVE_STATUSES_RM = new Set(['inactive', 'out', 'terminated', 'churned']);
    // Monthly departure counts: month 1-12 → count of agents whose endDate falls in that month of `year`
    const monthlyDepartures: number[] = new Array(12).fill(0);
    // Monthly in-training counts: agents in grace period (startDate + 3 months > today) for each month
    const monthlyInTraining: number[] = new Array(12).fill(0);

    for (const doc of agentSnap.docs) {
      const a = doc.data() as any;
      if (a.isDemoAccount) continue;

      // Departures: use endDate field
      const endDate = parseAgentDate(a.endDate);
      if (endDate && endDate.getFullYear() === year) {
        const m = endDate.getMonth(); // 0-indexed
        monthlyDepartures[m] += 1;
      } else if (!endDate && INACTIVE_STATUSES_RM.has(String(a.status || a.agentStatus || '').toLowerCase())) {
        // No endDate but marked inactive — count in current month of current year
        const now = new Date();
        if (now.getFullYear() === year) {
          monthlyDepartures[now.getMonth()] += 1;
        }
      }

      // In-training: agents whose grace period (startDate + 3 months) hasn't ended yet for that month
      const startDate = parseAgentDate(a.startDate);
      if (startDate) {
        const graceEnd = addMonths(startDate, 3);
        const startYM = toYM(startDate);
        const graceEndYM = toYM(graceEnd);
        for (let m = 0; m < 12; m++) {
          const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
          // Agent is in training in month m if: they started before or during that month AND grace hasn't ended yet
          if (startYM <= ym && graceEndYM > ym) {
            monthlyInTraining[m] += 1;
          }
        }
      }
    }

    // 6. Build 12-month response using rmSlots
    const months = rmSlots.map((slot, i) => {
      const m = slot.month;
      // trackingMap key is "YYYY-M" (new slot-aware map)
      const tracking = trackingMap.get(`${slot.year}-${m}`) || {};
      const goals = goalsMap.get(m) || {};
      const compareTracking = compareTrackingMap.get(m) || {};

      const activeAgents = tracking.activeAgents ?? 0;
      // For rolling modes, deals index is based on slot position not calendar month
      // monthlyDeals is still indexed 0-11 by calendar month for the primary year
      const calendarIdx = slot.year === year ? m - 1 : -1;
      const deals = calendarIdx >= 0 ? monthlyDeals[calendarIdx] : 0;
      const dealsPerAgent = activeAgents > 0 ? Math.round((deals / activeAgents) * 100) / 100 : 0;
      // Auto-computed from agent profiles (only valid for primary year months)
      const autoDepartures = calendarIdx >= 0 ? monthlyDepartures[calendarIdx] : 0;
      const autoInTraining = calendarIdx >= 0 ? monthlyInTraining[calendarIdx] : 0;
      // Use manual tracking value if explicitly entered (> 0), otherwise fall back to auto-computed
      const departures = (tracking.departures != null && tracking.departures > 0) ? tracking.departures : autoDepartures;
      const inTraining = (tracking.inTraining != null && tracking.inTraining > 0) ? tracking.inTraining : autoInTraining;

      return {
        month: m,
        label: slot.label,
        ym: slot.ym,
        isFuture: slot.isFuture,
        // Current year actuals
        activeAgents,
        newHires: tracking.newHires ?? 0,
        departures,
        inTraining,
        autoDepartures,
        autoInTraining,
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
    // Months elapsed YTD (up to current month, capped at 12)
    const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;
    const monthsElapsed = Math.min(currentMonth, 12);

    const totalActiveAgents = months.length > 0 ? months[months.length - 1].activeAgents : 0; // latest month
    const totalNewHires = months.reduce((s, m) => s + m.newHires, 0);
    const totalDepartures = months.reduce((s, m) => s + m.departures, 0);
    const totalDeals = months.reduce((s, m) => s + m.closedDeals, 0);
    // Avg Deals/Agent = average of monthly (deals/agents) ratios for months elapsed YTD
    // Goal: 1 deal per agent per month, so YTD goal = monthsElapsed deals/agent
    const monthlyRatios = months
      .slice(0, monthsElapsed)
      .filter(m => m.activeAgents > 0)
      .map(m => m.dealsPerAgent);
    const avgDealsPerAgent = monthlyRatios.length > 0
      ? Math.round((monthlyRatios.reduce((s, r) => s + r, 0) / monthlyRatios.length) * 100) / 100
      : 0;
    const ytdDealsPerAgentGoal = monthsElapsed; // 1 deal/agent/month × months elapsed
    const totalInterviews = months.reduce((s, m) => s + m.interviewsHeld, 0);
    const totalInterviewsSet = months.reduce((s, m) => s + (m.interviewsSet ?? 0), 0);
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

    // Grade each lead indicator — based on YTD actual vs YTD prorated goal
    // YTD goal = yearly goal × (monthsElapsed / 12)
    const grades: Record<string, { actual: number; goal: number; pct: number; grade: string; ytdGoal: number; monthsElapsed: number; yearlyGoal: number }> = {};
    const calcGrade = (actual: number, yearlyGoal: number) => {
      const ytdGoal = Math.round(yearlyGoal * monthsElapsed / 12);
      const pct = ytdGoal > 0 ? Math.round((actual / ytdGoal) * 100) : 0;
      let grade = 'F';
      if (pct >= 100) grade = 'A';
      else if (pct >= 85) grade = 'B';
      else if (pct >= 70) grade = 'C';
      else if (pct >= 50) grade = 'D';
      return { actual, goal: ytdGoal, yearlyGoal, pct, grade, ytdGoal, monthsElapsed };
    };

    if (funnelTargets) {
      grades.prospectCalls = calcGrade(totalProspectCalls, funnelTargets.yearly.calls);
      grades.interviewsHeld = calcGrade(totalInterviews, funnelTargets.yearly.interviewsHeld);
      grades.newHires = calcGrade(totalNewHires, funnelTargets.yearly.onboarded);
    }
    if (yearlyActiveAgentsGoal) {
      grades.activeAgents = calcGrade(totalActiveAgents, yearlyActiveAgentsGoal);
    }
    // Avg Deals/Agent grade: actual YTD avg vs monthsElapsed (goal = 1/agent/month)
    grades.dealsPerAgent = (() => {
      const pct = ytdDealsPerAgentGoal > 0 ? Math.round((avgDealsPerAgent / ytdDealsPerAgentGoal) * 100) : 0;
      let grade = 'F';
      if (pct >= 100) grade = 'A';
      else if (pct >= 85) grade = 'B';
      else if (pct >= 70) grade = 'C';
      else if (pct >= 50) grade = 'D';
      return { actual: avgDealsPerAgent, goal: ytdDealsPerAgentGoal, yearlyGoal: 12, pct, grade, ytdGoal: ytdDealsPerAgentGoal, monthsElapsed };
    })();

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
        ytdDealsPerAgentGoal,
        monthsElapsed,
        totalInterviews,
        totalInterviewsSet,
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
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Admin only');

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
      const { year, yearlyNewHiresGoal, yearlyActiveAgentsGoal, netGainGoal, conversionRates } = body;
      if (!year) return jsonError(400, 'year required');

      await adminDb.collection('recruitingPlans').doc(String(year)).set({
        year,
        yearlyNewHiresGoal: yearlyNewHiresGoal ?? null,
        yearlyActiveAgentsGoal: yearlyActiveAgentsGoal ?? null,
        netGainGoal: netGainGoal ?? null,
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
