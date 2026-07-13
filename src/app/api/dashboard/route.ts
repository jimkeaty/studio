// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isAdminLike } from '@/lib/auth/staffAccess';
import { getAnniversaryCycle, isInCycle, formatCycleLabel } from '@/lib/agents/anniversaryCycle';
import type { AgentDashboardData, BusinessPlan } from "@/lib/types";
import { todayUtcInCompanyTz } from '@/lib/config';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function planDocRef(db: FirebaseFirestore.Firestore, uid: string, year: string) {
  return db
    .collection("dashboards")
    .doc(year)
    .collection("agent")
    .doc(uid)
    .collection("plans")
    .doc("plan");
}

function parseYear(req: NextRequest): string {
  const { searchParams } = new URL(req.url);
  const fallback = String(new Date().getFullYear());
  const year = searchParams.get("year") || fallback;
  const n = Number(year);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return fallback;
  return String(n);
}

function asNumber(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function toYmd(value: any): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function monthLabel(index: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

function endOfYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
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

function gradeFromPerformance(performance: number): "A" | "B" | "C" | "D" | "F" {
  if (performance >= 90) return "A";
  if (performance >= 80) return "B";
  if (performance >= 70) return "C";
  if (performance >= 60) return "D";
  return "F";
}

function performance(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Number(((actual / target) * 100).toFixed(1));
}

function getTransactionNet(t: any): number {
  // Best: use the split snapshot from auto-calculation
  const splitNet = asNumber(t?.splitSnapshot?.agentNetCommission);
  if (splitNet > 0) return splitNet;
  // Fallback: agentNetCommission stored directly on the transaction
  const directNet = asNumber(t?.agentNetCommission);
  if (directNet > 0) return directNet;
  // Fallback: netCommission field
  const netComm = asNumber(t?.netCommission);
  if (netComm > 0) return netComm;
  // Last resort: gross commission
  return asNumber(t?.commission);
}

function getTransactionDateForEarned(t: any): Date | null {
  return toDate(t?.closedDate || t?.closingDate || null);
}

function getTransactionDateForPending(t: any): Date | null {
  // Try all date fields that indicate when a deal went pending.
  // MLS-imported transactions store the contract date as 'underContractDate';
  // manually entered transactions use 'contractDate'.
  // Fall back to listingDate or createdAt so a pending deal is never silently
  // dropped from the chart just because a contract date wasn't entered yet.
  return toDate(
    t?.contractDate ||
    t?.pendingDate ||
    t?.underContractDate ||
    t?.listingDate ||
    t?.createdAt ||
    null
  );
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    // Allow admin (or team leader viewing own team members) to view another agent's dashboard via ?viewAs=agentId
    const reqParams = new URL(req.url).searchParams;
    const viewAs = reqParams.get('viewAs');
    const callerIsAdmin = await isAdminLike(decoded.uid);

    let uid = decoded.uid;
    if (viewAs) {
      if (callerIsAdmin) {
        uid = viewAs;
      } else {
        // Check if caller is a team leader and viewAs target is on their team
        try {
          const callerProfileSnap = await adminDb.collection('agentProfiles')
            .where('firebaseUid', '==', decoded.uid).limit(1).get();
          const callerProfile = callerProfileSnap.empty ? null : callerProfileSnap.docs[0].data();
          if (callerProfile?.teamRole === 'leader' && callerProfile?.primaryTeamId) {
            const targetProfileSnap = await adminDb.collection('agentProfiles')
              .where('primaryTeamId', '==', callerProfile.primaryTeamId)
              .where('agentId', '==', viewAs).limit(1).get();
            const targetByUid = targetProfileSnap.empty
              ? await adminDb.collection('agentProfiles').where('primaryTeamId', '==', callerProfile.primaryTeamId).where('firebaseUid', '==', viewAs).limit(1).get()
              : null;
            if (!targetProfileSnap.empty || (targetByUid && !targetByUid.empty)) {
              uid = viewAs; // team leader can view this team member
            }
          }
        } catch { /* non-fatal — fall back to own uid */ }
      }
    }

    const year = parseYear(req);
    const yearNum = Number(year);

    // ── Phase 1: Fetch plan + agent profile in parallel ────────────────
    const [planSnap, agentProfileData] = await Promise.all([
      planDocRef(adminDb, uid, year).get(),
(async () => {
        try {
          // Strategy 1: uid IS the Firebase UID (doc ID)
          const profileByIdSnap = await adminDb.collection('agentProfiles').doc(uid).get();
          if (profileByIdSnap.exists) return { data: profileByIdSnap.data(), docId: profileByIdSnap.id };

          // Strategy 2: Search by agentId slug field
          const profileByAgentIdSnap = await adminDb.collection('agentProfiles')
            .where('agentId', '==', uid)
            .limit(1)
            .get();
          if (!profileByAgentIdSnap.empty) {
            const d = profileByAgentIdSnap.docs[0];
            return { data: d.data(), docId: d.id };
          }

          // Strategy 3: Match by email from auth token.
          // IMPORTANT: skip when viewAs is active — decoded.email belongs to the admin caller,
          // not the agent being viewed. Using it would match the admin's own profile.
          const isViewingAs = !!(viewAs && callerIsAdmin);
          if (!isViewingAs) {
            const email = decoded.email || '';
            if (email) {
              const profileByEmailSnap = await adminDb.collection('agentProfiles')
                .where('email', '==', email)
                .limit(1)
                .get();
              if (!profileByEmailSnap.empty) {
                const d = profileByEmailSnap.docs[0];
                return { data: d.data(), docId: d.id };
              }
            }
          }

          // Strategy 4: Query by firebaseUid field — handles agents whose profile doc ID is a slug
          // and whose email may differ from the auth token (e.g. profile email not yet synced).
          const profileByFirebaseUidSnap = await adminDb.collection('agentProfiles')
            .where('firebaseUid', '==', uid)
            .limit(1)
            .get();
          if (!profileByFirebaseUidSnap.empty) {
            const d = profileByFirebaseUidSnap.docs[0];
            return { data: d.data(), docId: d.id };
          }

          return null;
        } catch (err) {
          console.warn('[dashboard] Failed to fetch agent profile:', err);
          return null;
        }
      })(),
    ]);

    // Unwrap profile result — now returns { data, docId } to get the Firebase UID
    const agentProfileDocId: string | null = (agentProfileData as any)?.docId ?? null;
    const agentFirebaseUid: string = agentProfileDocId ?? uid;
    // Unwrap to get actual profile fields
    const agentProfile: any = (agentProfileData as any)?.data ?? agentProfileData ?? null;
    // Write-back: stamp firebaseUid onto the profile doc so future lookups hit Strategy 1 or 4 directly.
    // Also correct it if it was set to the profile doc ID (a common placeholder that's NOT the real Auth UID).
    // Only do this for direct agent logins (not admin viewAs) to avoid stamping the admin's UID.
    const isViewingAsForWriteback = !!(viewAs && callerIsAdmin);
    if (agentProfileDocId && agentProfile && uid && !isViewingAsForWriteback) {
      const existingFirebaseUid = agentProfile.firebaseUid;
      const needsUpdate = !existingFirebaseUid || existingFirebaseUid === agentProfileDocId;
      if (needsUpdate) {
        try {
          await adminDb.collection('agentProfiles').doc(agentProfileDocId).update({ firebaseUid: uid });
        } catch { /* non-fatal */ }
      }
    }

    const plan = (planSnap.exists ? (planSnap.data() ?? {}) : {}) as Partial<BusinessPlan>;

    const yearStart = startOfYear(yearNum);
    const yearEnd = endOfYear(yearNum);

    // Use company timezone (America/Chicago) so that "today" rolls over at
    // midnight CDT/CST, not midnight UTC. Without this, agents active after
    // 7 PM CDT would see tomorrow's goal added to today's dashboard.
    const todayUtc = todayUtcInCompanyTz();
    const asOf = minDate(todayUtc, yearEnd);

    // ── Dual-clock: separate start dates for financial vs KPI metrics ──────
    // financialStartDate controls: net income, volume, closed deals grading
    // kpiStartDate controls:       calls, engagements, appointments, contracts
    // Both use rolling-12-month windows from their start date.
    // Legacy fallback: use resetStartDate ?? planStartDate ?? Jan 1 for both.
    const legacyStart = plan.resetStartDate || plan.planStartDate || `${year}-01-01`;
    const rawFinancialStart = (plan as any).financialStartDate || legacyStart;
    const rawKpiStart = (plan as any).kpiStartDate || legacyStart;

    // Helper: parse a date string and clamp to a rolling-12-month window
    // The window runs from startDate to startDate+12months; we grade within it.
    // For calendar-year plans (Jan 1 start), the window is Jan 1 – Dec 31 of the plan year.
    const resolveEffectiveStart = (rawDate: string): Date => {
      const d = toDate(rawDate);
      if (!d) return yearStart;
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };

    // Financial effective start: when to begin counting net income, volume, deals
    const financialEffectiveStart = resolveEffectiveStart(rawFinancialStart);
    // KPI effective start: when to begin counting calls, engagements, appointments
    const kpiEffectiveStart = resolveEffectiveStart(rawKpiStart);

    // For backward compat: effectiveStart = financialEffectiveStart (used in transaction queries)
    const effectiveStart = financialEffectiveStart;

    // Rolling-12 window end dates
    const financialWindowEnd = new Date(Date.UTC(
      financialEffectiveStart.getUTCFullYear(),
      financialEffectiveStart.getUTCMonth() + 12,
      financialEffectiveStart.getUTCDate()
    ));
    const kpiWindowEnd = new Date(Date.UTC(
      kpiEffectiveStart.getUTCFullYear(),
      kpiEffectiveStart.getUTCMonth() + 12,
      kpiEffectiveStart.getUTCDate()
    ));

    // Workdays in each rolling-12 window
    const workdaysPerMonth = Math.max(1, asNumber(plan.assumptions?.workingDaysPerMonth));
    const weeksOff = asNumber(plan.assumptions?.weeksOff);
    const totalWorkdaysInRolling12 = Math.max(1, workdaysPerMonth * 12 - weeksOff * 5);

    // Elapsed workdays from each clock's start to today
    const financialElapsedWorkdays =
      asOf.getTime() < financialEffectiveStart.getTime()
        ? 0
        : countWeekdaysInclusive(financialEffectiveStart, minDate(asOf, financialWindowEnd));
    const kpiElapsedWorkdays =
      asOf.getTime() < kpiEffectiveStart.getTime()
        ? 0
        : countWeekdaysInclusive(kpiEffectiveStart, minDate(asOf, kpiWindowEnd));

    // Legacy: keep elapsedWorkdays = financialElapsedWorkdays for backward compat
    const elapsedWorkdays = financialElapsedWorkdays;

    // Legacy: keep for backward compat (used in goalFloorMonth below)
    const measurementMode = rawFinancialStart.endsWith('-01-01') ? 'calendar_year' : 'plan_start';

    const annualIncomeGoal = asNumber(plan.annualIncomeGoal);
    // Initial estimate using workday proration; will be overridden by actual
    // monthly goals from brokerCommandGoals if they exist (see below).
    let expectedYTDIncomeGoal = Number(
      ((annualIncomeGoal * financialElapsedWorkdays) / totalWorkdaysInRolling12).toFixed(2)
    );

    // Prorate a yearly goal by elapsed workdays on the FINANCIAL clock
    const prorateFinancial = (yearly: number) =>
      totalWorkdaysInRolling12 > 0
        ? Math.ceil((yearly * financialElapsedWorkdays) / totalWorkdaysInRolling12)
        : 0;

    // Prorate a yearly goal by elapsed workdays on the KPI clock
    const prorateKpi = (yearly: number) =>
      totalWorkdaysInRolling12 > 0
        ? Math.ceil((yearly * kpiElapsedWorkdays) / totalWorkdaysInRolling12)
        : 0;

    // Legacy alias: prorateYearly now uses financial clock (for income/volume/deals)
    const prorateYearly = prorateFinancial;

    const dailyEngagementTarget = asNumber(plan.calculatedTargets?.engagements?.daily);
    const engagementGoalToDate = prorateKpi(asNumber(plan.calculatedTargets?.engagements?.yearly));

    // ── Phase 2: Fetch transactions, daily activity, and goals in parallel ─
    // Use the resolved Firebase UID (not the slug) for goal segment lookup
    const goalSegment = `agent_${agentFirebaseUid}`;

    // Transactions may be stored under Firebase UID OR agent slug (imported via admin).
    // Query both to avoid missing deals.
    const txQueryIds = new Set([uid]);
    if (agentProfileDocId && agentProfileDocId !== uid) txQueryIds.add(agentProfileDocId);
    const _ap: any = (agentProfileData as any)?.data ?? agentProfileData ?? null;
    if (_ap?.agentId && _ap.agentId !== uid) txQueryIds.add(String(_ap.agentId));
    const txQueryIdList = Array.from(txQueryIds);

    // Build the full set of agentId values to query for daily_activity
    // (same multi-ID strategy used for transactions — covers Firebase UID, slug, and profile docId)
    const activityQueryIds = new Set([uid]);
    if (agentFirebaseUid && agentFirebaseUid !== uid) activityQueryIds.add(agentFirebaseUid);
    if (agentProfileDocId && agentProfileDocId !== uid) activityQueryIds.add(agentProfileDocId);
    if (_ap?.agentId && _ap.agentId !== uid) activityQueryIds.add(String(_ap.agentId));
    // Also include the agent's stored firebaseUid field — critical for admin viewAs when the
    // viewAs param is a slug but daily_activity docs were saved under the agent's Firebase UID.
    if (_ap?.firebaseUid && _ap.firebaseUid !== uid) activityQueryIds.add(String(_ap.firebaseUid));
    const activityIdList = Array.from(activityQueryIds);

    const txDocMap = new Map();
    const activityDocMap = new Map<string, any>();

    const [activitySnapsArray, goalsSnap, altGoalsSnap] = await Promise.all([
      // Query daily_activity for ALL resolved agentId values and merge by doc ID
      Promise.all(
        activityIdList.map(agentIdVal =>
          adminDb
            .collection("daily_activity")
            .where("agentId", "==", agentIdVal)
            .where("date", ">=", toYmd(kpiEffectiveStart)) // KPI clock
            .where("date", "<=", toYmd(minDate(asOf, kpiWindowEnd)))
            .get()
            .catch(e => { console.warn('[dashboard] daily_activity query failed for '+agentIdVal, e); return null; })
        )
      ),
      adminDb.collection("brokerCommandGoals")
        .where("year", "==", yearNum)
        .where("segment", "==", goalSegment)
        .get(),
      // Fallback: also query by the caller's Firebase UID in case goals were saved under a different ID.
      // We try uid (Firebase UID) as the alternate segment key; additional fallbacks are handled
      // in the merge loop below using the full set of resolved IDs.
      uid !== agentFirebaseUid
        ? adminDb.collection("brokerCommandGoals")
            .where("year", "==", yearNum)
            .where("segment", "==", `agent_${uid}`)
            .get()
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    // Merge all daily_activity results — deduplicate by doc ID
    for (const snap of activitySnapsArray) {
      if (!snap) continue;
      for (const doc of snap.docs) {
        if (!activityDocMap.has(doc.id)) activityDocMap.set(doc.id, doc.data() || {});
      }
    }
    // Wrap in a compatible object for the existing activitySnap.docs usage below
    const activitySnap = { docs: Array.from(activityDocMap.entries()).map(([id, data]) => ({ id, data: () => data })) };

    // Fetch year-matched closed transactions AND all open-status transactions regardless of year.
    // Pending/active transactions often have no 'year' field (they haven't closed yet), so a
    // year-only query silently misses them — exactly why charts showed blank pending data.
    // This mirrors the dual-query strategy used by the admin transaction ledger.
    const OPEN_STATUSES = ['active', 'pending', 'under_contract', 'coming_soon', 'temp_off_market', 'temporary_off_market'];
    await Promise.all(
      txQueryIdList.map(async (agentIdVal) => {
        try {
          const [yearSnap, openSnap] = await Promise.all([
            adminDb.collection("transactions").where("agentId","==",agentIdVal).where("year","==",yearNum).get(),
            adminDb.collection("transactions").where("agentId","==",agentIdVal).where("status","in",OPEN_STATUSES).get(),
          ]);
          for (const d of [...yearSnap.docs, ...openSnap.docs]) {
            if (!txDocMap.has(d.id)) txDocMap.set(d.id, d.data() || {});
          }
        } catch(e) { console.warn('[dashboard] tx query failed for '+agentIdVal, e); }
      })
    );
    const txDocs = Array.from(txDocMap.values());

    let netEarned = 0;
    let netPending = 0;

    const monthlyBuckets = Array.from({ length: 12 }, (_, idx) => ({
      month: monthLabel(idx),
      closed: 0,
      pending: 0,
      goal: 0,
    }));

    const monthlyGoal = asNumber(plan.calculatedTargets?.monthlyNetIncome);
    for (let i = 0; i < 12; i += 1) {
      monthlyBuckets[i].goal = monthlyGoal;
    }

    let closedUnits = 0;
    let pendingUnits = 0;
    let closedVolume = 0;
    let pendingVolume = 0;
    let totalGCI = 0;
    let grossGCIYTD = 0;
    let pendingGrossGCI = 0;
    let latestPendingCloseMonth = 0; // 1-based month of the latest pending expected close

    for (const t of txDocs) {
      const status = String(t.status || "").trim();
      const net = getTransactionNet(t);
      const dealValue = asNumber(t.salePrice ?? t.listPrice);
      const gci = asNumber(t.splitSnapshot?.grossCommission || t.commission);
      // Referral closings (closingType='referral') count toward net income but NOT
      // toward volume, unit count, or GCI — same treatment as broker recruiting incentives.
      const closingType = String((t as any).closingType || "").toLowerCase();
      const isReferralClosing = closingType === "referral";
         // Dual Agent counts as 2 sides (1 buyer + 1 listing)
      const isDual = closingType === "dual";
      const sideCount = isDual ? 2 : 1;
      if (status === "closed") {
        const d = getTransactionDateForEarned(t);
        if (!d) continue;
        const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const monthIndex = dUtc.getUTCMonth();
        monthlyBuckets[monthIndex].closed += net;
        if (
          dUtc.getTime() >= effectiveStart.getTime() &&
          dUtc.getTime() <= asOf.getTime()
        ) {
          netEarned += net;
          if (!isReferralClosing) {
            closedUnits += sideCount;
            closedVolume += dealValue;
            totalGCI += gci;
          }
          // grossGCIYTD is accumulated below using anniversary cycle filter
        }
      } else if (status === "pending" || status === "under_contract") {
        const d = getTransactionDateForPending(t);
        if (!d) continue;

        const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const monthIndex = dUtc.getUTCMonth();

        monthlyBuckets[monthIndex].pending += net;

        // Track expected close date for projection grading
        const expectedCloseDate = toDate(
          t.projectedCloseDate || t.closedDate || t.closingDate
        );
        if (expectedCloseDate) {
          const closeMonth = expectedCloseDate.getUTCMonth() + 1; // 1-based
          if (closeMonth > latestPendingCloseMonth) {
            latestPendingCloseMonth = closeMonth;
          }
        }

        if (
          dUtc.getTime() >= effectiveStart.getTime() &&
          dUtc.getTime() <= asOf.getTime()
        ) {
          netPending += net;
          if (!isReferralClosing) {
            pendingUnits += sideCount;
            pendingVolume += dealValue;
            pendingGrossGCI += asNumber(
              t.splitSnapshot?.grossCommission
              || t.commission
            );
          }
        }
      }
    }

    let callsActual = 0;
    let engagementsActual = 0;
    let appointmentsSetActual = 0;
    let appointmentsHeldActual = 0;
    let contractsWrittenActual = 0;

    for (const doc of activitySnap.docs) {
      const a = doc.data() || {};
      callsActual += asNumber(a.callsCount);
      engagementsActual += asNumber(a.engagementsCount);
      appointmentsSetActual += asNumber(a.appointmentsSetCount);
      appointmentsHeldActual += asNumber(a.appointmentsHeldCount);
      contractsWrittenActual += asNumber(a.contractsWrittenCount);
    }

    // ── Overlay appointment counts from the appointments pipeline ──────────
    // Pipeline appointments (bulk-uploaded or manually added) live in the
    // appointments collection, not in daily_activity. Count them here and
    // use the higher of the two sources so manual edits are preserved.
    try {
      const apptPipelineSnaps = await Promise.all(
        activityIdList.map((agentIdVal: string) =>
          adminDb
            .collection('appointments')
            .where('agentId', '==', agentIdVal)
            .where('date', '>=', toYmd(kpiEffectiveStart)) // KPI clock
            .where('date', '<=', toYmd(minDate(asOf, kpiWindowEnd)))
            .get()
            .catch(() => null)
        )
      );
      const seenApptIds = new Set<string>();
      let pipelineSetTotal = 0;
      let pipelineHeldTotal = 0;
      for (const snap of apptPipelineSnaps) {
        if (!snap) continue;
        for (const doc of snap.docs) {
          if (seenApptIds.has(doc.id)) continue;
          seenApptIds.add(doc.id);
          const d = doc.data();
          if (d.pipelineStatus === 'trash') continue;
          // 'both' category counts as 2 appointments (1 buyer + 1 seller)
          const apptWeight = (d.category === 'both') ? 2 : 1;
          pipelineSetTotal += apptWeight;
          if (d.pipelineStatus === 'held') pipelineHeldTotal += apptWeight;
        }
      }
      // Use the higher of daily_activity vs pipeline
      appointmentsSetActual = Math.max(appointmentsSetActual, pipelineSetTotal);
      appointmentsHeldActual = Math.max(appointmentsHeldActual, pipelineHeldTotal);
    } catch {
      // Non-fatal — fall back to daily_activity totals only
    }

    const ytdTotalPotential = Number((netEarned + netPending).toFixed(2));
    const incomePerformance = performance(netEarned, expectedYTDIncomeGoal);
    const pipelinePerformance = performance(ytdTotalPotential, expectedYTDIncomeGoal);

    // Round up all activity targets to whole numbers — fractional goals (e.g. 2.3 appointments)
    // are not actionable and cause confusing decimals on the report card.
    // All targets now use yearly goal prorated by elapsed workdays (same as income goal).
    // This is immune to the old daily:0 bug and stays in sync with the saved business plan.
    // KPI targets use the KPI clock (calls, engagements, appointments, contracts)
    const callsTarget = prorateKpi(asNumber(plan.calculatedTargets?.calls?.yearly));
    const engagementsTarget = prorateKpi(asNumber(plan.calculatedTargets?.engagements?.yearly));
    const appointmentsSetTarget = prorateKpi(asNumber(plan.calculatedTargets?.appointmentsSet?.yearly));
    const appointmentsHeldTarget = prorateKpi(asNumber(plan.calculatedTargets?.appointmentsHeld?.yearly));
    const contractsWrittenTarget = prorateKpi(asNumber(plan.calculatedTargets?.contractsWritten?.yearly));
    // Closings use the FINANCIAL clock (it's a financial outcome)
    const closingsTarget = prorateFinancial(asNumber(plan.calculatedTargets?.closings?.yearly));

    const engagementDelta = Number((engagementsActual - engagementGoalToDate).toFixed(2));
    const catchUpWindowDays = 20;
    const behindAmount = Math.max(0, engagementGoalToDate - engagementsActual);
    const catchUpDailyRequired = Number(
      (asNumber(plan.calculatedTargets?.engagements?.daily) + behindAmount / catchUpWindowDays).toFixed(2)
    );

    // ── Grace period from agent profile (fetched in Phase 1) ───────────
    let isMetricsGracePeriod = false;
    if (agentProfile?.gracePeriodEnabled === true) {
      const startDate = toDate(agentProfile.startDate);
      if (startDate) {
        const daysSinceStart = Math.floor((todayUtc.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        isMetricsGracePeriod = daysSinceStart <= 90;
      } else {
        isMetricsGracePeriod = true; // gracePeriodEnabled but no start date → assume grace
      }
    }

    const dashboard: AgentDashboardData = {
      userId: uid,

      leadIndicatorGrade: gradeFromPerformance(performance(engagementsActual, engagementsTarget)),
      leadIndicatorPerformance: performance(engagementsActual, engagementsTarget),
      isLeadIndicatorGracePeriod: kpiElapsedWorkdays < 5,

      incomeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(incomePerformance),
      incomePerformance,
      isIncomeGracePeriod: financialElapsedWorkdays < 5,
      isMetricsGracePeriod,
      expectedYTDIncomeGoal,
      ytdTotalPotential,

      pipelineAdjustedIncome: {
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(pipelinePerformance),
        performance: pipelinePerformance,
      },

      kpis: {
        calls: {
          actual: callsActual,
          target: callsTarget,
          performance: performance(callsActual, callsTarget),
          grade: gradeFromPerformance(performance(callsActual, callsTarget)),
        },
        engagements: {
          actual: engagementsActual,
          target: engagementsTarget,
          performance: performance(engagementsActual, engagementsTarget),
          grade: gradeFromPerformance(performance(engagementsActual, engagementsTarget)),
        },
        appointmentsSet: {
          actual: appointmentsSetActual,
          target: appointmentsSetTarget,
          performance: performance(appointmentsSetActual, appointmentsSetTarget),
          grade: gradeFromPerformance(performance(appointmentsSetActual, appointmentsSetTarget)),
        },
        appointmentsHeld: {
          actual: appointmentsHeldActual,
          target: appointmentsHeldTarget,
          performance: performance(appointmentsHeldActual, appointmentsHeldTarget),
          grade: gradeFromPerformance(performance(appointmentsHeldActual, appointmentsHeldTarget)),
        },
        contractsWritten: {
          actual: contractsWrittenActual,
          target: contractsWrittenTarget,
          performance: performance(contractsWrittenActual, contractsWrittenTarget),
          grade: gradeFromPerformance(performance(contractsWrittenActual, contractsWrittenTarget)),
        },
        closings: {
          actual: closedUnits,
          target: closingsTarget,
          performance: performance(closedUnits, closingsTarget),
          grade: gradeFromPerformance(performance(closedUnits, closingsTarget)),
        },
      },

      netEarned: Number(netEarned.toFixed(2)),
      netPending: Number(netPending.toFixed(2)),

      monthlyIncome: monthlyBuckets.map((m) => ({
        month: m.month,
        closed: Number(m.closed.toFixed(2)),
        pending: Number(m.pending.toFixed(2)),
        goal: Number(m.goal.toFixed(2)),
      })),

      totalClosedIncomeForYear: Number(netEarned.toFixed(2)),
      totalPendingIncomeForYear: Number(netPending.toFixed(2)),
      totalIncomeWithPipelineForYear: Number(ytdTotalPotential.toFixed(2)),

      effectiveStartDate: toYmd(effectiveStart) || undefined,
      // Dual-clock: expose both start dates so the UI can show them on report cards
      financialStartDate: toYmd(financialEffectiveStart) || undefined,
      kpiStartDate: toYmd(kpiEffectiveStart) || undefined,
      annualIncomeGoal,
      projectedNetIncome: Number(ytdTotalPotential.toFixed(2)),
      incomeDeltaToGoal: Number((netEarned - expectedYTDIncomeGoal).toFixed(2)),

      engagementGoalToDate: Number(engagementGoalToDate.toFixed(2)),
      engagementDelta,
      catchUpWindowDays,
      catchUpDailyRequired,

      forecast: {
        projectedClosings: pendingUnits + closedUnits,
        paceBasedNetIncome: Number(ytdTotalPotential.toFixed(2)),
      },

      conversions: {
        callToEngagement: {
          actual: callsActual > 0 ? Number((engagementsActual / callsActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.callToEngagement),
        },
        engagementToAppointmentSet: {
          actual: engagementsActual > 0 ? Number((appointmentsSetActual / engagementsActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.engagementToAppointmentSet),
        },
        appointmentSetToHeld: {
          actual: appointmentsSetActual > 0 ? Number((appointmentsHeldActual / appointmentsSetActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.appointmentSetToHeld),
        },
        appointmentHeldToContract: {
          actual: appointmentsHeldActual > 0 ? Number((contractsWrittenActual / appointmentsHeldActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.appointmentHeldToContract),
        },
        contractToClosing: {
          actual: contractsWrittenActual > 0 ? Number((closedUnits / contractsWrittenActual).toFixed(3)) : null,
          plan: asNumber(plan.assumptions?.conversionRates?.contractToClosing),
        },
      },

      stats: {
        ytdVolume: Number(closedVolume.toFixed(2)),
        avgSalesPrice: closedUnits > 0 ? Number((closedVolume / closedUnits).toFixed(2)) : 0,
        buyerClosings: 0,
        sellerClosings: 0,
        renterClosings: 0,
        avgCommission: closedUnits > 0 ? Number((netEarned / closedUnits).toFixed(2)) : 0,
        engagementValue: engagementsActual > 0 ? Number((netEarned / engagementsActual).toFixed(2)) : 0,
        appointmentValue: appointmentsHeldActual > 0 ? Number((netEarned / appointmentsHeldActual).toFixed(2)) : 0,
        avgCommissionPct: closedVolume > 0 ? Number(((totalGCI / closedVolume) * 100).toFixed(2)) : 0,
        pendingVolume: Number(pendingVolume.toFixed(2)),
      },
    };

    // ── Process agent goals (volume + sales count + income) ────────────
    // Current month (1-based)
    const currentMonth = asOf.getUTCMonth() + 1; // 1=Jan, 12=Dec

    let yearlyVolumeGoal = 0;
    let yearlySalesGoal = 0;
    let yearlyIncomeGoalFromMonthly = 0;
    let volumeGoalToDate = 0;
    let salesGoalToDate = 0;
    let incomeGoalToDate = 0;
    // Projected goals: through the latest pending close month (for grading projections)
    const projectedMonth = Math.max(currentMonth, latestPendingCloseMonth);
    let projectedIncomeGoal = 0;
    let projectedVolumeGoal = 0;
    let projectedSalesGoal = 0;

    // Merge primary and fallback goal docs — deduplicate by month (primary takes precedence)
    const seenGoalMonths = new Set<number>();
    const allGoalDocs = [...goalsSnap.docs];
    if (altGoalsSnap) {
      for (const d of altGoalsSnap.docs) {
        const m = asNumber(d.data().month);
        if (!allGoalDocs.some(gd => asNumber(gd.data().month) === m)) {
          allGoalDocs.push(d);
        }
      }
    }
    // If still no goals found, try additional segment keys from the resolved profile
    // (agentId slug, profile doc ID) — covers goals saved while admin was impersonating
    if (allGoalDocs.length === 0) {
      const extraIds = new Set<string>();
      if (_ap?.agentId && _ap.agentId !== agentFirebaseUid && _ap.agentId !== uid) extraIds.add(String(_ap.agentId));
      if (agentProfileDocId && agentProfileDocId !== agentFirebaseUid && agentProfileDocId !== uid) extraIds.add(agentProfileDocId);
      if (_ap?.firebaseUid && _ap.firebaseUid !== agentFirebaseUid && _ap.firebaseUid !== uid) extraIds.add(String(_ap.firebaseUid));
      for (const extraId of extraIds) {
        const extraSnap = await adminDb.collection("brokerCommandGoals")
          .where("year", "==", yearNum)
          .where("segment", "==", `agent_${extraId}`)
          .get()
          .catch(() => null);
        if (extraSnap && !extraSnap.empty) {
          for (const d of extraSnap.docs) {
            if (!allGoalDocs.some(gd => asNumber(gd.data().month) === asNumber(d.data().month))) {
              allGoalDocs.push(d);
            }
          }
          if (allGoalDocs.length > 0) break;
        }
      }
    }
    // goalFloorMonth: only count goal months from the financial start month onward.
    // For Jan 1 financial start (calendar year), count all months from Jan 1.
    const financialStartMonth = financialEffectiveStart.getUTCMonth() + 1; // 1-based
    const isFinancialJan1 = rawFinancialStart.endsWith('-01-01') || !rawFinancialStart;
    const goalFloorMonth = isFinancialJan1 ? 1 : financialStartMonth;

    for (const gDoc of allGoalDocs) {
      const g = gDoc.data();
      const gMonth = asNumber(g.month); // 1-12
      if (seenGoalMonths.has(gMonth)) continue; // deduplicate
      seenGoalMonths.add(gMonth);
      yearlyVolumeGoal += asNumber(g.volumeGoal);
      yearlySalesGoal += asNumber(g.salesCountGoal);
      yearlyIncomeGoalFromMonthly += asNumber(g.grossMarginGoal);
      // Sum goals for months from goalFloorMonth through current month for YTD targets.
      // In 'plan_start' mode this excludes pre-plan months so the agent isn't penalized
      // for months before their plan started.
      if (gMonth >= goalFloorMonth && gMonth <= currentMonth) {
        volumeGoalToDate += asNumber(g.volumeGoal);
        salesGoalToDate += asNumber(g.salesCountGoal);
        incomeGoalToDate += asNumber(g.grossMarginGoal);
      }
      // Sum goals through projected month (when pending deals close)
      if (gMonth >= goalFloorMonth && gMonth <= projectedMonth) {
        projectedIncomeGoal += asNumber(g.grossMarginGoal);
        projectedVolumeGoal += asNumber(g.volumeGoal);
        projectedSalesGoal += asNumber(g.salesCountGoal);
      }
    }

    volumeGoalToDate = Number(volumeGoalToDate.toFixed(2));
    salesGoalToDate = Number(salesGoalToDate.toFixed(2));
    incomeGoalToDate = Number(incomeGoalToDate.toFixed(2));
    projectedIncomeGoal = Number(projectedIncomeGoal.toFixed(2));
    projectedVolumeGoal = Number(projectedVolumeGoal.toFixed(2));
    projectedSalesGoal = Number(projectedSalesGoal.toFixed(2));

    // Override income YTD goal with actual monthly goals if available.
    // Sanity check: if financialStartDate = Jan 1 (calendar year), the monthly goals in
    // brokerCommandGoals should cover all 12 months. If the sum of goals for months
    // 1 through currentMonth is unreasonably low (< 20% of the workday-prorated estimate),
    // it means the goals were saved incorrectly (e.g. only July onward was written).
    // In that case, fall back to the workday-prorated estimate from annualIncomeGoal.
    const proratedFallback = expectedYTDIncomeGoal; // workday-prorated estimate computed above
    const goalDataIsReliable = (() => {
      if (incomeGoalToDate <= 0) return false;
      if (!isFinancialJan1) return false; // non-Jan-1 start: always use workday proration
      // For Jan-1 start: check that the monthly goal coverage is reasonable.
      // If the sum of goals for months 1..currentMonth is less than 20% of the
      // prorated estimate, the data is likely incomplete (plan saved from wrong start month).
      if (proratedFallback <= 0) return true;
      return incomeGoalToDate >= proratedFallback * 0.20;
    })();
    if (goalDataIsReliable) {
      expectedYTDIncomeGoal = incomeGoalToDate;
      const recalcIncomePerf = performance(netEarned, expectedYTDIncomeGoal);
      // Projected: grade closed+pending against goal at their close date
      const projIncomeTarget = projectedIncomeGoal > 0 ? projectedIncomeGoal : expectedYTDIncomeGoal;
      const recalcPipelinePerf = performance(ytdTotalPotential, projIncomeTarget);
      dashboard.expectedYTDIncomeGoal = expectedYTDIncomeGoal;
      dashboard.incomeGrade = isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcIncomePerf);
      dashboard.incomePerformance = recalcIncomePerf;
      dashboard.pipelineAdjustedIncome = {
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcPipelinePerf),
        performance: recalcPipelinePerf,
      };
      dashboard.incomeDeltaToGoal = Number((netEarned - expectedYTDIncomeGoal).toFixed(2));
    } else if (incomeGoalToDate > 0 && !goalDataIsReliable) {
      // Monthly goals exist but appear incomplete for a Jan-1 plan — log a warning and
      // use the workday-prorated fallback so the agent sees a correct grade.
      console.warn('[dashboard] incomeGoalToDate suspiciously low for Jan-1 plan; using workday-prorated fallback', {
        incomeGoalToDate, proratedFallback, annualIncomeGoal, currentMonth, goalFloorMonth,
        goalsFound: allGoalDocs.length,
      });
      // expectedYTDIncomeGoal stays as the workday-prorated value set above — no override needed.
    }

    // Override KPI closings target with monthly sales goals if available
    if (salesGoalToDate > 0) {
      const recalcClosingsPerf = performance(closedUnits, salesGoalToDate);
      dashboard.kpis.closings = {
        actual: closedUnits,
        target: salesGoalToDate,
        performance: recalcClosingsPerf,
        grade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(recalcClosingsPerf),
      };
    }

    // Volume & deals: grade closed against current YTD goal,
    // projected against goal at pending close date
    const volumePerf = performance(closedVolume, volumeGoalToDate);
    const projVolTarget = projectedVolumeGoal > 0 ? projectedVolumeGoal : volumeGoalToDate;
    const projectedVolumePerf = performance(closedVolume + pendingVolume, projVolTarget);
    const dealsPerf = performance(closedUnits, salesGoalToDate);
    const projDealsTarget = projectedSalesGoal > 0 ? projectedSalesGoal : salesGoalToDate;
    const projectedDealsPerf = performance(closedUnits + pendingUnits, projDealsTarget);

    dashboard.volumeMetrics = {
      closedVolume: Number(closedVolume.toFixed(2)),
      pendingVolume: Number(pendingVolume.toFixed(2)),
      totalVolume: Number((closedVolume + pendingVolume).toFixed(2)),
      volumeGoal: volumeGoalToDate > 0 ? volumeGoalToDate : null,
      volumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(volumePerf),
      volumePerformance: volumePerf,
      projectedVolumeGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(projectedVolumePerf),
      projectedVolumePerformance: projectedVolumePerf,
      closedDeals: closedUnits,
      pendingDeals: pendingUnits,
      dealsGoal: salesGoalToDate > 0 ? salesGoalToDate : null,
      dealsGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(dealsPerf),
      dealsPerformance: dealsPerf,
      projectedDealsGrade: isMetricsGracePeriod ? 'A' : gradeFromPerformance(projectedDealsPerf),
      projectedDealsPerformance: projectedDealsPerf,
      projectedVolumeGoal: projectedVolumeGoal > 0 ? projectedVolumeGoal : null,
      projectedDealsGoal: projectedSalesGoal > 0 ? projectedSalesGoal : null,
      projectedIncomeGoal: projectedIncomeGoal > 0 ? projectedIncomeGoal : null,
      // Annual (full-year) goals for display in HeroCards
      annualVolumeGoal: yearlyVolumeGoal > 0 ? Number(yearlyVolumeGoal.toFixed(2)) : null,
      annualDealsGoal: yearlySalesGoal > 0 ? Number(yearlySalesGoal.toFixed(0)) : null,
      annualIncomeGoalFromMonthly: yearlyIncomeGoalFromMonthly > 0 ? Number(yearlyIncomeGoalFromMonthly.toFixed(2)) : null,
      // Which month the pipeline projection extends through (1-based)
      projectedThroughMonth: projectedMonth,
    };

    // ── Tier / Cap progress ──────────────────────────────────────────────
    // The agent profile is the SINGLE SOURCE OF TRUTH for commission tiers.
    // All tier data is always saved directly onto the agentProfile document
    // when the admin saves the agent profile form. No lookups to teamPlans,
    // memberPlans, or any other collection are needed or correct.
    //
    // Resolution priority (all from agentProfile):
    //   1. Flat plan  → flatAgentPercent / flatCompanyPercent (commissionMode === 'flat')
    //   2. Team member → teamMemberOverrideBands[].memberPercent (teamRole === 'member')
    //   3. Independent / team leader → tiers[].agentSplitPercent
    let resolvedTiers: { tierName: string; fromCompanyDollar: number; toCompanyDollar: number | null; agentSplitPercent: number; companySplitPercent: number }[] = [];
    let resolvedPlanName: string | null = null;

    if (agentProfile?.commissionMode === 'flat' &&
        agentProfile?.flatAgentPercent != null) {
      // Flat plan: single tier, no thresholds
      const agentPct = asNumber(agentProfile.flatAgentPercent);
      resolvedTiers = [{
        tierName: 'Flat',
        fromCompanyDollar: 0,
        toCompanyDollar: null,
        agentSplitPercent: agentPct,
        companySplitPercent: Number((100 - agentPct).toFixed(1)),
      }];
      resolvedPlanName = 'Flat Commission Plan';
    } else if (
      agentProfile?.teamRole === 'member' &&
      Array.isArray(agentProfile?.teamMemberOverrideBands) &&
      agentProfile.teamMemberOverrideBands.length > 0
    ) {
      // Team member: use the override bands saved on the profile
      resolvedTiers = agentProfile.teamMemberOverrideBands.map((b: any, i: number) => ({
        tierName: b.tierName || `Tier ${i + 1}`,
        fromCompanyDollar: asNumber(b.fromCompanyDollar),
        toCompanyDollar: b.toCompanyDollar != null ? asNumber(b.toCompanyDollar) : null,
        agentSplitPercent: asNumber(b.memberPercent),
        companySplitPercent: Number((100 - asNumber(b.memberPercent)).toFixed(1)),
      }));
      resolvedPlanName = 'Member Commission Plan';
    } else if (agentProfile?.teamRole === 'leader' && agentProfile?.defaultPlanId) {
      // Team leader: look up leaderStructureBands from the teamPlans collection.
      // defaultPlanId stores the teamPlanId field value (not the Firestore doc ID),
      // so we must query by the teamPlanId field.
      try {
        const leaderPlanQuery = await adminDb.collection('teamPlans')
          .where('teamPlanId', '==', agentProfile.defaultPlanId)
          .limit(1)
          .get();
        const leaderPlanSnap = !leaderPlanQuery.empty ? leaderPlanQuery.docs[0] : null;
        if (leaderPlanSnap) {
          const planData = leaderPlanSnap.data() || {};
          const bands: any[] = Array.isArray(planData.leaderStructureBands) ? planData.leaderStructureBands : [];
          if (bands.length > 0) {
            resolvedTiers = bands.map((b: any, i: number) => ({
              tierName: b.tierName || `Tier ${i + 1}`,
              fromCompanyDollar: asNumber(b.fromCompanyDollar),
              toCompanyDollar: b.toCompanyDollar != null ? asNumber(b.toCompanyDollar) : null,
              agentSplitPercent: asNumber(b.leaderPercent),
              companySplitPercent: asNumber(b.companyPercent),
            }));
            resolvedPlanName = planData.planName || 'Team Leader Commission Plan';
          }
        }
      } catch { /* non-fatal — fall through to tiers array below */ }
      // Fallback to profile tiers if plan lookup failed or returned empty
      if (resolvedTiers.length === 0 && Array.isArray(agentProfile?.tiers) && agentProfile.tiers.length > 0) {
        resolvedTiers = agentProfile.tiers.map((t: any, i: number) => ({
          tierName: t.tierName || `Tier ${i + 1}`,
          fromCompanyDollar: asNumber(t.fromCompanyDollar),
          toCompanyDollar: t.toCompanyDollar != null ? asNumber(t.toCompanyDollar) : null,
          agentSplitPercent: asNumber(t.agentSplitPercent),
          companySplitPercent: asNumber(t.companySplitPercent),
        }));
        resolvedPlanName = 'Team Leader Commission Plan';
      }
    } else if (
      Array.isArray(agentProfile?.tiers) &&
      agentProfile.tiers.length > 0
    ) {
      // Independent agent: use the tiers array on the profile
      resolvedTiers = agentProfile.tiers.map((t: any, i: number) => ({
        tierName: t.tierName || `Tier ${i + 1}`,
        fromCompanyDollar: asNumber(t.fromCompanyDollar),
        toCompanyDollar: t.toCompanyDollar != null ? asNumber(t.toCompanyDollar) : null,
        agentSplitPercent: asNumber(t.agentSplitPercent),
        companySplitPercent: asNumber(t.companySplitPercent),
      }));
      resolvedPlanName = 'Individual Commission Plan';
    }
     // ── Anniversary cycle — compute GCI within the agent's commission cycle ────
    const agentStartDate = agentProfile?.startDate || null;
    const annivMonth = asNumber(agentProfile?.anniversaryMonth);
    const annivDay = asNumber(agentProfile?.anniversaryDay);
    // Current anniversary cycle (the one containing today)
    const currentCycle = getAnniversaryCycle(annivMonth, annivDay, todayUtc);
    // Accumulate grossGCIYTD within the anniversary cycle (not calendar year)
    for (const t of txDocs) {
      if (String(t.status || '').trim() !== 'closed') continue;
      const d = getTransactionDateForEarned(t);
      if (!d) continue;
      const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      if (isInCycle(dUtc, currentCycle)) {
        // Use splitSnapshot.grossCommission (total GCI before splits) as primary source.
        // This is the full gross commission income on the transaction, which is what
        // the tier thresholds (fromCompanyDollar field) are based on.
        const tierGCI = asNumber(
          t.splitSnapshot?.grossCommission
          || t.commission
        );
        grossGCIYTD += tierGCI;
      }
    }
    // Next anniversary date and days until reset
    const actualNextAnniv = new Date(currentCycle.cycleEnd.getTime() + 1); // day after cycleEnd
    const anniversaryDate: string = actualNextAnniv.toISOString().slice(0, 10);
    const daysUntilReset: number = Math.ceil(
      (actualNextAnniv.getTime() - todayUtc.getTime()) / (1000 * 60 * 60 * 24)
    );
    const cycleLabel = formatCycleLabel(currentCycle);
    console.log(`[dashboard] tiers resolved: ${resolvedTiers.length}, planName: ${resolvedPlanName}, grossGCI (cycle): ${grossGCIYTD.toFixed(2)}, cycle: ${cycleLabel}, teamMemberCompMode: ${agentProfile?.teamMemberCompMode ?? 'n/a'}, overrideBands: ${Array.isArray(agentProfile?.teamMemberOverrideBands) ? agentProfile.teamMemberOverrideBands.length : 0}`);
    // Sort tiers and compute progress
    if (resolvedTiers.length > 0) {
      const sortedTiers = [...resolvedTiers].sort(
        (a, b) => a.fromCompanyDollar - b.fromCompanyDollar
      );
      const totalGCIForTier = grossGCIYTD;

      // Find current tier
      let currentTierIndex = 0;
      for (let i = sortedTiers.length - 1; i >= 0; i--) {
        if (totalGCIForTier >= sortedTiers[i].fromCompanyDollar) {
          currentTierIndex = i;
          break;
        }
      }

      const currentTier = sortedTiers[currentTierIndex];
      const nextTier = currentTierIndex < sortedTiers.length - 1 ? sortedTiers[currentTierIndex + 1] : null;

      const tierFrom = currentTier.fromCompanyDollar;
      const tierTo = currentTier.toCompanyDollar != null
        ? currentTier.toCompanyDollar
        : (nextTier ? nextTier.fromCompanyDollar : null);

      let progressInCurrentTier = 0;
      let capReached = false;
      if (tierTo != null && tierTo > tierFrom) {
        progressInCurrentTier = Math.min(100, Math.round(((totalGCIForTier - tierFrom) / (tierTo - tierFrom)) * 100));
      } else if (!nextTier) {
        capReached = totalGCIForTier > tierFrom;
        progressInCurrentTier = 100;
      }

      dashboard.tierProgress = {
        tiers: sortedTiers,
        grossGCIYTD: Number(grossGCIYTD.toFixed(2)),
        pendingGrossGCI: Number(pendingGrossGCI.toFixed(2)),
        currentTierIndex,
        currentTierName: currentTier.tierName || `Tier ${currentTierIndex + 1}`,
        nextTierName: nextTier ? (nextTier.tierName || `Tier ${currentTierIndex + 2}`) : null,
        nextTierThreshold: nextTier ? nextTier.fromCompanyDollar : null,
        progressInCurrentTier,
        capReached,
        effectiveStartDate: currentCycle.cycleStart.toISOString().slice(0, 10),
        anniversaryDate,
        daysUntilReset,
        planName: resolvedPlanName,
        cycleLabel,
        cycleStart: currentCycle.cycleStart.toISOString().slice(0, 10),
        cycleEnd: currentCycle.cycleEnd.toISOString().slice(0, 10),
      };
    } else {
      // No tiers resolved — still provide start date info + diagnostic data
      dashboard.tierProgress = {
        tiers: [],
        grossGCIYTD: Number(grossGCIYTD.toFixed(2)),
        pendingGrossGCI: Number(pendingGrossGCI.toFixed(2)),
        currentTierIndex: 0,
        currentTierName: 'No Tier',
        nextTierName: null,
        nextTierThreshold: null,
        progressInCurrentTier: 0,
        capReached: false,
        effectiveStartDate: currentCycle.cycleStart.toISOString().slice(0, 10),
        anniversaryDate,
        daysUntilReset,
        planName: null,
        cycleLabel,
        cycleStart: currentCycle.cycleStart.toISOString().slice(0, 10),
        cycleEnd: currentCycle.cycleEnd.toISOString().slice(0, 10),
        // Diagnostic: why tiers weren't resolved
        _debug: {
          profileFound: !!agentProfile,
          agentType: agentProfile?.agentType ?? null,
          tiersOnProfile: Array.isArray(agentProfile?.tiers) ? agentProfile.tiers.length : 0,
          primaryTeamId: agentProfile?.primaryTeamId ?? null,
          teamRole: agentProfile?.teamRole ?? null,
          teamMemberCompMode: agentProfile?.teamMemberCompMode ?? null,
          overrideBandsCount: Array.isArray(agentProfile?.teamMemberOverrideBands) ? agentProfile.teamMemberOverrideBands.length : 0,
        },
      } as any;
    }

    // ── Phase 3: Previous year comparison + available years in parallel ─
    const compareYearParam = reqParams.get("compareYear");
    let prevYearComparison: typeof dashboard.prevYearComparison = null;

    const compYear = compareYearParam ? Number(compareYearParam) : yearNum - 1;

    const [prevTxSnap, prevActivitySnap, allTxYearsSnap] = await Promise.all([
      adminDb
        .collection("transactions")
        .where("agentId", "==", uid)
        .where("year", "==", compYear)
        .get(),
      adminDb
        .collection("daily_activity")
        .where("agentId", "==", uid)
        .where("date", ">=", `${compYear}-01-01`)
        .where("date", "<=", `${compYear}-12-31`)
        .get(),
      adminDb
        .collection("transactions")
        .where("agentId", "==", uid)
        .select("year")
        .get(),
    ]);

    if (!prevTxSnap.empty) {
      let prevNetEarned = 0;
      let prevClosedVolume = 0;
      let prevClosedUnits = 0;
      let prevTotalGCI = 0;

      for (const doc of prevTxSnap.docs) {
        const t = doc.data() || {};
        if (String(t.status || "").trim() !== "closed") continue;
        const d = getTransactionDateForEarned(t);
        if (!d) continue;
        const prevIsReferral = String(t.closingType || "").toLowerCase() === "referral";
        prevNetEarned += getTransactionNet(t);
        if (!prevIsReferral) {
          prevClosedVolume += asNumber(t.salePrice ?? t.listPrice);
          prevTotalGCI += asNumber(t.splitSnapshot?.grossCommission || t.commission);
          prevClosedUnits += 1;
        }
      }

      let prevEngagements = 0;
      let prevAppointmentsHeld = 0;
      for (const doc of prevActivitySnap.docs) {
        const a = doc.data() || {};
        prevEngagements += asNumber(a.engagementsCount);
        prevAppointmentsHeld += asNumber(a.appointmentsHeldCount);
      }

      prevYearComparison = {
        year: compYear,
        avgSalesPrice: prevClosedUnits > 0 ? Number((prevClosedVolume / prevClosedUnits).toFixed(2)) : 0,
        avgCommissionPct: prevClosedVolume > 0 ? Number(((prevTotalGCI / prevClosedVolume) * 100).toFixed(2)) : 0,
        engagementValue: prevEngagements > 0 ? Number((prevNetEarned / prevEngagements).toFixed(2)) : 0,
        appointmentValue: prevAppointmentsHeld > 0 ? Number((prevNetEarned / prevAppointmentsHeld).toFixed(2)) : 0,
        netEarned: Number(prevNetEarned.toFixed(2)),
        closedVolume: Number(prevClosedVolume.toFixed(2)),
        closedDeals: prevClosedUnits,
      };
    }

    dashboard.prevYearComparison = prevYearComparison;

    const availableYears = [...new Set(allTxYearsSnap.docs.map(d => asNumber(d.data().year)))]
      .filter(y => y > 0 && y !== yearNum)
      .sort((a, b) => b - a);

    dashboard.availableComparisonYears = availableYears;

    // ── Strip commission split fields for non-admin callers ───────────────
    const isAdminCaller = await isAdminLike(decoded.uid);
    if (!isAdminCaller && dashboard.stats) {
      delete (dashboard.stats as any).avgCommissionPct;
    }
    if (!isAdminCaller && (dashboard as any).prevYearComparison) {
      delete (dashboard as any).prevYearComparison.avgCommissionPct;
    }

    return NextResponse.json({
      ok: true,
      year: yearNum,
      dashboard,
      plan: serializeFirestore(plan),
      ytdMetrics: null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
