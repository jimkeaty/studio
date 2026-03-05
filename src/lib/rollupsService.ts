import { adminDb } from '@/lib/firebaseAdmin';
import { fetchRollupsWithOverrides, type EffectiveRollup } from '@/lib/overrides';

/**
 * Public server-side helpers used by:
 * - /api/rollups/leaderboard
 * - /api/rollups/new-activity
 * - /api/rollups/top-agents
 *
 * IMPORTANT: Server-only (Admin SDK). No client Firestore.
 */
export async function getEffectiveRollups(year: number): Promise<EffectiveRollup[]> {
  const db = adminDb();
  return fetchRollupsWithOverrides(db, year);
}

export async function getLeaderboardRows(year: number = new Date().getFullYear()) {
  return getEffectiveRollups(year);
}

export async function getNewActivityRows(year: number = new Date().getFullYear()) {
  return getEffectiveRollups(year);
}

export async function getTopAgentsRows(year: number = new Date().getFullYear()) {
  return getEffectiveRollups(year);
}
