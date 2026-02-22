import type { Firestore } from "firebase/firestore";
import { getDocs, collection } from "firebase/firestore";
import { fetchRollupsWithOverrides, type EffectiveRollup } from "@/lib/overrides";
import type { ProductionLeaderboardRow, NewActivityRollup } from "@/lib/types";

// A map of agentId to display name and avatar, to be populated from the 'users' collection.
const agentProfileCache = new Map<string, { name: string; avatarUrl?: string }>();

async function populateAgentProfileCache(db: Firestore, agentIds: string[]) {
    // In a real app, you'd query the 'users' collection for the agentIds
    // to get their display names and avatar URLs. For this example, we'll
    // create derived names from the agentId.
    for (const agentId of agentIds) {
        if (!agentProfileCache.has(agentId)) {
            // e.g. 'ashley-lombas' -> 'Ashley L.'
            const name = agentId
                .split('-')
                .map((part, index) => 
                    index === 0 
                        ? part.charAt(0).toUpperCase() + part.slice(1)
                        : `${part.charAt(0).toUpperCase()}.`
                )
                .join(' ');
            
            agentProfileCache.set(agentId, { name });
        }
    }
}


/**
 * Fetches and merges agent year rollups with any active historical overrides.
 * This is the canonical way to read historical or current rollup data for displays
 * like leaderboards based on annual totals.
 * 
 * @param db The Firestore instance.
 * @param year The year to fetch data for.
 * @returns A promise that resolves to an array of effective rollup data.
 */
export async function getEffectiveRollups(db: Firestore, year: number): Promise<EffectiveRollup[]> {
    try {
        return await fetchRollupsWithOverrides(db, year);
    } catch (error) {
        console.error("Error in getEffectiveRollups:", error);
        throw new Error("Failed to fetch effective rollups.");
    }
}

export async function getLeaderboardRows(db: Firestore, year: number): Promise<ProductionLeaderboardRow[]> {
    try {
        const effectiveRollups = await getEffectiveRollups(db, year);

        if (effectiveRollups.length === 0) {
            return [];
        }

        // Populate agent display names for the UI
        await populateAgentProfileCache(db, effectiveRollups.map(r => r.agentId));

        const leaderboardRows: ProductionLeaderboardRow[] = effectiveRollups.map(rollup => {
            const profile = agentProfileCache.get(rollup.agentId);
            return {
                agentId: rollup.agentId,
                displayName: profile?.name || rollup.agentId,
                avatarUrl: profile?.avatarUrl,
                closed: rollup.closed || 0,
                pending: rollup.pending || 0,
                total: (rollup.closed || 0) + (rollup.pending || 0),
                isCorrected: rollup.isCorrected,
                correctionReason: rollup.correctionReason,
            };
        });

        // Sort by closed transactions descending as the primary sort key
        leaderboardRows.sort((a, b) => b.closed - a.closed);
        
        return leaderboardRows;

    } catch (error) {
        console.error("Error in getLeaderboardRows:", error);
        throw new Error("Failed to generate leaderboard rows.");
    }
}


/**
 * NOTE: This function is a placeholder.
 * The `NewActivityRollup` type requires individual transaction data (address, price) which
 * is not present in the `agentYearRollups` collection. This service will need to
 * be updated to source data from a `transactions` collection to function correctly.
 */
export async function getNewActivityRows(db: Firestore, year:number): Promise<NewActivityRollup> {
    console.warn("getNewActivityRows is using placeholder logic and not real data.");
    // Returning an empty structure to prevent breaking the UI.
    return {
        lookbackDays: 60,
        generatedAt: new Date().toISOString(),
        newListings: [],
        newContracts: [],
    };
}
