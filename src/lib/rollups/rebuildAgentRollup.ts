/**
 * rebuildAgentRollup.ts
 *
 * Server-side only. Reads ALL transactions for a given agentId + year from
 * Firestore and recomputes the agentYearRollups document from scratch.
 *
 * This makes the transaction ledger the single source of truth for every
 * dashboard widget and leaderboard that reads agentYearRollups.
 *
 * Called automatically after every POST / PATCH / DELETE on transactions.
 *
 * ── Anniversary Cycle vs Calendar Year ───────────────────────────────────────
 * Two separate windows are maintained per rollup document:
 *
 * CALENDAR YEAR (used by leaderboard / personal dashboard stats):
 *   closed, pending, closedVolume, totalGCI, agentNetCommission, companyDollar
 *   → filtered by txYear === year (Jan 1 – Dec 31)
 *
 * ANNIVERSARY CYCLE (used by commission tier progression):
 *   tierProgressionCompanyDollar, cycleStart, cycleEnd
 *   → filtered by transaction date falling within the agent's anniversary cycle
 *     that contains Jan 1 of the target year (i.e., the cycle "active" that year)
 *   → For team leaders: also includes team member production credits
 *
 * ── Team Leader Tier Progression ─────────────────────────────────────────────
 * For team leaders, `tierProgressionCompanyDollar` accumulates:
 *   1. The leader's own closed transactions within the anniversary cycle
 *   2. All team member transactions where
 *      creditSnapshot.progressionLeaderAgentId === agentId
 *      (using creditSnapshot.progressionCompanyDollarCredit as the amount)
 *
 * `companyDollar` (used by leaderboard / personal dashboard) is PERSONAL ONLY
 * and never includes team member production.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getAnniversaryCycle, isInCycle } from '@/lib/agents/anniversaryCycle';

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  let d: Date | null = null;
  if (typeof value?.toDate === 'function') d = value.toDate();
  else if (value instanceof Date) d = value;
  else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

function toYear(value: any): number | null {
  const d = toDate(value);
  return d ? d.getFullYear() : null;
}

function toUtcDate(value: any): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ── Main rebuild function ─────────────────────────────────────────────────────

/**
 * Rebuild the agentYearRollups document for a single agent + year.
 *
 * @param db      Firestore Admin instance (pass adminDb() from caller)
 * @param agentId The agent's Firestore document ID
 * @param year    The calendar year to rebuild (e.g. 2025)
 */
