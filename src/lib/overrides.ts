
import { collection, getDocs, query, where, Firestore } from 'firebase/firestore';
import type { AgentYearRollup } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Define the shape of the override document
// based on the data contract.
export interface HistoricalOverride {
  targetKey: string;
  year: number;
  agentId: string;
  overrideFields: Partial<AgentYearRollup>;
  reason: string;
  updatedAt: any; // Firestore Timestamp
  active: boolean;
}

export interface EffectiveRollup extends AgentYearRollup {
  id: string; // The document ID, e.g. "ashley-lombas_2023"
  isCorrected: boolean;
  correctionReason?: string;
  overrideUpdatedAt?: Date;
}

/**
 * Fetches agent year rollups for a given year and applies any active historical overrides.
 * This provides an "effective" view of the historical data, combining the original record
 * with any corrections.
 *
 * @param db The Firestore instance.
 * @param year The year for which to fetch data.
 * @returns A promise that resolves to an array of effective rollup data.
 */
export async function fetchRollupsWithOverrides(db: Firestore, year: number): Promise<EffectiveRollup[]> {
  const isHistoricalYear = year < 2025;

  // 1. Fetch all base rollups for the given year.
  const rollupsQuery = query(collection(db, 'agentYearRollups'), where('year', '==', year));
  
  let rollupsSnap;
  try {
    rollupsSnap = await getDocs(rollupsQuery);
  } catch(err) {
    errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'agentYearRollups',
        operation: 'list',
    }));
    throw err;
  }

  const baseRollups: EffectiveRollup[] = rollupsSnap.docs.map(doc => ({
    id: doc.id,
    ...(doc.data() as AgentYearRollup),
    isCorrected: false,
  }));

  if (!isHistoricalYear || baseRollups.length === 0) {
    return baseRollups;
  }

  // 2. Fetch all active overrides for the same year.
  const overridesQuery = query(
    collection(db, 'historical_overrides'),
    where('year', '==', year),
    where('targetType', '==', 'rollup'),
    where('active', '==', true)
  );
  
  let overridesSnap;
  try {
    overridesSnap = await getDocs(overridesQuery);
  } catch (err) {
    errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'historical_overrides',
        operation: 'list',
    }));
    throw err;
  }
  
  if (overridesSnap.empty) {
    return baseRollups;
  }
  
  const overridesMap = new Map<string, HistoricalOverride>();
  overridesSnap.forEach(doc => {
    const override = doc.data() as HistoricalOverride;
    overridesMap.set(override.targetKey, override);
  });

  // 3. Merge overrides into the base rollups.
  return baseRollups.map(rollup => {
    const override = overridesMap.get(rollup.id);
    if (override) {
      return {
        ...rollup,
        ...override.overrideFields,
        isCorrected: true,
        correctionReason: override.reason,
        overrideUpdatedAt: override.updatedAt?.toDate(),
      };
    }
    return rollup;
  });
}
