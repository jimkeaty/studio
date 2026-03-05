import { adminDb } from '@/lib/firebaseAdmin';
import { fetchRollupsWithOverrides, type EffectiveRollup } from '@/lib/overrides';
function humanizeAgentId(agentId: string) {
  return agentId
    .trim()
    .split(/[-_ ]+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
/**
 * Public server-side helpers used by server components:
 * - /leaderboard
 * - /new-activity
 * - dashboard TopAgents2025
 *
 * These functions MUST remain server-only (Admin SDK).
 */
export async function getLeaderboardRows(year: number = new Date().getFullYear()) {
  const rollups = await getEffectiveRollups(year);

  // Shape into what /leaderboard expects (client-safe identity fallbacks)
  return rollups.map((r: any) => {
    const agentId = String(r.agentId ?? r.id ?? 'unknown');

    return {
      agentId,
      displayName: r.displayName ?? humanizeAgentId(agentId),
      avatarUrl: r.avatarUrl ?? null,

      // Leaderboard UI expects numeric counts
      closed: Number(r.closed ?? r.totals?.all ?? 0),
      pending: Number(r.pending ?? 0),

      // Optional correction fields (safe pass-through if present)
      isCorrected: Boolean(r.isCorrected ?? false),
      correctionReason: r.correctionReason ?? null,

      // Keep the original row around if we want extra fields later (safe)
      // but do NOT include Firestore Timestamp objects intentionally here
    };
  });
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