export async function rebuildAgentRollup(
  db: Firestore,
  agentId: string,
  year: number
): Promise<void> {
  if (!agentId || !year) return;

  // ── 0. Fetch agent profile for anniversary data and display fields ─────────
  let displayName = agentId;
  let avatarUrl: string | null = null;
  let agentStatus: string = 'active';
  let anniversaryMonth: number = 0;
  let anniversaryDay: number = 0;

  try {
    const profileDoc = await db.collection('agentProfiles').doc(agentId).get();
    if (profileDoc.exists) {
      const p = profileDoc.data() as any;
      displayName =
        String(p.displayName || p.name || p.agentName || '').trim() || agentId;
      avatarUrl = p.avatarUrl ? String(p.avatarUrl) : null;
      agentStatus = String(p.status || 'active');
      anniversaryMonth = num(p.anniversaryMonth);
      anniversaryDay = num(p.anniversaryDay);
    }
  } catch {
    // Non-fatal: proceed without profile data
  }

  // ── 0b. Compute the anniversary cycle that is "active" for this year ───────
  // We use Jan 1 of the target year as the reference point to find which
  // anniversary cycle was active at the start of that year.
  const cycleRef = new Date(Date.UTC(year, 0, 1)); // Jan 1 of target year
  const cycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, cycleRef);

  // ── 1. Fetch all transactions for this agent (personal production) ────────
  const snap = await db
    .collection('transactions')
    .where('agentId', '==', agentId)
    .get();

  // ── 2. Process transactions ───────────────────────────────────────────────
  // NOTE: Dual Agent transactions count as 2 sides (1 buyer + 1 listing).
  // Volume and commission are NOT doubled — the dollar amounts are already
  // the full deal total. Only the side/unit count is doubled.

  // Calendar-year stats (leaderboard / dashboard performance tracking)
  let closed = 0;
  let pending = 0;
  let listingsActive = 0;
  let listingsCanceled = 0;
  let listingsExpired = 0;
  let closedVolume = 0;
  let totalGCI = 0;
  let agentNetCommission = 0;
  let companyDollar = 0;

  // Anniversary-cycle stats (tier progression)
  let tierProgressionCompanyDollar = 0;

  for (const doc of snap.docs) {
    const t = doc.data() as any;

    // ── Calendar year filter (for leaderboard / performance stats) ──────────
    const txYear =
      toYear(t.closedDate) ??
      toYear(t.contractDate) ??
      (num(t.year) || null);

    const status = String(t.status || '').toLowerCase();
    const txType = String(t.transactionType || '').toLowerCase();
    const isDual = String(t.closingType || '').toLowerCase() === 'dual';
    const sideCount = isDual ? 2 : 1;

    if (txYear === year) {
      // Closed transactions — calendar year
      if (status === 'closed') {
        closed += sideCount;
        closedVolume += num(t.dealValue);
        totalGCI += num(t.commission);
        agentNetCommission += num(t.splitSnapshot?.agentNetCommission ?? t.commission);
        companyDollar += num(t.splitSnapshot?.companyRetained ?? 0);
      }

      // Pending / under contract — calendar year
      if (status === 'pending' || status === 'under_contract') {
        pending += sideCount;
      }

      // Listings (active, canceled, expired) — calendar year
      if (txType === 'listing' || txType === 'residential_listing') {
        if (status === 'active' || status === 'listing_active') {
          listingsActive += 1;
        } else if (status === 'canceled' || status === 'cancelled') {
          listingsCanceled += 1;
        } else if (status === 'expired') {
          listingsExpired += 1;
        }
      }
    }

    // ── Anniversary cycle filter (for tier progression) ─────────────────────
    if (status === 'closed') {
      const txDateUtc = toUtcDate(t.closedDate) ?? toUtcDate(t.contractDate);
      if (txDateUtc && isInCycle(txDateUtc, cycle)) {
        const personalCompanyDollar = num(t.splitSnapshot?.companyRetained ?? 0);
        tierProgressionCompanyDollar += personalCompanyDollar;
      }
    }
  }

  // ── 2b. Add team member production to tier progression (leader only) ──────
  // Fetch all closed transactions where this agent is the progression leader.
  // These are team member transactions that credit toward the leader's tier.
  // They do NOT affect leaderboard stats (closed, volume, GCI) — only tier.
  try {
    const memberSnap = await db
      .collection('transactions')
      .where('creditSnapshot.progressionLeaderAgentId', '==', agentId)
      .get();

    for (const doc of memberSnap.docs) {
      const t = doc.data() as any;

      // Only count closed transactions for tier progression
      const status = String(t.status || '').toLowerCase();
      if (status !== 'closed') continue;

      // Only count transactions within the anniversary cycle
      const txDateUtc = toUtcDate(t.closedDate) ?? toUtcDate(t.contractDate);
      if (!txDateUtc || !isInCycle(txDateUtc, cycle)) continue;

      // Use progressionCompanyDollarCredit if available; fall back to commission
      const credit = num(
        t.creditSnapshot?.progressionCompanyDollarCredit ?? t.commission
      );
      tierProgressionCompanyDollar += credit;
    }
  } catch {
    // Non-fatal: Firestore composite index may not exist yet.
    // tierProgressionCompanyDollar will fall back to personal-only value.
  }

  const totalTransactions = closed + pending;
  const totalListings = listingsActive + listingsCanceled + listingsExpired;
  const totalAll = totalTransactions + totalListings;

  // ── 3. Build the rollup document ─────────────────────────────────────────
  const rollupData: Record<string, any> = {
    agentId,
    year,
    displayName,
    agentStatus,
    ...(avatarUrl ? { avatarUrl } : {}),

    // Calendar-year performance stats (leaderboard / dashboard)
    closed,
    pending,
    listings: {
      active: listingsActive,
      canceled: listingsCanceled,
      expired: listingsExpired,
    },
    totals: {
      transactions: totalTransactions,
      listings: totalListings,
      all: totalAll,
    },
    closedVolume,
    totalGCI,
    agentNetCommission,
    companyDollar,

    // Anniversary-cycle tier progression stats
    // For non-team-leader agents: equals personal companyDollar within the cycle.
    // For team leaders: includes team member production credits within the cycle.
    tierProgressionCompanyDollar,
    // Store the cycle boundaries so the commission API and dashboard can display them
    cycleStart: cycle.cycleStart.toISOString().slice(0, 10),
    cycleEnd: cycle.cycleEnd.toISOString().slice(0, 10),
    cycleYear: cycle.cycleYear,

    // Metadata
    rebuiltAt: new Date().toISOString(),
    rebuiltFromLedger: true,
  };

  // ── 4. Upsert the rollup document ─────────────────────────────────────────
  // Document ID convention: "{agentId}_{year}"
  const docId = `${agentId}_${year}`;
  await db.collection('agentYearRollups').doc(docId).set(rollupData, { merge: true });
}

