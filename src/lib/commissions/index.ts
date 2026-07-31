/**
 * Centralized commission calculation utilities.
 *
 * All GCI derivation in the application must go through resolveGCI().
 * This ensures commission_base_price is the single source of truth for
 * gross commission calculations, with a consistent fallback chain.
 *
 * Status-aware base price logic:
 *   - Active / Coming Soon / Temp Off Market → use listPrice as fallback
 *   - Pending / Closed / Canceled / any other → use salePrice as fallback
 *   - commissionBasePrice always takes priority when explicitly set
 */

/** Statuses where list price is used as the commission base fallback. */
export const ACTIVE_LISTING_STATUSES = new Set([
  'active',
  'coming_soon',
  'temp_off_market',
]);

export interface CommissionInputs {
  /** Price commission is based on (sale price less seller concessions). Preferred base. */
  commissionBasePrice?: number | null;
  /** Sale price — used as base for pending/closed transactions. */
  salePrice?: number | null;
  /** List price — used as base for active listings when salePrice is absent. */
  listPrice?: number | null;
  /** Transaction status — determines whether listPrice or salePrice is the fallback. */
  status?: string | null;
  /** Commission rate as a percentage (e.g. 3 for 3%). */
  commissionPercent?: number | null;
  /** Explicit GCI dollar amount — takes priority over computed value when > 0. */
  gci?: number | null;
}

/**
 * Returns the effective commission base price, status-aware.
 *
 * Priority:
 *   1. commissionBasePrice (when explicitly set > 0)
 *   2. salePrice (when status is pending/closed/canceled/etc.)
 *   3. listPrice (when status is active/coming_soon/temp_off_market and salePrice is absent)
 *   4. 0
 */
export function resolveCommissionBase(inputs: CommissionInputs): number {
  const cbp = Number(inputs.commissionBasePrice) || 0;
  if (cbp > 0) return cbp;

  const sp = Number(inputs.salePrice) || 0;
  const lp = Number(inputs.listPrice) || 0;
  const status = inputs.status ?? '';

  // For active listings with no sale price yet, use list price
  if (ACTIVE_LISTING_STATUSES.has(status) && sp === 0 && lp > 0) {
    return lp;
  }

  // For pending/closed/all other statuses, prefer salePrice, fall back to listPrice
  return sp || lp || 0;
}

/**
 * Resolves the GCI (Gross Commission Income) dollar amount from commission inputs.
 *
 * Priority:
 *   1. Explicit `gci` when > 0
 *   2. resolveCommissionBase(inputs) × (commissionPercent / 100)
 *   3. 0
 */
export function resolveGCI(inputs: CommissionInputs): number {
  const manualGCI = Number(inputs.gci) || 0;
  if (manualGCI > 0) return manualGCI;

  const base = resolveCommissionBase(inputs);
  const pct = Number(inputs.commissionPercent) || 0;
  if (base > 0 && pct > 0) {
    return Math.round(base * (pct / 100) * 100) / 100;
  }
  return 0;
}

/**
 * Returns true if the commission display should be labeled as "estimated"
 * (i.e., based on list price rather than an actual sale price).
 */
export function isEstimatedCommission(inputs: CommissionInputs): boolean {
  const cbp = Number(inputs.commissionBasePrice) || 0;
  const sp = Number(inputs.salePrice) || 0;
  const status = inputs.status ?? '';
  return cbp === 0 && sp === 0 && ACTIVE_LISTING_STATUSES.has(status);
}
