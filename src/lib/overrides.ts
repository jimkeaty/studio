import 'server-only';
import type { FirebaseFirestore } from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

// Keep the exported type because TopAgents2025 imports it.
export type EffectiveRollup = {
  id: string;
  [key: string]: any;
};

type HistoricalOverride = {
  id?: string;
  year: number;
  targetType: 'rollup';
  targetKey: string; // rollup id
  active: boolean;
  patch: Record<string, any>;
};

/**
 * Fetch agent year rollups for a year and apply any active historical overrides.
 * Server-side only (Admin SDK).
 */
export async function fetchRollupsWithOverrides(
  db: FirebaseFirestore.Firestore = adminDb(),
  year: number
): Promise<EffectiveRollup[]> {

  // 1) Base rollups
  const rollupsSnap = await db
    .collection('agentYearRollups')
    .where('year', '==', year)
    .get();

  const base: EffectiveRollup[] = rollupsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // 2) Overrides
  const overridesSnap = await db
    .collection('historical_overrides')
    .where('year', '==', year)
    .where('targetType', '==', 'rollup')
    .where('active', '==', true)
    .get();

  if (overridesSnap.empty) return base;

  const overridesMap = new Map<string, HistoricalOverride>();
  overridesSnap.forEach(d => {
    const data = d.data() as any;
    const ov: HistoricalOverride = {
      id: d.id,
      year: data.year,
      targetType: data.targetType,
      targetKey: data.targetKey,
      active: data.active,
      patch: data.patch ?? {},
    };
    overridesMap.set(ov.targetKey, ov);
  });

  // 3) Merge override patches into rollups
  return base.map(r => {
    const ov = overridesMap.get(r.id);
    if (!ov) return r;
    return {
      ...r,
      ...ov.patch,
      _overrideApplied: true,
    };
  });
}
