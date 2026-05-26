// GET /api/broker/active-agents
// Returns 12-month active agent count chart data with stacked segments:
//   - activeClosed: agents who have closed at least 1 deal (activation by deal)
//   - activeTenure: agents who have been with the brokerage 3+ months but no deal yet
//   - pipeline: recruiting pipeline candidates with expected start dates in future months
// Also returns projection line, goal line, KPI cards, and comparison year data.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
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

/** Parse a YYYY-MM string into a Date (first day of that month) */
function fromYearMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/**
 * Determine the activation month for an agent.
 * Activation = earliest of:
 *   (a) month of their first closed deal (as agentId or coAgentId)
 *   (b) startDate + 3 calendar months (tenure-based activation)
 * Returns YYYY-MM string, or null if agent has no startDate and no deals.
 */
function getActivationMonth(
  startDate: string | null | undefined,
  firstDealMonth: string | null
): string | null {
  let tenureActivation: string | null = null;
  if (startDate) {
    const sd = parseDate(startDate);
    if (sd) {
      const tenureDate = addMonths(sd, 3);
      tenureActivation = toYearMonth(tenureDate);
    }
  }

  if (!firstDealMonth && !tenureActivation) return null;
  if (!firstDealMonth) return tenureActivation;
  if (!tenureActivation) return firstDealMonth;
  // Return the earlier of the two
  return firstDealMonth < tenureActivation ? firstDealMonth : tenureActivation;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAdminAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const compareYearParam = searchParams.get('compareYear');
    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : null;

    // ── 1. Fetch all agent profiles ──────────────────────────────────────────
    const agentSnap = await adminDb.collection('agentProfiles').get();
    const agents = agentSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // ── 2. Fetch all closed transactions (all years) to find first deal dates ─
    const txSnap = await adminDb.collection('transactions')
      .where('status', '==', 'closed')
      .get();

    // Build map: agentId → earliest closed month (YYYY-MM)
    const firstDealMap = new Map<string, string>();
    for (const doc of txSnap.docs) {
      const t = doc.data() as any;
      const closedDate = parseDate(t.closedDate);
      if (!closedDate) continue;
      const ym = toYearMonth(closedDate);

      const agentIds = [t.agentId, t.coAgentId].filter(Boolean) as string[];
      for (const aid of agentIds) {
        const existing = firstDealMap.get(aid);
        if (!existing || ym < existing) {
          firstDealMap.set(aid, ym);
        }
      }
    }

    // ── 3. Fetch recruiting pipeline (future hires) ──────────────────────────
    const pipelineSnap = await adminDb.collection('recruitingPipeline').get();
    const pipeline = pipelineSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // ── 4. Fetch recruiting goals for the year ───────────────────────────────
    const goalsSnap = await adminDb.collection('recruitingGoals')
      .where('year', '==', year).get();
    const goalsMap = new Map<number, number>(); // month (1-12) → goal agent count
    goalsSnap.docs.forEach(d => {
      const g = d.data() as any;
      if (g.month && g.activeAgentsGoal != null) {
        goalsMap.set(g.month, g.activeAgentsGoal);
      }
    });

    // Also check brokerCommandGoals for agent count goals (legacy)
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
      activationMonth: string | null; // YYYY-MM when they became "active"
      endMonth: string | null;        // YYYY-MM when they left (exclusive)
      firstDealMonth: string | null;
      startDate: string | null;
    };

    const agentRecords: AgentRecord[] = agents.map((a: any) => {
      const agentId = a.agentId || a.id;
      const startDate = a.startDate || null;
      const endDate = a.endDate || null;
      const firstDeal = firstDealMap.get(agentId) || null;
      const activationMonth = getActivationMonth(startDate, firstDeal);
      let endMonth: string | null = null;
      if (endDate) {
        const ed = parseDate(endDate);
        if (ed) {
          // Agent is no longer active starting the month after their end date
          endMonth = toYearMonth(addMonths(ed, 1));
        }
      }
      return { agentId, activationMonth, endMonth, firstDealMonth: firstDeal, startDate };
    });

    // ── 6. Build monthly data for the target year ────────────────────────────
    const months = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1; // 1-12
      const ym = `${year}-${String(monthNum).padStart(2, '0')}`;

      let activeClosed = 0;
      let activeTenure = 0;

      for (const ar of agentRecords) {
        if (!ar.activationMonth) continue;
        // Agent must have activated by this month
        if (ar.activationMonth > ym) continue;
        // Agent must not have left before this month
        if (ar.endMonth && ar.endMonth <= ym) continue;

        // Classify: activeClosed if they have a closed deal by this month
        if (ar.firstDealMonth && ar.firstDealMonth <= ym) {
          activeClosed++;
        } else {
          activeTenure++;
        }
      }

      // Pipeline: recruiting pipeline candidates with expectedStartDate in this month
      const pipelineCount = pipeline.filter((p: any) => {
        if (!p.expectedStartDate) return false;
        const sd = parseDate(p.expectedStartDate);
        if (!sd) return false;
        return toYearMonth(sd) === ym;
      }).length;

      const totalActive = activeClosed + activeTenure;
      const goal = goalsMap.get(monthNum) ?? null;

      return {
        month: monthNum,
        label: format(new Date(year, i), 'MMM'),
        ym,
        activeClosed,
        activeTenure,
        pipeline: pipelineCount,
        totalActive,
        goal,
      };
    });

    // ── 7. Build comparison year data ────────────────────────────────────────
    let compareMonths: Array<{ month: number; totalActive: number }> | null = null;
    if (compareYear) {
      compareMonths = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const ym = `${compareYear}-${String(monthNum).padStart(2, '0')}`;
        let total = 0;
        for (const ar of agentRecords) {
          if (!ar.activationMonth) continue;
          if (ar.activationMonth > ym) continue;
          if (ar.endMonth && ar.endMonth <= ym) continue;
          total++;
        }
        return { month: monthNum, totalActive: total };
      });
    }

    // ── 8. Build projection line for future months ───────────────────────────
    const now = new Date();
    const currentYM = toYearMonth(now);
    const projectionMonths = months.map(m => {
      if (m.ym <= currentYM) return { month: m.month, projected: null };
      // Current actives + pipeline agents expected to start by this month
      const currentActives = months.find(x => x.ym === currentYM)?.totalActive ?? 0;
      const pipelineByMonth = pipeline.filter((p: any) => {
        if (!p.expectedStartDate) return false;
        const sd = parseDate(p.expectedStartDate);
        if (!sd) return false;
        return toYearMonth(sd) <= m.ym && toYearMonth(sd) > currentYM;
      }).length;
      // Estimate departures: use average monthly departure rate from last 12 months
      // For now use a simple 0 departure assumption (can be refined)
      const projected = currentActives + pipelineByMonth;
      return { month: m.month, projected };
    });

    // ── 9. KPI cards ─────────────────────────────────────────────────────────
    const currentMonthData = months.find(m => m.ym === currentYM) || months[months.length - 1];
    const prevMonthData = months.find(m => m.month === (currentMonthData.month - 1)) || null;
    const ytdNewHires = agentRecords.filter(ar => {
      if (!ar.activationMonth) return false;
      return ar.activationMonth.startsWith(String(year)) && ar.activationMonth <= currentYM;
    }).length;
    const ytdDepartures = agentRecords.filter(ar => {
      if (!ar.endMonth) return false;
      return ar.endMonth.startsWith(String(year)) && ar.endMonth <= currentYM;
    }).length;

    // ── 10. Available years for compare selector ─────────────────────────────
    const allStartYears = agentRecords
      .map(ar => ar.startDate ? new Date(ar.startDate + 'T00:00:00').getFullYear() : null)
      .filter(Boolean) as number[];
    const availableYears = [...new Set(allStartYears)]
      .filter(y => y !== year)
      .sort((a, b) => b - a)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      year,
      months,
      compareYear,
      compareMonths,
      projection: projectionMonths,
      kpi: {
        currentActive: currentMonthData.totalActive,
        prevMonthActive: prevMonthData?.totalActive ?? null,
        ytdNewHires,
        ytdDepartures,
        pipelineCount: pipeline.length,
      },
      availableYears,
    });
  } catch (err: any) {
    console.error('[active-agents] Error:', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
