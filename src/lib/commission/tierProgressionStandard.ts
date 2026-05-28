/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              TIER PROGRESSION STANDARD — DO NOT CHANGE                     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  Tier thresholds (fromCompanyDollar / toCompanyDollar fields on AgentTier,  ║
 * ║  MemberPlanBand, and TeamThresholdBand) store GROSS COMMISSION INCOME (GCI) ║
 * ║  values — the FULL commission on the transaction BEFORE any agent/broker    ║
 * ║  split. This is intentional and matches what admins enter in the UI.        ║
 * ║                                                                              ║
 * ║  CORRECT source for tier progression YTD:                                   ║
 * ║    splitSnapshot.grossCommission  ← total GCI before splits                 ║
 * ║    rollup field: tierProgressionGci                                          ║
 * ║                                                                              ║
 * ║  WRONG source (do NOT use for tier comparison):                              ║
 * ║    splitSnapshot.companyRetained  ← broker's cut after split (e.g. 20%)     ║
 * ║    creditSnapshot.progressionCompanyDollarCredit  ← also post-split         ║
 * ║    rollup field: tierProgressionCompanyDollar  ← kept for backward compat   ║
 * ║                                                                              ║
 * ║  Example (80/20 split, $15,000 GCI transaction):                            ║
 * ║    grossCommission        = $15,000  ← USE THIS for tier lookup             ║
 * ║    companyRetained        =  $3,000  ← DO NOT use for tier lookup           ║
 * ║    agentNetCommission     = $12,000                                          ║
 * ║                                                                              ║
 * ║  Tier 2 threshold = $100,000 GCI.                                            ║
 * ║  Agent with $225,000 GCI YTD → correctly in Tier 2.                         ║
 * ║  Agent with $33,000 company-dollar YTD → WRONG, stays in Tier 1.            ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Files that implement this standard (all must use tierProgressionGci):       ║
 * ║                                                                              ║
 * ║  1. src/lib/rollups/rebuildAgentRollup.ts                                    ║
 * ║     → accumulates tierProgressionGci = sum of splitSnapshot.grossCommission  ║
 * ║       within the agent's anniversary cycle                                   ║
 * ║                                                                              ║
 * ║  2. src/app/api/transactions/_lib/teamTransactionResolver.ts                 ║
 * ║     → getAgentYtdCompanyDollar() reads tierProgressionGci from rollup        ║
 * ║       for live tier lookup when a transaction is being saved                 ║
 * ║                                                                              ║
 * ║  3. src/app/api/admin/agent-profiles/[agentId]/commission/route.ts           ║
 * ║     → all return paths read tierProgressionGci and return ytdTierProgressionGci ║
 * ║       so the Add Transaction form shows the correct tier badge               ║
 * ║                                                                              ║
 * ║  4. src/app/api/dashboard/route.ts                                           ║
 * ║     → grossGCIYTD uses splitSnapshot.grossCommission for the tier            ║
 * ║       progress bar on the agent dashboard                                    ║
 * ║                                                                              ║
 * ║  5. src/app/dashboard/transactions/new/page.tsx                              ║
 * ║     → findActiveTier() uses ytdTierProgressionGci from the commission API    ║
 * ║       response to determine which tier to display in the badge               ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * The rollup field name that stores total GCI within the anniversary cycle.
 * Use this field — not tierProgressionCompanyDollar — for all tier comparisons.
 */
export const TIER_PROGRESSION_ROLLUP_FIELD = 'tierProgressionGci' as const;

/**
 * The API response field name returned by the commission API for tier lookup.
 * The Add Transaction form and any other consumer must use this field.
 */
export const TIER_PROGRESSION_API_FIELD = 'ytdTierProgressionGci' as const;

/**
 * Helper: reads the correct YTD GCI value from a rollup document.
 * Falls back to tierProgressionCompanyDollar for rollup docs that predate
 * the June 2026 fix (before tierProgressionGci was added).
 */
export function readTierProgressionGci(rollupData: Record<string, any>): number {
  return Number(
    rollupData.tierProgressionGci ??
    rollupData.tierProgressionCompanyDollar ??
    rollupData.companyDollar ??
    0
  );
}

/**
 * Helper: reads the correct YTD GCI value from a commission API response.
 * Falls back to ytdTierProgressionCompanyDollar for backward compatibility.
 */
export function readYtdTierProgressionGci(apiResponse: Record<string, any>): number {
  return Number(
    apiResponse.ytdTierProgressionGci ??
    apiResponse.ytdTierProgressionCompanyDollar ??
    0
  );
}
