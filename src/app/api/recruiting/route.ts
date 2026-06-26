// src/app/api/recruiting/route.ts
// GET /api/recruiting — returns the calling agent's full downline with
// annual recurring qualification progress and correct Tier 2 upline payout rollup.
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { addMonths, addYears, differenceInDays, startOfYear, endOfYear } from "date-fns";
import type { DownlineMember, QualificationProgress, AnniversaryYearProgress, RecruitingSummary } from "@/lib/types/incentives";
import type { RecruitingIncentiveConfig } from '@/lib/types/recruitingConfig';
import { DEFAULT_RECRUITING_CONFIG } from '@/lib/types/recruitingConfig';
import type admin from 'firebase-admin';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function parseDate(raw: admin.firestore.Timestamp | string | undefined | null): Date | null {
  if (!raw) return null;
  if (typeof (raw as any).toDate === 'function') return (raw as admin.firestore.Timestamp).toDate();
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function fetchTransactionsForAgents(agentIds: string[]) {
  if (agentIds.length === 0) return [];
  const batches: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  for (let i = 0; i < agentIds.length; i += 30) {
    batches.push(
      adminDb.collection('transactions')
        .where('agentId', 'in', agentIds.slice(i, i + 30))
        .get()
    );
  }
  const results = await Promise.all(batches);
  return results.flatMap(snap => snap.docs.map(d => d.data()));
}

/** Load the recruiting incentive config for the org (defaults to 'keaty'). */
async function loadConfig(): Promise<RecruitingIncentiveConfig> {
  try {
    const snap = await adminDb.collection('recruitingIncentiveConfig').doc('keaty').get();
    if (snap.exists) {
      return { id: snap.id, ...snap.data() } as RecruitingIncentiveConfig;
    }
  } catch {
    // Fall through to defaults
  }
  return {
    id: 'keaty',
    ...DEFAULT_RECRUITING_CONFIG,
    updatedAt: '',
    updatedByUid: '',
  };
}

// ── Core qualification logic ───────────────────────────────────────────────────

/**
 * Builds the full multi-year qualification history for a recruit.
 *
 * For 'anniversary' window type:
 *   Year 1: hireDate → hireDate + windowMonths
 *   Year 2: hireDate + windowMonths → hireDate + 2×windowMonths
 *   etc.
 *
 * For 'calendar' window type:
 *   Each calendar year Jan 1 – Dec 31 from hire year onward.
 *
 * The payout is earned the moment the recruit crosses the GCI threshold
 * within a window. If they miss a window, they can qualify in the next one.
 */
function buildQualificationProgress(
  hireDate: Date,
  transactions: FirebaseFirestore.DocumentData[],
  config: RecruitingIncentiveConfig
): QualificationProgress {
  const now = new Date();
  const { gciThreshold, tier1PayoutAmount, windowType, windowMonths, recurring } = config;

  // Build the list of windows from hire date to now (plus the current open window)
  const windows: Array<{ start: Date; end: Date; yearNumber: number }> = [];

  if (windowType === 'anniversary') {
    let yearNumber = 1;
    let windowStart = new Date(hireDate);
    while (windowStart <= now) {
      const windowEnd = addMonths(windowStart, windowMonths);
      windows.push({ start: windowStart, end: windowEnd, yearNumber });
      windowStart = new Date(windowEnd);
      yearNumber++;
      // Safety: don't build more than 30 years of windows
      if (yearNumber > 30) break;
    }
  } else {
    // Calendar year windows from hire year to current year
    const hireYear = hireDate.getFullYear();
    const currentYear = now.getFullYear();
    for (let y = hireYear; y <= currentYear; y++) {
      const windowStart = y === hireYear ? new Date(hireDate) : startOfYear(new Date(y, 0, 1));
      const windowEnd = endOfYear(new Date(y, 0, 1));
      windows.push({ start: windowStart, end: windowEnd, yearNumber: y - hireYear + 1 });
    }
  }

  // For non-recurring programs, only process the first window
  const windowsToProcess = recurring ? windows : windows.slice(0, 1);

  // Build per-year progress
  const anniversaryYears: AnniversaryYearProgress[] = windowsToProcess.map(({ start, end, yearNumber }) => {
    let closedGci = 0;
    let pendingGci = 0;

    for (const t of transactions) {
      const gci = (t.splitSnapshot?.grossCommission ?? t.commission ?? 0) as number;
      if (t.status === 'closed') {
        const closedDate = parseDate(t.closedDate);
        if (closedDate && closedDate >= start && closedDate <= end) {
          closedGci += gci;
        }
      } else if (t.status === 'pending' || t.status === 'under_contract') {
        const contractDate = parseDate(t.contractDate);
        if (contractDate && contractDate >= start && contractDate <= end) {
          pendingGci += gci;
        }
      }
    }

    const qualified = closedGci >= gciThreshold;
    const expired = now > end;
    const isCurrent = now >= start && now <= end;

    return {
      yearNumber,
      windowStart: start,
      windowEnd: end,
      closedGci,
      pendingGci,
      qualified,
      expired,
      isCurrent,
      payoutEarned: qualified ? tier1PayoutAmount : 0,
    };
  });

  // Find the current window (or most recent if between windows)
  const currentYear = anniversaryYears.find(y => y.isCurrent) ?? anniversaryYears[anniversaryYears.length - 1];

  const totalLifetimePayouts = anniversaryYears.reduce((sum, y) => sum + y.payoutEarned, 0);
  const qualifiedYearsCount = anniversaryYears.filter(y => y.qualified).length;

  // Overall status is based on the current window
  let status: QualificationProgress['status'];
  if (!currentYear) {
    status = 'missing_data';
  } else if (currentYear.qualified) {
    status = 'qualified';
  } else if (currentYear.expired && !currentYear.isCurrent) {
    // All windows expired and none qualified this year — but may have qualified in prior years
    const hasAnyQualified = anniversaryYears.some(y => y.qualified);
    status = hasAnyQualified ? 'expired' : 'expired';
  } else {
    status = 'in_progress';
  }

  const windowEndsAt = currentYear?.windowEnd ?? null;
  const windowExpired = windowEndsAt ? now > windowEndsAt : true;

  return {
    status,
    closedCompanyGciGrossInWindow: currentYear?.closedGci ?? 0,
    pendingCompanyGciGrossInWindow: currentYear?.pendingGci ?? 0,
    remainingToThreshold: Math.max(0, gciThreshold - (currentYear?.closedGci ?? 0)),
    progressPercentage: Math.min(100, ((currentYear?.closedGci ?? 0) / gciThreshold) * 100),
    windowEndsAt,
    timeRemainingDays: !windowExpired && windowEndsAt ? differenceInDays(windowEndsAt, now) : null,
    qualifiedAt: null,
    annualPayout: currentYear?.qualified ? tier1PayoutAmount : 0,
    anniversaryYears,
    totalLifetimePayouts,
    qualifiedYearsCount,
  };
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;

    // Support admin viewAs impersonation (same pattern as /api/plan)
    const viewAs = req.nextUrl.searchParams.get('viewAs');
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    // Load incentive config and resolve referrer IDs in parallel
    const [config, profileByIdSnap] = await Promise.all([
      loadConfig(),
      adminDb.collection('agentProfiles').doc(uid).get(),
    ]);

    // ── 0. Resolve all possible IDs for this referrer ──────────────────────────
    const referrerIdSet = new Set<string>([uid]);
    if (profileByIdSnap.exists) {
      const d = profileByIdSnap.data();
      if (d?.agentId) referrerIdSet.add(String(d.agentId));
      if (d?.firebaseUid) referrerIdSet.add(String(d.firebaseUid));
    } else {
      try {
        const profileBySlugSnap = await adminDb.collection('agentProfiles')
          .where('agentId', '==', uid).limit(1).get();
        if (!profileBySlugSnap.empty) {
          referrerIdSet.add(profileBySlugSnap.docs[0].id);
          const d = profileBySlugSnap.docs[0].data();
          if (d?.agentId) referrerIdSet.add(String(d.agentId));
          if (d?.firebaseUid) referrerIdSet.add(String(d.firebaseUid));
        }
      } catch { /* non-fatal */ }
    }
    const referrerIds = Array.from(referrerIdSet);

    // ── 1. Find Tier 1 recruits ────────────────────────────────────────────────
    const tier1SnapBatches = await Promise.all(
      referrerIds.map(rid =>
        adminDb.collection('agentProfiles').where('referringAgentId', '==', rid).get().catch(() => null)
      )
    );
    const tier1DocMap = new Map<string, FirebaseFirestore.DocumentData>();
    for (const snap of tier1SnapBatches) {
      if (!snap) continue;
      for (const doc of snap.docs) {
        if (!tier1DocMap.has(doc.id)) tier1DocMap.set(doc.id, doc.data());
      }
    }
    const tier1Profiles = Array.from(tier1DocMap.values());
    const tier1Ids = tier1Profiles.map(p => p.agentId as string).filter(Boolean);

    // ── 2. Find Tier 2 recruits (only if tierDepth >= 2) ──────────────────────
    let tier2Profiles: FirebaseFirestore.DocumentData[] = [];
    if (config.tierDepth >= 2 && tier1Ids.length > 0) {
      const tier2Batches: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
      for (let i = 0; i < tier1Ids.length; i += 30) {
        tier2Batches.push(
          adminDb.collection('agentProfiles')
            .where('referringAgentId', 'in', tier1Ids.slice(i, i + 30))
            .get()
        );
      }
      const tier2Results = await Promise.all(tier2Batches);
      const tier1IdSet = new Set(tier1Ids);
      tier2Profiles = tier2Results
        .flatMap(snap => snap.docs.map(d => d.data()))
        .filter(p => !tier1IdSet.has(p.agentId)); // exclude any Tier 1 duplicates
    }

    const allRecruitIds = [
      ...tier1Ids,
      ...tier2Profiles.map(p => p.agentId as string).filter(Boolean),
    ];

    if (allRecruitIds.length === 0) {
      return NextResponse.json({
        ok: true,
        uid,
        config,
        summary: {
          tier1Count: 0, tier2Count: 0, qualifiedCount: 0, totalRecruits: 0,
          tier1QualifiedCount: 0, tier2QualifiedCount: 0,
          tier1AnnualIncome: 0, tier2AnnualIncome: 0,
          totalAnnualIncome: 0, totalLifetimeIncome: 0,
        } satisfies RecruitingSummary,
        downline: [],
      });
    }

    // ── 3. Fetch all transactions for recruited agents ─────────────────────────
    const allTxns = await fetchTransactionsForAgents(allRecruitIds);
    const txnsByAgent = new Map<string, FirebaseFirestore.DocumentData[]>();
    for (const t of allTxns) {
      const id = t.agentId as string;
      if (!txnsByAgent.has(id)) txnsByAgent.set(id, []);
      txnsByAgent.get(id)!.push(t);
    }

    // ── 4. Build DownlineMember list ───────────────────────────────────────────
    const downline: DownlineMember[] = [];

    for (const profile of tier1Profiles) {
      const agentId = profile.agentId as string;
      const hireDate = parseDate(profile.startDate);
      const agentTxns = txnsByAgent.get(agentId) ?? [];
      downline.push({
        agentId,
        displayName: (profile.displayName as string) || agentId,
        tier: 1,
        hireDate,
        qualificationProgress: hireDate ? buildQualificationProgress(hireDate, agentTxns, config) : null,
      });
    }

    for (const profile of tier2Profiles) {
      const agentId = profile.agentId as string;
      const hireDate = parseDate(profile.startDate);
      const agentTxns = txnsByAgent.get(agentId) ?? [];
      const referrerId = profile.referringAgentId as string | undefined;
      const referrerProfile = tier1Profiles.find(p => p.agentId === referrerId);

      // For Tier 2, compute progress using tier2PayoutAmount for the upline agent's credit
      const qp = hireDate ? buildQualificationProgress(hireDate, agentTxns, config) : null;
      // Override annualPayout to use tier2PayoutAmount (the upline agent earns tier2 amount for this recruit)
      if (qp) {
        qp.annualPayout = qp.status === 'qualified' ? config.tier2PayoutAmount : 0;
        qp.anniversaryYears = qp.anniversaryYears.map(y => ({
          ...y,
          payoutEarned: y.qualified ? config.tier2PayoutAmount : 0,
        }));
        qp.totalLifetimePayouts = qp.anniversaryYears.reduce((s, y) => s + y.payoutEarned, 0);
      }

      downline.push({
        agentId,
        displayName: (profile.displayName as string) || agentId,
        tier: 2,
        hireDate,
        referrerId,
        uplineId: referrerId,
        referrerDisplayName: (profile.referringAgentDisplayNameSnapshot as string | undefined)
          || referrerProfile?.displayName
          || referrerId,
        qualificationProgress: qp,
      } as DownlineMember);
    }

    // Sort: Tier 1 first, then Tier 2; within tier sort by displayName
    downline.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.displayName.localeCompare(b.displayName);
    });

    // ── 5. Build summary with correct Tier 1 + Tier 2 income rollup ───────────
    let tier1Count = 0, tier2Count = 0;
    let tier1QualifiedCount = 0, tier2QualifiedCount = 0;
    let tier1AnnualIncome = 0, tier2AnnualIncome = 0;
    let totalLifetimeIncome = 0;

    for (const m of downline) {
      const qp = m.qualificationProgress;
      if (m.tier === 1) {
        tier1Count++;
        if (qp?.status === 'qualified') {
          tier1QualifiedCount++;
          tier1AnnualIncome += qp.annualPayout;
        }
        totalLifetimeIncome += qp?.totalLifetimePayouts ?? 0;
      } else {
        tier2Count++;
        if (qp?.status === 'qualified') {
          tier2QualifiedCount++;
          tier2AnnualIncome += qp.annualPayout; // tier2PayoutAmount credited to upline
        }
        totalLifetimeIncome += qp?.totalLifetimePayouts ?? 0;
      }
    }

    const summary: RecruitingSummary = {
      tier1Count,
      tier2Count,
      qualifiedCount: tier1QualifiedCount + tier2QualifiedCount,
      totalRecruits: downline.length,
      tier1QualifiedCount,
      tier2QualifiedCount,
      tier1AnnualIncome,
      tier2AnnualIncome,
      totalAnnualIncome: tier1AnnualIncome + tier2AnnualIncome,
      totalLifetimeIncome,
    };

    return NextResponse.json({ ok: true, uid, config, summary, downline });
  } catch (e: any) {
    console.error("[api/recruiting] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load recruiting data" }, { status: 500 });
  }
}
