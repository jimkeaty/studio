// GET  /api/broker/active-agents/year-scorecard?year=2023
// Returns full-year scorecard data for a past year:
//   - year-end active agent count (actual vs goal)
//   - YTD new hires, YTD departures, net gain (actual vs goal)
//   - grade letters using the same A/B/C/D/F scale
//
// POST /api/broker/active-agents/year-scorecard
// Save historical year goals: { year, yearlyActiveAgentsGoal, netGainGoal, yearlyNewHiresGoal }

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type admin from 'firebase-admin';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
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

function parseDate(raw: admin.firestore.Timestamp | string | undefined | null): Date | null {
  if (!raw) return null;
  if (typeof (raw as any).toDate === 'function') return (raw as any).toDate();
  if (typeof raw === 'string') {
    const p = new Date(raw + 'T00:00:00');
    if (!isNaN(p.getTime())) return p;
  }
  return null;
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function calcGrade(actual: number, goal: number): { pct: number; grade: string } {
  if (!goal || goal <= 0) return { pct: 0, grade: '—' };
  const pct = Math.round((actual / goal) * 100);
  let grade = 'F';
  if (pct >= 95) grade = 'A';
  else if (pct >= 85) grade = 'B';
  else if (pct >= 70) grade = 'C';
  else if (pct >= 55) grade = 'D';
  return { pct, grade };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAdmin(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '', 10);
    if (!year || isNaN(year)) return jsonError(400, 'year required');

    const currentYear = new Date().getFullYear();
    if (year >= currentYear) return jsonError(400, 'year-scorecard is only available for past years');

    // ── 1. Load goals for this year ──────────────────────────────────────────
    const planDoc = await adminDb.collection('recruitingPlans').doc(String(year)).get();
    const plan = planDoc.data() ?? {};
    const yearlyActiveAgentsGoal: number | null = plan.yearlyActiveAgentsGoal ?? null;
    const yearlyNewHiresGoal: number | null = plan.yearlyNewHiresGoal ?? null;
    const netGainGoal: number | null = plan.netGainGoal ?? null;

    // ── 2. Load all agents ───────────────────────────────────────────────────
    const agentsSnap = await adminDb.collection('agents').get();
    const demoIds = new Set<string>();
    agentsSnap.docs.forEach(d => {
      const a = d.data();
      if (a.isDemo || a.isDemoAgent) demoIds.add(d.id);
    });

    // ── 3. Compute year-end active agent count ───────────────────────────────
    // An agent counts as "active at year-end" if:
    //   - activationMonth <= YYYY-12  (activated by Dec of this year)
    //   - endMonth is null OR endMonth > YYYY-12  (not departed before year-end)
    const yearEndYM = `${year}-12`;
    const yearStartYM = `${year}-01`;

    let yearEndActive = 0;
    let ytdNewHires = 0;
    let ytdDepartures = 0;

    for (const doc of agentsSnap.docs) {
      if (demoIds.has(doc.id)) continue;
      const a = doc.data();

      // Derive activationMonth
      let activationMonth: string | null = a.activationMonth ?? null;
      if (!activationMonth) {
        // Fall back to startDate
        const sd = parseDate(a.startDate ?? a.joinDate);
        if (sd) activationMonth = toYearMonth(sd);
      }
      if (!activationMonth) continue; // never activated

      // Derive endMonth
      let endMonth: string | null = a.endMonth ?? null;
      if (!endMonth) {
        const ed = parseDate(a.endDate ?? a.departureDate ?? a.terminationDate);
        if (ed) endMonth = toYearMonth(ed);
      }
      // If still no endMonth but status is inactive, skip — we don't know when they left
      // (don't fabricate an endMonth for inactive agents without a date)

      // Year-end active: activated by Dec of this year AND (no end date OR ended after Dec)
      const activatedByYearEnd = activationMonth <= yearEndYM;
      const stillActiveAtYearEnd = !endMonth || endMonth > yearEndYM;
      if (activatedByYearEnd && stillActiveAtYearEnd) yearEndActive++;

      // New hires: activated during this year (activationMonth starts with this year)
      if (activationMonth >= yearStartYM && activationMonth <= yearEndYM) ytdNewHires++;

      // Departures: ended during this year
      if (endMonth && endMonth >= yearStartYM && endMonth <= yearEndYM) ytdDepartures++;
    }

    const netGain = ytdNewHires - ytdDepartures;

    // ── 4. Compute grades ────────────────────────────────────────────────────
    const agentsGrade = yearlyActiveAgentsGoal
      ? calcGrade(yearEndActive, yearlyActiveAgentsGoal)
      : null;

    const netGainGrade = netGainGoal != null && netGainGoal > 0
      ? calcGrade(Math.max(0, netGain), netGainGoal)
      : netGainGoal === 0
        ? { pct: netGain === 0 ? 100 : netGain > 0 ? 100 : 0, grade: netGain >= 0 ? 'A' : 'F' }
        : null;

    const hiresGrade = yearlyNewHiresGoal
      ? calcGrade(ytdNewHires, yearlyNewHiresGoal)
      : null;

    // ── 5. Monthly active agent counts for the year (for chart display) ──────
    // Build month-by-month active count for the selected past year
    const monthlyActive: Array<{ month: number; label: string; totalActive: number }> = [];
    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      let count = 0;
      for (const doc of agentsSnap.docs) {
        if (demoIds.has(doc.id)) continue;
        const a = doc.data();
        let activationMonth: string | null = a.activationMonth ?? null;
        if (!activationMonth) {
          const sd = parseDate(a.startDate ?? a.joinDate);
          if (sd) activationMonth = toYearMonth(sd);
        }
        if (!activationMonth || activationMonth > ym) continue;
        let endMonth: string | null = a.endMonth ?? null;
        if (!endMonth) {
          const ed = parseDate(a.endDate ?? a.departureDate ?? a.terminationDate);
          if (ed) endMonth = toYearMonth(ed);
        }
        if (endMonth && endMonth <= ym) continue;
        count++;
      }
      monthlyActive.push({ month: m, label: monthLabels[m - 1], totalActive: count });
    }

    return NextResponse.json({
      ok: true,
      year,
      goals: {
        yearlyActiveAgentsGoal,
        yearlyNewHiresGoal,
        netGainGoal,
      },
      actuals: {
        yearEndActive,
        ytdNewHires,
        ytdDepartures,
        netGain,
      },
      grades: {
        agents: agentsGrade,
        hires: hiresGrade,
        netGain: netGainGrade,
      },
      monthlyActive,
    });
  } catch (err: any) {
    console.error('[year-scorecard GET]', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

// ── POST — Save historical year goals ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAdmin(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const body = await req.json();
    const { year, yearlyActiveAgentsGoal, yearlyNewHiresGoal, netGainGoal } = body as {
      year: number;
      yearlyActiveAgentsGoal?: number | null;
      yearlyNewHiresGoal?: number | null;
      netGainGoal?: number | null;
    };
    if (!year) return jsonError(400, 'year required');

    await adminDb.collection('recruitingPlans').doc(String(year)).set({
      year,
      yearlyActiveAgentsGoal: yearlyActiveAgentsGoal ?? null,
      yearlyNewHiresGoal: yearlyNewHiresGoal ?? null,
      netGainGoal: netGainGoal ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: decoded.uid,
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[year-scorecard POST]', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
