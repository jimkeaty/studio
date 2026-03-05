import { fetchRollupsWithOverrides, type EffectiveRollup } from '@/lib/overrides';

/**
 * IMPORTANT:
 * - This module must NOT touch Firestore directly.
 * - API routes should create db via adminDb() and pass it in.
 * - Guardrails enforces no Firestore usage here.
 */

export async function getEffectiveRollups(db: any, year: number): Promise<EffectiveRollup[]> {
  return fetchRollupsWithOverrides(db, year);
}

export async function getNewActivityRows(db: any, year: number = new Date().getFullYear()) {
  return getEffectiveRollups(db, year);
}

export async function getTopAgentsRows(db: any, year: number = new Date().getFullYear()) {
  return getEffectiveRollups(db, year);
}
