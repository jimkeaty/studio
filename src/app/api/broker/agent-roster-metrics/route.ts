// GET /api/broker/agent-roster-metrics
// Returns YTD performance grades for ALL active agents — used by the Recruiting & Dev admin page
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function getBearerToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

function asNumber(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toYmd(value: any): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function gradeFromPerformance(perf: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (perf >= 90) return 'A';
  if (perf >= 80) return 'B';
  if (perf >= 70) return 'C';
  if (perf >= 60) return 'D';
  return 'F';
}

function perf(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Number(((actual / target) * 100).toFixed(1));
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

function getTransactionNet(t: any): number {
  const splitNet = asNumber(t?.splitSnapshot?.agentNetCommission);
  if (splitNet > 0) return splitNet;
  return asNumber(t?.commission);
}

export interface AgentRosterRow {
  agentId: string;
  displayName: string;
  teamName: string | null;
  teamId: string | null;
  teamRole: string | null;
  startDate: string | null;
  isGracePeriod: boolean;

  // Grace period tracking
  gracePeriodDaysElapsed: number | null;   // days since start date
  gracePeriodDaysRemaining: number | null; // days left in 90-day window
  gracePeriodMonth: number | null;         // which month they are in (1, 2, 3)
  hasFirstDeal: boolean;                   // has at least 1 closed or under_contract/pending
  graceStatus: 'in_grace' | 'grace_on_track' | 'grace_at_risk' | 'grace_passed' | 'established';
  // in_grace = within 90 days, no deal yet (needs attention)
  // grace_on_track = within 90 days, has a deal (doing great)
  // grace_at_risk = in month 3 with no deal (urgent attention)
  // grace_passed = past 90 days, had grace period
  // established = not in grace period / veteran agent

  // Engagement
  engagementsActual: number;
  engagementsGoal: number;
  engagementsDelta: number;
  engagementsPerf: number;
  engagementsGrade: string;

  // Appointments Held
  appointmentsHeldActual: number;
  appointmentsHeldGoal: number;
  appointmentsDelta: number;
  appointmentsPerf: number;
  appointmentsGrade: string;

  // Income (closed only)
  incomeActual: number;
  incomeGoal: number;
  incomeDelta: number;
  incomePerf: number;
  incomeGrade: string;

  // Income with pendings
  incomePipelineActual: number;
  incomePipelinePerf: number;
  incomePipelineGrade: string;

  // Extra context
  closedDeals: number;
  pendingDeals: number;
  closedVolume: number;
  pendingVolume: number;
  annualIncomeGoal: number;
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const yearNum = Number(searchParams.get('year')) || new Date().getFullYear();
    const teamFilter = searchParams.get('teamId') || null;

    // ── 1. Get all active agent profiles ──────────────────────────────────
    let profileQuery: FirebaseFirestore.Query = adminDb.collection('agentProfiles')
      .where('status', '==', 'active');
    if (teamFilter) {
      profileQuery = profileQuery.where('primaryTeamId', '==', teamFilter);
    }
    const profileSnap = await profileQuery.get();

    // Also get profiles without status field (treat as active)
    let noStatusQuery: FirebaseFirestore.Query = adminDb.collection('agentProfiles');
    if (teamFilter) {
      noStatusQuery = noStatusQuery.where('primaryTeamId', '==', teamFilter);
    }
    const allProfileSnap = await noStatusQuery.get();

    // Merge: use active ones + ones without a status field
    const profileMap = new Map<string, any>();
    for (const doc of profileSnap.docs) {
      profileMap.set(doc.id, { id: doc.id, ...doc.data() });
    }
    for (const doc of allProfileSnap.docs) {
      if (!profileMap.has(doc.id)) {
        const d = doc.data();
        if (!d.status || d.status === 'active') {
          profileMap.set(doc.id, { id: doc.id, ...d });
        }
      }
    }

    const agents = [...profileMap.values()];
    if (agents.length === 0) {
      return NextResponse.json({ ok: true, year: yearNum, agents: [] });
    }

    // ── 2. Date calculations ──────────────────────────────────────────────
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const yearStart = new Date(Date.UTC(yearNum, 0, 1));
    const yearEnd = new Date(Date.UTC(yearNum, 11, 31, 23, 59, 59, 999));
    const asOf = todayUtc.getTime() <= yearEnd.getTime() ? todayUtc : yearEnd;

    // ── 3. Batch-fetch all transactions for the year ──────────────────────
    const txSnap = await adminDb.collection('transactions')
      .where('year', '==', yearNum)
      .get();

    // Group transactions by agentId
    const txByAgent = new Map<string, any[]>();
    for (const doc of txSnap.docs) {
      const t = doc.data();
      const aid = t.agentId;
      if (!aid) continue;
      if (!txByAgent.has(aid)) txByAgent.set(aid, []);
      txByAgent.get(aid)!.push(t);
    }

    // ── 4. Batch-fetch all daily_activity for the year ────────────────────
    const startYmd = `${yearNum}-01-01`;
    const endYmd = toYmd(asOf) || `${yearNum}-12-31`;
    const actSnap = await adminDb.collection('daily_activity')
      .where('date', '>=', startYmd)
      .where('date', '<=', endYmd)
      .get();

    const actByAgent = new Map<string, { calls: number; engagements: number; apptSet: number; apptHeld: number; contracts: number }>();
    for (const doc of actSnap.docs) {
      const a = doc.data();
      const aid = a.agentId;
      if (!aid) continue;
      if (!actByAgent.has(aid)) actByAgent.set(aid, { calls: 0, engagements: 0, apptSet: 0, apptHeld: 0, contracts: 0 });
      const bucket = actByAgent.get(aid)!;
      bucket.calls += asNumber(a.callsCount);
      bucket.engagements += asNumber(a.engagementsCount);
      bucket.apptSet += asNumber(a.appointmentsSetCount);
      bucket.apptHeld += asNumber(a.appointmentsHeldCount);
      bucket.contracts += asNumber(a.contractsWrittenCount);
    }

    // ── 5. Batch-fetch all business plans for the year ────────────────────
    const plansSnap = await adminDb.collection('dashboards')
      .doc(String(yearNum))
      .collection('agent')
      .get();

    // For each agent doc, get the plans/plan sub-doc
    const planByAgent = new Map<string, any>();
    const planPromises: Promise<void>[] = [];
    for (const agentDoc of plansSnap.docs) {
      planPromises.push(
        agentDoc.ref.collection('plans').doc('plan').get().then(planDoc => {
          if (planDoc.exists) {
            planByAgent.set(agentDoc.id, planDoc.data());
          }
        })
      );
    }
    await Promise.all(planPromises);

    // ── 6. Batch-fetch agent goals from brokerCommandGoals ────────────────
    const goalsSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', yearNum)
      .get();

    const goalsBySegment = new Map<string, { grossMargin: number; volume: number; salesCount: number }>();
    for (const doc of goalsSnap.docs) {
      const g = doc.data();
      const seg = g.segment as string;
      if (!seg) continue;
      if (!goalsBySegment.has(seg)) goalsBySegment.set(seg, { grossMargin: 0, volume: 0, salesCount: 0 });
      const bucket = goalsBySegment.get(seg)!;
      bucket.grossMargin += asNumber(g.grossMarginGoal);
      bucket.volume += asNumber(g.volumeGoal);
      bucket.salesCount += asNumber(g.salesCountGoal);
    }

    // ── 7. Build each agent's row ─────────────────────────────────────────
    const rows: AgentRosterRow[] = [];

    for (const agent of agents) {
      const uid = agent.agentId || agent.id;
      const plan = planByAgent.get(uid) || {};
      const activity = actByAgent.get(uid) || { calls: 0, engagements: 0, apptSet: 0, apptHeld: 0, contracts: 0 };
      const transactions = txByAgent.get(uid) || [];

      // Grace period check — enhanced tracking
      let isGracePeriod = false;
      let gracePeriodDaysElapsed: number | null = null;
      let gracePeriodDaysRemaining: number | null = null;
      let gracePeriodMonth: number | null = null;
      const agentStartDate = toDate(agent.startDate);

      if (agentStartDate) {
        const daysSince = Math.floor((todayUtc.getTime() - agentStartDate.getTime()) / (1000 * 60 * 60 * 24));
        gracePeriodDaysElapsed = Math.max(0, daysSince);
        if (daysSince <= 90) {
          isGracePeriod = true;
          gracePeriodDaysRemaining = Math.max(0, 90 - daysSince);
          gracePeriodMonth = Math.min(3, Math.ceil(Math.max(1, daysSince) / 30));
        } else {
          gracePeriodDaysRemaining = 0;
        }
      } else if (agent.gracePeriodEnabled === true) {
        // No start date but flagged as grace — treat as in grace
        isGracePeriod = true;
      }

      // Effective start for prorating
      const planStart = toDate(plan.resetStartDate || plan.planStartDate || `${yearNum}-01-01`) || yearStart;
      const effectiveStart = planStart.getTime() >= yearStart.getTime() ? planStart : yearStart;
      const elapsedWorkdays = asOf.getTime() < effectiveStart.getTime()
        ? 0
        : countWeekdaysInclusive(effectiveStart, asOf);

      const totalWorkdaysInYear = Math.max(1,
        asNumber(plan.assumptions?.workingDaysPerMonth) * 12 - asNumber(plan.assumptions?.weeksOff) * 5
      );

      // Engagement & appointment targets (prorated)
      const dailyEngTarget = asNumber(plan.calculatedTargets?.engagements?.daily);
      const dailyApptHeldTarget = asNumber(plan.calculatedTargets?.appointmentsHeld?.daily);
      const engTarget = Number((dailyEngTarget * elapsedWorkdays).toFixed(2));
      const apptHeldTarget = Number((dailyApptHeldTarget * elapsedWorkdays).toFixed(2));

      // Income goals
      const annualIncomeGoal = asNumber(plan.annualIncomeGoal);
      const expectedYTDIncome = totalWorkdaysInYear > 0
        ? Number(((annualIncomeGoal * elapsedWorkdays) / totalWorkdaysInYear).toFixed(2))
        : 0;

      // Process transactions
      let netEarned = 0;
      let netPending = 0;
      let closedUnits = 0;
      let pendingUnits = 0;
      let closedVolume = 0;
      let pendingVolume = 0;

      for (const t of transactions) {
        const status = String(t.status || '').trim();
        const net = getTransactionNet(t);
        const dealValue = asNumber(t.dealValue);

        if (status === 'closed') {
          const d = toDate(t.closedDate || t.closingDate);
          if (!d) continue;
          const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          if (dUtc.getTime() >= effectiveStart.getTime() && dUtc.getTime() <= asOf.getTime()) {
            netEarned += net;
            closedUnits += 1;
            closedVolume += dealValue;
          }
        } else if (status === 'pending' || status === 'under_contract') {
          const d = toDate(t.contractDate || t.pendingDate || t.underContractDate);
          if (!d) continue;
          const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          if (dUtc.getTime() >= effectiveStart.getTime() && dUtc.getTime() <= asOf.getTime()) {
            netPending += net;
            pendingUnits += 1;
            pendingVolume += dealValue;
          }
        }
      }

      const pipeline = netEarned + netPending;
      const hasFirstDeal = closedUnits > 0 || pendingUnits > 0;

      // Grace status determination
      let graceStatus: AgentRosterRow['graceStatus'] = 'established';
      if (isGracePeriod) {
        if (hasFirstDeal) {
          graceStatus = 'grace_on_track';
        } else if (gracePeriodMonth === 3) {
          graceStatus = 'grace_at_risk'; // month 3, no deal — urgent
        } else {
          graceStatus = 'in_grace';
        }
      } else if (gracePeriodDaysElapsed !== null && gracePeriodDaysElapsed > 90) {
        graceStatus = 'grace_passed'; // was new, now past 90 days
      }

      // Grades
      const engPerf = perf(activity.engagements, engTarget);
      const apptPerf = perf(activity.apptHeld, apptHeldTarget);
      const incPerf = perf(netEarned, expectedYTDIncome);
      const pipePerf = perf(pipeline, expectedYTDIncome);

      rows.push({
        agentId: uid,
        displayName: agent.displayName || agent.name || uid,
        teamName: agent.teamName || null,
        teamId: agent.primaryTeamId || null,
        teamRole: agent.teamRole || null,
        startDate: toYmd(agent.startDate) || null,
        isGracePeriod,

        gracePeriodDaysElapsed,
        gracePeriodDaysRemaining,
        gracePeriodMonth,
        hasFirstDeal,
        graceStatus,

        engagementsActual: activity.engagements,
        engagementsGoal: Number(engTarget.toFixed(0)),
        engagementsDelta: Number((activity.engagements - engTarget).toFixed(0)),
        engagementsPerf: engPerf,
        engagementsGrade: isGracePeriod ? 'A' : gradeFromPerformance(engPerf),

        appointmentsHeldActual: activity.apptHeld,
        appointmentsHeldGoal: Number(apptHeldTarget.toFixed(0)),
        appointmentsDelta: Number((activity.apptHeld - apptHeldTarget).toFixed(0)),
        appointmentsPerf: apptPerf,
        appointmentsGrade: isGracePeriod ? 'A' : gradeFromPerformance(apptPerf),

        incomeActual: Number(netEarned.toFixed(2)),
        incomeGoal: Number(expectedYTDIncome.toFixed(2)),
        incomeDelta: Number((netEarned - expectedYTDIncome).toFixed(2)),
        incomePerf: incPerf,
        incomeGrade: isGracePeriod ? 'A' : gradeFromPerformance(incPerf),

        incomePipelineActual: Number(pipeline.toFixed(2)),
        incomePipelinePerf: pipePerf,
        incomePipelineGrade: isGracePeriod ? 'A' : gradeFromPerformance(pipePerf),

        closedDeals: closedUnits,
        pendingDeals: pendingUnits,
        closedVolume: Number(closedVolume.toFixed(2)),
        pendingVolume: Number(pendingVolume.toFixed(2)),
        annualIncomeGoal,
      });
    }

    // Sort by engagement grade (worst first so admin sees struggling agents)
    const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
    rows.sort((a, b) => (gradeOrder[a.engagementsGrade] ?? 5) - (gradeOrder[b.engagementsGrade] ?? 5));

    // ── 8. Summary stats ──────────────────────────────────────────────────
    const totalAgents = rows.length;
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of rows) {
      gradeDistribution[r.incomeGrade as keyof typeof gradeDistribution] =
        (gradeDistribution[r.incomeGrade as keyof typeof gradeDistribution] || 0) + 1;
    }

    const struggling = rows.filter(r => r.incomeGrade === 'D' || r.incomeGrade === 'F').length;
    const onTrack = rows.filter(r => r.incomeGrade === 'A' || r.incomeGrade === 'B').length;

    // Grace period summary
    const inGrace = rows.filter(r => r.isGracePeriod);
    const graceOnTrack = rows.filter(r => r.graceStatus === 'grace_on_track').length;
    const graceAtRisk = rows.filter(r => r.graceStatus === 'grace_at_risk').length;
    const graceNoDeal = rows.filter(r => r.graceStatus === 'in_grace').length;

    return NextResponse.json({
      ok: true,
      year: yearNum,
      agents: rows,
      summary: {
        totalAgents,
        gradeDistribution,
        struggling,
        onTrack,
        avgEngagementPerf: totalAgents > 0 ? Number((rows.reduce((s, r) => s + r.engagementsPerf, 0) / totalAgents).toFixed(1)) : 0,
        avgIncomePerf: totalAgents > 0 ? Number((rows.reduce((s, r) => s + r.incomePerf, 0) / totalAgents).toFixed(1)) : 0,
        // Grace period summary
        totalInGrace: inGrace.length,
        graceOnTrack,
        graceAtRisk,
        graceNoDeal,
        established: totalAgents - inGrace.length,
      },
    });
  } catch (err: any) {
    console.error('[agent-roster-metrics]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
