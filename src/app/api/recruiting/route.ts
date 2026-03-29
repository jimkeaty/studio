// src/app/api/recruiting/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { addYears, differenceInDays } from "date-fns";
import type { DownlineMember, QualificationProgress } from "@/lib/types/incentives";
import type admin from 'firebase-admin';

const GCI_THRESHOLD = 40_000;
const WINDOW_MONTHS = 12;

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

// Firestore IN queries max 30 per batch
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

function buildQualificationProgress(
  hireDate: Date,
  transactions: FirebaseFirestore.DocumentData[]
): QualificationProgress {
  const windowEnd = addYears(hireDate, WINDOW_MONTHS / 12);
  const now = new Date();

  let closedGci = 0;
  let pendingGci = 0;

  for (const t of transactions) {
    const gci = (t.splitSnapshot?.grossCommission ?? t.commission ?? 0) as number;
    if (t.status === 'closed') {
      const closedDate = parseDate(t.closedDate);
      if (closedDate && closedDate >= hireDate && closedDate <= windowEnd) {
        closedGci += gci;
      }
    } else if (t.status === 'pending' || t.status === 'under_contract') {
      const contractDate = parseDate(t.contractDate);
      if (contractDate && contractDate >= hireDate && contractDate <= windowEnd) {
        pendingGci += gci;
      }
    }
  }

  const windowExpired = now > windowEnd;
  const isQualified = closedGci >= GCI_THRESHOLD;

  let status: QualificationProgress['status'];
  if (isQualified) status = 'qualified';
  else if (windowExpired) status = 'expired';
  else status = 'in_progress';

  return {
    status,
    closedCompanyGciGrossInWindow: closedGci,
    pendingCompanyGciGrossInWindow: pendingGci,
    remainingToThreshold: Math.max(0, GCI_THRESHOLD - closedGci),
    progressPercentage: Math.min(100, (closedGci / GCI_THRESHOLD) * 100),
    windowEndsAt: windowEnd,
    timeRemainingDays: !windowExpired ? differenceInDays(windowEnd, now) : null,
    qualifiedAt: null, // not stored yet — derived only
    annualPayout: isQualified ? 500 : 0,
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // ── 1. Find Tier 1 recruits (agents where referringAgentId = uid) ─────────
    const tier1Snap = await adminDb.collection('agentProfiles')
      .where('referringAgentId', '==', uid)
      .get();

    const tier1Profiles = tier1Snap.docs.map(d => d.data());
    const tier1Ids = tier1Profiles.map(p => p.agentId as string).filter(Boolean);

    // ── 2. Find Tier 2 recruits (agents referred by Tier 1 agents) ─────────────
    let tier2Profiles: FirebaseFirestore.DocumentData[] = [];
    if (tier1Ids.length > 0) {
      const tier2Batches: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
      for (let i = 0; i < tier1Ids.length; i += 30) {
        tier2Batches.push(
          adminDb.collection('agentProfiles')
            .where('referringAgentId', 'in', tier1Ids.slice(i, i + 30))
            .get()
        );
      }
      const tier2Results = await Promise.all(tier2Batches);
      tier2Profiles = tier2Results.flatMap(snap => snap.docs.map(d => d.data()));
      // Exclude anyone who is also a Tier 1 (shouldn't happen, but be safe)
      const tier1IdSet = new Set(tier1Ids);
      tier2Profiles = tier2Profiles.filter(p => !tier1IdSet.has(p.agentId));
    }

    const allRecruitIds = [
      ...tier1Ids,
      ...tier2Profiles.map(p => p.agentId as string).filter(Boolean),
    ];

    if (allRecruitIds.length === 0) {
      return NextResponse.json({ ok: true, uid, summary: { tier1Count: 0, tier2Count: 0, qualifiedCount: 0, totalRecruits: 0 }, downline: [] });
    }

    // ── 3. Fetch all transactions for recruited agents ─────────────────────────
    const allTxns = await fetchTransactionsForAgents(allRecruitIds);

    // Group transactions by agentId
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
        qualificationProgress: hireDate ? buildQualificationProgress(hireDate, agentTxns) : null,
      });
    }

    for (const profile of tier2Profiles) {
      const agentId = profile.agentId as string;
      const hireDate = parseDate(profile.startDate);
      const agentTxns = txnsByAgent.get(agentId) ?? [];
      const referrerId = profile.referringAgentId as string | undefined;
      const referrerProfile = tier1Profiles.find(p => p.agentId === referrerId);
      downline.push({
        agentId,
        displayName: (profile.displayName as string) || agentId,
        tier: 2,
        hireDate,
        referrerId,
        uplineId: referrerId,
        qualificationProgress: hireDate ? buildQualificationProgress(hireDate, agentTxns) : null,
        referrerDisplayName: (profile.referringAgentDisplayNameSnapshot as string | undefined) || referrerId,
      } as any);
      void referrerProfile;
    }

    // Sort: Tier 1 first, then Tier 2; within tier sort by displayName
    downline.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.displayName.localeCompare(b.displayName);
    });

    // ── 5. Summary ─────────────────────────────────────────────────────────────
    const summary = downline.reduce(
      (acc, m) => {
        if (m.tier === 1) acc.tier1Count++;
        if (m.tier === 2) acc.tier2Count++;
        if (m.qualificationProgress?.status === 'qualified') acc.qualifiedCount++;
        acc.totalRecruits++;
        return acc;
      },
      { tier1Count: 0, tier2Count: 0, qualifiedCount: 0, totalRecruits: 0 }
    );

    return NextResponse.json({ ok: true, uid, summary, downline });
  } catch (e: any) {
    console.error("[api/recruiting] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load recruiting data" }, { status: 500 });
  }
}
