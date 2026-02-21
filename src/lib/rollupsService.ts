
'use server';

import type { Firestore } from "firebase/firestore";
import { fetchRollupsWithOverrides, type EffectiveRollup } from "@/lib/overrides";
import type { LeaderboardAgentMetrics, NewActivityRollup } from "@/lib/types";

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

/**
 * NOTE: This function is a placeholder.
 * The `LeaderboardRollup` type requires activity metrics (calls, engagements) which
 * are not present in the `agentYearRollups` collection. This service will need to
 * be updated to source data from an aggregation of `dailyLogs` to function correctly.
 */
export async function getLeaderboardRows(db: Firestore, year: number): Promise<LeaderboardAgentMetrics[]> {
    console.warn("getLeaderboardRows is using placeholder logic and not real data.");
    // Returning an empty array to prevent breaking the UI.
    return [];
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