// ── Batch rebuild ─────────────────────────────────────────────────────────────

/**
 * Rebuild rollups for ALL agents for a given year.
 * Reads all transactions for the year, groups by agentId, then rebuilds each.
 * Also rebuilds rollups for any team leaders credited by member transactions.
 *
 * @param db   Firestore Admin instance
 * @param year Calendar year to rebuild
 * @returns    Number of agent rollups rebuilt
 */
export async function rebuildAllRollupsForYear(
  db: Firestore,
  year: number
): Promise<{ rebuilt: number; agentIds: string[] }> {
  // Fetch all transactions — we'll filter by year in memory
  const snap = await db.collection('transactions').get();

  // Collect unique agentIds that have transactions in this year.
  // Also collect team leader agentIds from creditSnapshot so their
  // tierProgressionCompanyDollar is rebuilt even if they have no personal
  // transactions in the year.
  const agentIds = new Set<string>();
  for (const doc of snap.docs) {
    const t = doc.data() as any;
    let txYear: number | null = null;
    const cd = t.closedDate ? new Date(typeof t.closedDate?.toDate === 'function' ? t.closedDate.toDate() : t.closedDate) : null;
    const ctd = t.contractDate ? new Date(typeof t.contractDate?.toDate === 'function' ? t.contractDate.toDate() : t.contractDate) : null;
    if (cd && !isNaN(cd.getTime())) txYear = cd.getFullYear();
    else if (ctd && !isNaN(ctd.getTime())) txYear = ctd.getFullYear();
    else if (t.year && typeof t.year === 'number') txYear = t.year;

    if (txYear === year) {
      const aid = String(t.agentId || '').trim();
      if (aid) agentIds.add(aid);

      // Also ensure the progression leader's rollup is rebuilt
      const leaderId = String(t.creditSnapshot?.progressionLeaderAgentId || '').trim();
      if (leaderId && leaderId !== aid) agentIds.add(leaderId);
    }
  }

  // Rebuild each agent's rollup (sequentially to avoid Firestore write storms)
  const rebuilt: string[] = [];
  for (const agentId of agentIds) {
    await rebuildAgentRollup(db, agentId, year);
    rebuilt.push(agentId);
  }

  return { rebuilt: rebuilt.length, agentIds: rebuilt };
}
