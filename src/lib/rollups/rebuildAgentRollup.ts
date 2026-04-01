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
 * ── Team Leader Tier Progression ─────────────────────────────────────────────
 * For team leaders, `tierProgressionCompanyDollar` accumulates:
 *   1. The leader's own closed transactions (companyRetained from splitSnapshot)
 *   2. All team member transactions where
 *      creditSnapshot.progressionLeaderAgentId === agentId
 *      (using creditSnapshot.progressionCompanyDollarCredit as the amount)
 *
 * `companyDollar` (used by leaderboard / personal dashboard) is PERSONAL ONLY
 * and never includes team member production.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toYear(value: any): number | null {
  if (!value) return null;
  let d: Date | null = null;
  if (typeof value?.toDate === 'function') d = value.toDate();
  else if (value instanceof Date) d = value;
  else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  if (!d || isNaN(d.getTime())) return null;
  return d.getFullYear();
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

  // ── 1. Fetch all transactions for this agent (personal production) ────────
  const snap = await db
    .collection('transactions')
    .where('agentId', '==', agentId)
    .get();

  // ── 2. Filter to the target year and bucket by status ────────────────────
  // NOTE: Dual Agent transactions count as 2 sides (1 buyer + 1 listing).
  // Volume and commission are NOT doubled — the dollar amounts are already
  // the full deal total. Only the side/unit count is doubled.
  let closed = 0;
  let pending = 0;
  let listingsActive = 0;
  let listingsCanceled = 0;
  let listingsExpired = 0;

  let closedVolume = 0;       // sum of dealValue for closed (personal)
  let totalGCI = 0;           // sum of commission (gross) for closed (personal)
  let agentNetCommission = 0; // sum of splitSnapshot.agentNetCommission for closed (personal)
  let companyDollar = 0;      // sum of splitSnapshot.companyRetained for closed (personal)

  // tierProgressionCompanyDollar starts from personal production;
  // team member credits are added in step 2b below.
  let tierProgressionCompanyDollar = 0;

  for (const doc of snap.docs) {
    const t = doc.data() as any;

    // Determine the year this transaction belongs to
    const txYear =
      toYear(t.closedDate) ??
      toYear(t.contractDate) ??
      (num(t.year) || null);

    if (txYear !== year) continue;

    const status = String(t.status || '').toLowerCase();
    const txType = String(t.transactionType || '').toLowerCase();

    // Dual Agent counts as 2 sides (1 buyer + 1 listing)
    const isDual = String(t.closingType || '').toLowerCase() === 'dual';
    const sideCount = isDual ? 2 : 1;

    // Closed transactions
    if (status === 'closed') {
      closed += sideCount;
      closedVolume += num(t.dealValue);
      totalGCI += num(t.commission);
      agentNetCommission += num(t.splitSnapshot?.agentNetCommission ?? t.commission);
      const personalCompanyDollar = num(t.splitSnapshot?.companyRetained ?? 0);
      companyDollar += personalCompanyDollar;
      // Personal production also counts toward own tier progression
      tierProgressionCompanyDollar += personalCompanyDollar;
    }

    // Pending / under contract
    if (status === 'pending' || status === 'under_contract') {
      pending += sideCount;
    }

    // Listings (active, canceled, expired)
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

      // Only count transactions in the target year
      const txYear =
        toYear(t.closedDate) ??
        toYear(t.contractDate) ??
        (num(t.year) || null);
      if (txYear !== year) continue;

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

  // ── 3. Fetch agent profile for displayName / avatarUrl / status ─────────
  let displayName = agentId;
  let avatarUrl: string | null = null;
  let agentStatus: string = 'active'; // default to active if no profile found

  try {
    const profileDoc = await db.collection('agentProfiles').doc(agentId).get();
    if (profileDoc.exists) {
      const p = profileDoc.data() as any;
      displayName =
        String(p.displayName || p.name || p.agentName || '').trim() || agentId;
      avatarUrl = p.avatarUrl ? String(p.avatarUrl) : null;
      agentStatus = String(p.status || 'active');
    }
  } catch {
    // Non-fatal: proceed without profile data
  }

  // ── 4. Build the rollup document ─────────────────────────────────────────
  const rollupData: Record<string, any> = {
    agentId,
    year,
    displayName,
    agentStatus,
    ...(avatarUrl ? { avatarUrl } : {}),
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
    // Financial aggregates — PERSONAL production only (used by leaderboard / dashboard)
    closedVolume,
    totalGCI,
    agentNetCommission,
    companyDollar,
    // Tier progression — personal + team member credits (used by commission tier lookup)
    // For non-team-leader agents this equals companyDollar.
    // For team leaders this includes team member production credits.
    tierProgressionCompanyDollar,
    // Metadata
    rebuiltAt: new Date().toISOString(),
    rebuiltFromLedger: true,
  };

  // ── 5. Upsert the rollup document ─────────────────────────────────────────
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
    const txYear =
      toYear(t.closedDate) ??
      toYear(t.contractDate) ??
      (num(t.year) || null);
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
