import { collection, getDocs, query, where, Firestore } from 'firebase/firestore';

// Define the shape of the rollup and override documents
// based on the data contract.

export interface AgentYearRollup {
  agentId: string;
  year: number;
  closed: number;
  pending: number;
  listings: {
    active: number;
    canceled: number;
    expired: number;
  };
  totals: {
    transactions: number;
    listings: number;
    all: number;
  };
  locked: boolean;
  // Potentially other fields like volume etc.
  [key: string]: any;
}

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
  if (year >= 2025) {
    console.warn("fetchRollupsWithOverrides should only be used for historical years (< 2025).");
  }

  // 1. Fetch all base rollups for the given year.
  const rollupsQuery = query(collection(db, 'agentYearRollups'), where('year', '==', year));
  const rollupsSnap = await getDocs(rollupsQuery);
  const baseRollups = rollupsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data() as AgentYearRollup
  }));

  // 2. Fetch all active overrides for the same year.
  const overridesQuery = query(
    collection(db, 'historical_overrides'),
    where('year', '==', year),
    where('targetType', '==', 'rollup'),
    where('active', '==', true)
  );
  const overridesSnap = await getDocs(overridesQuery);
  const overridesMap = new Map<string, HistoricalOverride>();
  overridesSnap.forEach(doc => {
    const override = doc.data() as HistoricalOverride;
    overridesMap.set(override.targetKey, override);
  });

  if (overridesMap.size === 0) {
    return baseRollups.map(rollup => ({ ...rollup, isCorrected: false }));
  }

  // 3. Merge overrides into the base rollups.
  const effectiveRollups = baseRollups.map(rollup => {
    const override = overridesMap.get(rollup.id);
    if (override) {
      const mergedRollup = {
        ...rollup,
        ...override.overrideFields, // Apply the override
      };

      // Recalculate totals if individual counts were changed
      if (
        'closed' in override.overrideFields ||
        'pending' in override.overrideFields ||
        'listings' in override.overrideFields
      ) {
          const listings = { ...rollup.listings, ...override.overrideFields.listings };
          mergedRollup.totals = {
            transactions: (mergedRollup.closed || 0) + (mergedRollup.pending || 0),
            listings: (listings.active || 0) + (listings.canceled || 0) + (listings.expired || 0),
            all: 0 // this will be recalculated below
          };
          mergedRollup.totals.all = mergedRollup.totals.transactions + mergedRollup.totals.listings;
      }

      return {
        ...mergedRollup,
        isCorrected: true,
        correctionReason: override.reason,
        overrideUpdatedAt: override.updatedAt.toDate(),
      } as EffectiveRollup;
    } else {
      return {
        ...rollup,
        isCorrected: false,
      } as EffectiveRollup;
    }
  });

  return effectiveRollups;
}