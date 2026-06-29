// GET /api/broker/active-agents
// Returns 12-month active agent count chart data with stacked segments:
//   - activeClosed: agents who have closed at least 1 deal (activation by deal)
//   - activeTenure: agents who have been with the brokerage 3+ months but no deal yet
//   - pipeline: recruiting pipeline candidates with expected start dates in future months
// Also returns projection line, goal line, KPI cards, comparison year data,
// deals-per-agent per month, team breakdown, and grace period graduation projection.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { format, addMonths } from 'date-fns';
import type admin from 'firebase-admin';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function requireAdminAuth(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseDate(raw: admin.firestore.Timestamp | string | undefined | null): Date | null {
  if (!raw) return null;
  if (typeof (raw as any).toDate === 'function') {
    return (raw as admin.firestore.Timestamp).toDate();
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw + 'T00:00:00');
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Returns YYYY-MM string for a date */
function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Determine the activation month for an agent.
 * Activation = earliest of:
 *   (a) month of their first closed deal
 *   (b) their startDate (agents are counted as active from day 1)
 *
 * There is no grace period delay for active agent counting.
 * Returns YYYY-MM string, or null if agent has no startDate and no deals.
 */
function getActivationMonth(
  startDate: string | null | undefined,
  firstDealMonth: string | null
): string | null {
  let startActivation: string | null = null;
  if (startDate) {
    const sd = parseDate(startDate);
    if (sd) startActivation = toYearMonth(sd);
  }
  if (!firstDealMonth && !startActivation) return null;
  if (!firstDealMonth) return startActivation;
  if (!startActivation) return firstDealMonth;
  return firstDealMonth < startActivation ? firstDealMonth : startActivation;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAdminAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const compareYearParam = searchParams.get('compareYear');
    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : null;
    const teamGroupFilter = searchParams.get('teamGroup') || null; // e.g. 'cgl', 'sgl', 'charles_ditch_team'
    // viewMode: 'calendar' (default Jan-Dec), 'rolling_back' (last 12 months), 'rolling_forward' (next 12 months)
    const viewMode = searchParams.get('viewMode') || 'calendar';

    // Build the 12 slots (YYYY-MM strings) for the view mode
    const now2 = new Date();
    const slots: { ym: string; year: number; month: number; label: string; isFuture: boolean }[] = [];
    if (viewMode === 'rolling_back') {
      // Last 12 months: from 11 months ago up to current month
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
        const ym = toYearMonth(d);
        slots.push({ ym, year: d.getFullYear(), month: d.getMonth() + 1, label: format(d, 'MMM yy'), isFuture: false });
      }
    } else if (viewMode === 'rolling_forward') {
      // Next 12 months: from current month forward
      for (let i = 0; i < 12; i++) {
        const d = new Date(now2.getFullYear(), now2.getMonth() + i, 1);
        const ym = toYearMonth(d);
        const isFuture = ym > toYearMonth(now2);
        slots.push({ ym, year: d.getFullYear(), month: d.getMonth() + 1, label: format(d, 'MMM yy'), isFuture });
      }
    } else {
      // Calendar year: Jan-Dec of selected year
      for (let i = 0; i < 12; i++) {
        const d = new Date(year, i, 1);
        const ym = toYearMonth(d);
        const isFuture = ym > toYearMonth(now2);
        slots.push({ ym, year, month: i + 1, label: format(d, 'MMM'), isFuture });
      }
    }

    // ── 1. Fetch all agent profiles (excluding demo accounts) ───────────────
    const agentSnap = await adminDb.collection('agentProfiles').get();
    const demoAgentIds = new Set(
      agentSnap.docs
        .filter(d => d.data().isDemoAccount === true)
        .map(d => String(d.data().agentId || d.id))
    );
    // Safety net: also exclude by known demo display names
    const DEMO_DISPLAY_NAMES = new Set(['Kevin Keaty', 'kevin keaty']);
    let agents = agentSnap.docs
      .filter(d => {
        if (d.data().isDemoAccount === true) return false;
        const name = String(d.data().displayName || d.data().name || '').trim();
        if (DEMO_DISPLAY_NAMES.has(name)) return false;
        return true;
      })
      .map(d => ({ id: d.id, ...d.data() } as any));

    // Apply team group filter if specified
    if (teamGroupFilter) {
      agents = agents.filter((a: any) => {
        const tg = (a.teamGroup || '').toLowerCase();
        return tg === teamGroupFilter.toLowerCase();
      });
    }

    // ── 2. Fetch all transactions (closed + pending) to find first deal dates and pending counts ─
    const txSnap = await adminDb.collection('transactions')
      .where('status', '==', 'closed')
      .get();
    const pendingTxSnap = await adminDb.collection('transactions')
      .where('status', 'in', ['pending', 'under_contract'])
      .get();

    // Build map: agentId → earliest closed month (YYYY-MM)
    const firstDealMap = new Map<string, string>();
    // Build map: agentId → Set of YYYY-MM months they had a closed deal (used for activation check)
    const dealMonthsMap = new Map<string, Set<string>>();
    // Build map: agentId → Map<YYYY-MM, dealCount> — actual deal count per agent per month
    const dealCountMap = new Map<string, Map<string, number>>();
    // Build map: agentId → count of pending/under_contract transactions
    const pendingCountMap = new Map<string, number>();

    for (const doc of txSnap.docs) {
      const t = doc.data() as any;
      if (demoAgentIds.size > 0 && demoAgentIds.has(String(t.agentId || ''))) continue;
      const closedDate = parseDate(t.closedDate);
      if (!closedDate) continue;
      const ym = toYearMonth(closedDate);
      const agentIds = [t.agentId, t.coAgentId].filter(Boolean) as string[];
      for (const aid of agentIds) {
        // Track first deal
        const existing = firstDealMap.get(aid);
        if (!existing || ym < existing) firstDealMap.set(aid, ym);
        // Track all deal months (Set — for activation/noDeals checks)
        if (!dealMonthsMap.has(aid)) dealMonthsMap.set(aid, new Set());
        dealMonthsMap.get(aid)!.add(ym);
        // Track actual deal count per agent per month
        if (!dealCountMap.has(aid)) dealCountMap.set(aid, new Map());
        const monthMap = dealCountMap.get(aid)!;
        monthMap.set(ym, (monthMap.get(ym) ?? 0) + 1);
      }
    }
    for (const doc of pendingTxSnap.docs) {
      const t = doc.data() as any;
      if (demoAgentIds.size > 0 && demoAgentIds.has(String(t.agentId || ''))) continue;
      const agentIds = [t.agentId, t.coAgentId].filter(Boolean) as string[];
      for (const aid of agentIds) {
        pendingCountMap.set(aid, (pendingCountMap.get(aid) ?? 0) + 1);
      }
    }

    // ── 3. Fetch recruiting pipeline (future hires) ──────────────────────────
    const pipelineSnap = await adminDb.collection('recruitingPipeline').get();
    const pipeline = pipelineSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // ── 4. Fetch recruiting goals for the year ───────────────────────────────
    const goalsSnap = await adminDb.collection('recruitingGoals')
      .where('year', '==', year).get();
    const goalsMap = new Map<number, number>();
    goalsSnap.docs.forEach(d => {
      const g = d.data() as any;
      if (g.month && g.activeAgentsGoal != null) goalsMap.set(g.month, g.activeAgentsGoal);
    });
    const bcGoalsSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', year)
      .where('segment', '==', 'AGENT_COUNT')
      .get();
    bcGoalsSnap.docs.forEach(d => {
      const g = d.data() as any;
      if (g.month && g.salesCountGoal != null && !goalsMap.has(g.month)) {
        goalsMap.set(g.month, g.salesCountGoal);
      }
    });

    // ── 5. Build per-agent activation/deactivation info ──────────────────────
    type AgentRecord = {
      agentId: string;
      name: string;
      activationMonth: string | null;
      endMonth: string | null;
      hasExplicitEndDate: boolean; // true only when an actual endDate field was set
      firstDealMonth: string | null;
      startDate: string | null;
      endDate: string | null;
      teamGroup: string | null;
      graceEndMonth: string | null; // YYYY-MM when 90-day grace ends
    };

    // Statuses that mean the agent is no longer active at the brokerage
    const INACTIVE_STATUSES = new Set(['inactive', 'out', 'terminated', 'churned']);

    const agentRecords: AgentRecord[] = agents.map((a: any) => {
      const agentId = a.agentId || a.id;
      const name = String(a.displayName || a.name || a.firstName && a.lastName ? `${a.firstName || ''} ${a.lastName || ''}`.trim() : '').trim() || agentId;
      const startDate = a.startDate || null;
      const endDate = a.endDate || null;
      const profileStatus = String(a.status || a.agentStatus || '').toLowerCase();
      const firstDeal = firstDealMap.get(agentId) || null;
      // Agents are active from their startDate — no grace period delay for counting purposes
      const activationMonth = getActivationMonth(startDate, firstDeal);

      let endMonth: string | null = null;
      let hasExplicitEndDate = false;
      if (endDate) {
        // Explicit end date set — use it (agent drops out the month after)
        const ed = parseDate(endDate);
        if (ed) {
          endMonth = toYearMonth(addMonths(ed, 1));
          hasExplicitEndDate = true;
        }
      } else if (INACTIVE_STATUSES.has(profileStatus)) {
        // Agent marked inactive/out in profile but no end date set.
        // Treat today as their effective end so they are excluded from the
        // current month onwards, but all historical months remain correct.
        // NOTE: hasExplicitEndDate stays false — we don't count these as
        // departure events because we don't know when they actually left.
        endMonth = toYearMonth(new Date());
      }

      // No grace period for active agent counting — graceEndMonth is always null.
      // (gracePeriodEnabled on the agent profile still controls the agent's own
      // KPI dashboard grade suppression, but does not affect active agent counts.)
      const graceEndMonth: string | null = null;
      return {
        agentId,
        name,
        activationMonth,
        endMonth,
        hasExplicitEndDate,
        firstDealMonth: firstDeal,
        startDate,
        endDate,
        teamGroup: a.teamGroup || null,
        graceEndMonth,
      };
    });

    // ── 6. Build monthly data using slots (supports calendar, rolling_back, rolling_forward) ──
    const now = new Date();
    const currentYM = toYearMonth(now);

    const months = slots.map((slot, i) => {
      const monthNum = slot.month;
      const ym = slot.ym;

      let activeClosed = 0;   // active agents with ≥1 closed deal
      let activeNoDeal = 0;   // active agents with no closed deal yet
      const inGrace = 0;      // always 0 — grace period removed from active agent counting
      // Team breakdown
      const teamCounts: Record<string, number> = {};
      for (const ar of agentRecords) {
        // Skip agents who have already departed
        if (ar.endMonth && ar.endMonth <= ym) continue;
        // Agent must have an activationMonth (startDate or first deal) on or before this month
        if (!ar.activationMonth) continue;
        if (ar.activationMonth > ym) continue;
        const tg = ar.teamGroup || 'unknown';
        teamCounts[tg] = (teamCounts[tg] || 0) + 1;
        if (ar.firstDealMonth && ar.firstDealMonth <= ym) {
          activeClosed++;
        } else {
          activeNoDeal++;
        }
      }
      // Pipeline: recruiting pipeline candidates with expectedStartDate in this month
      const pipelineCount = pipeline.filter((p: any) => {
        if (!p.expectedStartDate) return false;
        const sd = parseDate(p.expectedStartDate);
        if (!sd) return false;
        return toYearMonth(sd) === ym;
      }).length;
      // totalActive = established agents only (past grace period)
      const totalActive = activeClosed + activeNoDeal;
      // For rolling modes, look up goal by calendar month number in the slot's year
      // We need goals for potentially two calendar years (rolling_back/forward spans years)
      const goal = goalsMap.get(monthNum) ?? null;
      // Deals closed in this month — count actual deal count per active agent
      let dealsInMonth = 0;
      for (const ar of agentRecords) {
        if (!ar.activationMonth || ar.activationMonth > ym) continue;
        if (ar.endMonth && ar.endMonth <= ym) continue;
        const monthMap = dealCountMap.get(ar.agentId);
        if (monthMap) dealsInMonth += monthMap.get(ym) ?? 0;
      }
      const dealsPerAgent = totalActive > 0
        ? Math.round((dealsInMonth / totalActive) * 100) / 100
        : 0;
      return {
        month: monthNum,
        label: slot.label,
        ym,
        isFuture: slot.isFuture,
        activeClosed,
        activeTenure: activeNoDeal,  // keep field name for backward compat
        inGrace,
        pipeline: pipelineCount,
        totalActive,
        goal,
        dealsInMonth,
        dealsPerAgent,
        teamCounts,
      };
    });

    // ── 7. Build comparison year data ────────────────────────────────────────
    let compareMonths: Array<{ month: number; totalActive: number | null; dealsPerAgent: number | null; isFuture?: boolean }> | null = null;
    if (compareYear) {
      // Same-date cutoff: only show compare year data up to the same month as current year
      // so 2026 June vs 2022 June is a true apples-to-apples comparison
      const cutoffMonth = new Date().getMonth() + 1; // e.g. 6 for June (1-indexed)
      compareMonths = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const ym = `${compareYear}-${String(monthNum).padStart(2, '0')}`;
        // Only include months up to the same calendar month as current year
        if (monthNum > cutoffMonth) {
          return { month: monthNum, totalActive: null as any, dealsPerAgent: null as any, isFuture: true };
        }
        // Count established agents (past grace) in compare year month
        let total = 0;
        for (const ar of agentRecords) {
          if (!ar.activationMonth) continue;
          if (ar.activationMonth > ym) continue;
          if (ar.endMonth && ar.endMonth <= ym) continue;
          // Apply grace period filter for compare year too
          const pastGrace = !ar.graceEndMonth || ar.graceEndMonth <= ym;
          if (!pastGrace) continue;
          total++;
        }
        // Count actual deals (not just agent-month presence)
        let dealsInMonth = 0;
        for (const ar of agentRecords) {
          const pastGrace = !ar.graceEndMonth || ar.graceEndMonth <= ym;
          if (!pastGrace) continue;
          const monthMap = dealCountMap.get(ar.agentId);
          if (monthMap) dealsInMonth += monthMap.get(ym) ?? 0;
        }
        const dealsPerAgent = total > 0 ? Math.round((dealsInMonth / total) * 100) / 100 : 0;
        return { month: monthNum, totalActive: total, dealsPerAgent, isFuture: false };
      });
    }

    // ── 8. Build projection line for future months ───────────────────────────
    const projectionMonths = months.map(m => {
      if (m.ym <= currentYM) return { month: m.month, projected: null };
      const currentActives = months.find(x => x.ym === currentYM)?.totalActive ?? 0;
      const pipelineByMonth = pipeline.filter((p: any) => {
        if (!p.expectedStartDate) return false;
        const sd = parseDate(p.expectedStartDate);
        if (!sd) return false;
        return toYearMonth(sd) <= m.ym && toYearMonth(sd) > currentYM;
      }).length;
      const projected = currentActives + pipelineByMonth;
      return { month: m.month, projected };
    });

    // ── 9. KPI cards ─────────────────────────────────────────────────────────
    const currentMonthData = months.find(m => m.ym === currentYM) || months[months.length - 1];

    // Fetch recruiting plan goals for this year (new hires goal, net gain goal)
    let yearlyNewHiresGoal: number | null = null;
    let netGainGoal: number | null = null;
    try {
      const planDoc = await adminDb.collection('recruitingPlans').doc(String(year)).get();
      if (planDoc.exists) {
        const pd = planDoc.data()!;
        yearlyNewHiresGoal = pd.yearlyNewHiresGoal ?? null;
        netGainGoal = pd.netGainGoal ?? null;
      }
    } catch { /* non-fatal */ }
    const prevMonthData = months.find(m => m.month === (currentMonthData.month - 1)) || null;
    // Use startDate year to determine which year an agent was hired.
    // activationMonth = startDate + 3 months (grace period) — it must NOT be used
    // to classify hire year. Example: agent who started Nov 2025 has
    // activationMonth = Feb 2026, but they are a 2025 hire.
    const ytdNewHiresRecords = agentRecords.filter(ar => {
      // Primary: use startDate year
      if (ar.startDate) {
        const sd = parseDate(ar.startDate);
        if (sd) {
          const startYM = toYearMonth(sd);
          return startYM.startsWith(String(year)) && startYM <= currentYM;
        }
      }
      // Fallback: use activationMonth only when startDate is absent
      if (!ar.activationMonth) return false;
      return ar.activationMonth.startsWith(String(year)) && ar.activationMonth <= currentYM;
    });
    const ytdNewHires = ytdNewHiresRecords.length;
    const ytdNewHiresList = ytdNewHiresRecords
      .sort((a, b) => {
        // Sort by startDate when available, otherwise activationMonth
        const aKey = a.startDate ?? a.activationMonth ?? '';
        const bKey = b.startDate ?? b.activationMonth ?? '';
        return aKey.localeCompare(bKey);
      })
      .map(ar => ({
        name: ar.name,
        agentId: ar.agentId,
        startDate: ar.startDate,
        activationMonth: ar.activationMonth,
        teamGroup: ar.teamGroup,
      }));

    const ytdDeparturesRecords = agentRecords.filter(ar => {
      // Only count agents with an EXPLICIT endDate set — not agents who are
      // merely marked inactive with no date (we don't know when they left).
      if (!ar.hasExplicitEndDate || !ar.endMonth) return false;
      // Only count as a departure if the agent was ever actually activated
      if (!ar.activationMonth) return false;
      return ar.endMonth.startsWith(String(year)) && ar.endMonth <= currentYM;
    });
    const ytdDepartures = ytdDeparturesRecords.length;
    const ytdDeparturesList = ytdDeparturesRecords
      .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''))
      .map(ar => ({
        name: ar.name,
        agentId: ar.agentId,
        endDate: ar.endDate,
        endMonth: ar.endMonth,
        teamGroup: ar.teamGroup,
      }));

    // YTD deals per agent: total closed deals YTD / current established (past grace) agents only
    // Uses actual deal count (not just whether agent had a deal)
    let ytdDeals = 0;
    for (let m = 1; m <= currentMonthData.month; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      for (const ar of agentRecords) {
        // Only count deals by established agents (past grace at that month)
        const pastGrace = !ar.graceEndMonth || ar.graceEndMonth <= ym;
        if (!pastGrace) continue;
        const monthMap = dealCountMap.get(ar.agentId);
        if (monthMap) ytdDeals += monthMap.get(ym) ?? 0;
      }
    }
    const ytdDealsPerAgent = currentMonthData.totalActive > 0
      ? Math.round((ytdDeals / currentMonthData.totalActive) * 100) / 100
      : 0;

    // Avg monthly deals per agent: average of (dealsInMonth / totalActive) across months elapsed
    // This is the correct metric: average of monthly ratios, not total / agents
    const monthsWithAgents = months
      .slice(0, currentMonthData.month)
      .filter(m => m.totalActive > 0);
    const avgMonthlyDealsPerAgent = monthsWithAgents.length > 0
      ? Math.round(
          (monthsWithAgents.reduce((sum, m) => sum + m.dealsPerAgent, 0) / monthsWithAgents.length)
          * 100
        ) / 100
      : 0;

    // No Deals Yet count: established agents (past grace) with no closed AND no pending deals.
    // Grace period agents are excluded — they are not yet counted as active.
    const noDealsYetCount = agentRecords.filter(ar => {
      // Must be currently active (not departed)
      if (ar.endMonth && ar.endMonth <= currentYM) return false;
      // Must have been activated
      if (!ar.activationMonth && !ar.startDate) return false;
      // Must be past grace period (grace period agents are excluded entirely)
      if (ar.graceEndMonth && ar.graceEndMonth > currentYM) return false;
      // Must have no closed deals ever
      if (ar.firstDealMonth) return false;
      // Must have no pending deals currently
      if ((pendingCountMap.get(ar.agentId) ?? 0) > 0) return false;
      return true;
    }).length;

    // ── 10. Grace period graduation projection ───────────────────────────────
    // For the next 3 months: how many grace-period agents will graduate (complete 90 days)?
    // These agents are currently in grace period (graceEndMonth > currentYM)
    // and will become "established active" when their grace period ends.
    const graceProjection: Array<{
      ym: string;
      label: string;
      graduatingCount: number;
      projectedTotal: number;
    }> = [];

    for (let offset = 1; offset <= 3; offset++) {
      const projDate = addMonths(now, offset);
      const projYM = toYearMonth(projDate);
      const projLabel = format(projDate, 'MMM yyyy');

      // Agents graduating in this specific month
      const graduating = agentRecords.filter(ar => {
        if (!ar.graceEndMonth) return false;
        if (ar.endMonth && ar.endMonth <= projYM) return false;
        return ar.graceEndMonth === projYM;
      }).length;

      // Total projected active agents in that month (current actives + pipeline joining by then)
      const currentActives = currentMonthData.totalActive;
      const pipelineJoining = pipeline.filter((p: any) => {
        if (!p.expectedStartDate) return false;
        const sd = parseDate(p.expectedStartDate);
        if (!sd) return false;
        const startYM = toYearMonth(sd);
        return startYM > currentYM && startYM <= projYM;
      }).length;
      // Estimate departures as 0 for simplicity
      const projectedTotal = currentActives + pipelineJoining;

      graceProjection.push({ ym: projYM, label: projLabel, graduatingCount: graduating, projectedTotal });
    }

    // ── 11. Available years for compare selector ─────────────────────────────
    // Build from multiple sources to ensure the dropdown is always populated.
    // Primary: transaction year field (always set, most reliable).
    // Secondary: agent start/activation/firstDeal dates.
    // Fallback: always include the past 5 years so the dropdown is never empty.
    const yearSet = new Set<number>();

    // (a) Transaction year field — most reliable source
    for (const doc of txSnap.docs) {
      const t = doc.data() as any;
      // Use the year field first (always set), fall back to closedDate
      if (t.year && typeof t.year === 'number') {
        yearSet.add(t.year);
      } else {
        const cd = parseDate(t.closedDate);
        if (cd) yearSet.add(cd.getFullYear());
      }
    }

    // (b) Agent profile dates
    for (const ar of agentRecords) {
      if (ar.startDate) {
        const y = new Date(ar.startDate + 'T00:00:00').getFullYear();
        if (!isNaN(y)) yearSet.add(y);
      }
      if (ar.activationMonth) {
        const y = parseInt(ar.activationMonth.slice(0, 4), 10);
        if (!isNaN(y)) yearSet.add(y);
      }
      if (ar.firstDealMonth) {
        const y = parseInt(ar.firstDealMonth.slice(0, 4), 10);
        if (!isNaN(y)) yearSet.add(y);
      }
    }

    // (c) Fallback: always include the past 5 calendar years so the dropdown
    //     is never empty even if agent/transaction data is sparse.
    for (let offset = 1; offset <= 5; offset++) {
      yearSet.add(year - offset);
    }

    const availableYears = [...yearSet]
      .filter(y => y !== year && y >= 2018) // exclude current year and ancient data
      .sort((a, b) => b - a)
      .slice(0, 8);

    // ── 12. Team group breakdown for current month ───────────────────────────
    const teamGroupBreakdown = currentMonthData.teamCounts;

    return NextResponse.json({
      ok: true,
      year,
      teamGroupFilter,
      months,
      compareYear,
      compareMonths,
      projection: projectionMonths,
      kpi: {
        currentActive: currentMonthData.totalActive,
        prevMonthActive: prevMonthData?.totalActive ?? null,
        ytdNewHires,
        ytdDepartures,
        ytdNewHiresList,
        ytdDeparturesList,
        pipelineCount: pipeline.length,
        ytdDealsPerAgent,
        avgMonthlyDealsPerAgent,
        ytdDeals,
        noDealsYetCount,
        inGraceCount: currentMonthData.inGrace ?? 0,
        // Recruiting plan goals (for grading New Hires and Net Agents Added)
        yearlyNewHiresGoal,
        netGainGoal,
        // Compare year KPIs (same-date cutoff)
        compareYtdAgents: compareMonths
          ? (compareMonths.find(m => m.month === currentMonthData.month && !m.isFuture)?.totalActive ?? null)
          : null,
        compareAvgMonthlyDealsPerAgent: compareMonths
          ? (() => {
              const validMonths = compareMonths.filter(m => !m.isFuture && (m.totalActive ?? 0) > 0);
              return validMonths.length > 0
                ? Math.round((validMonths.reduce((s, m) => s + (m.dealsPerAgent ?? 0), 0) / validMonths.length) * 100) / 100
                : null;
            })()
          : null,
      },
      graceProjection,
      teamGroupBreakdown,
      availableYears,
    });
  } catch (err: any) {
    console.error('[active-agents] Error:', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
