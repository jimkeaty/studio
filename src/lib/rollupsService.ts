import 'server-only';
import { adminDb } from '@/lib/firebaseAdmin';
import { fetchRollupsWithOverrides, type EffectiveRollup } from '@/lib/overrides';

/**
 * Public server-side helpers used by server components:
 * - /leaderboard
 * - /new-activity
 * - dashboard TopAgents2025
 *
 * These functions MUST remain server-only (Admin SDK).
 */
export async function getEffectiveRollups(year: number): Promise<EffectiveRollup[]> {
  const db = adminDb();
  return fetchRollupsWithOverrides(db, year);
}

/**
 * These are placeholders to preserve your current imports.
 * If your old rollupsService had custom shaping, we’ll re-add it after we confirm the expected output shape.
 */
export async function getLeaderboardRows(year: number = new Date().getFullYear()) {
  const rollups = await getEffectiveRollups(year);
  return rollups;
}

export async function getNewActivityRows(year: number = new Date().getFullYear()) {
  const rollups = await getEffectiveRollups(year);
  return rollups;
}
