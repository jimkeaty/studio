/**
 * Centralized commission calculation utilities.
 *
 * All GCI derivation in the application must go through resolveGCI().
 * This ensures commission_base_price is the single source of truth for
 * gross commission calculations, with a consistent fallback chain.
 */

export interface CommissionInputs {
  /** Price commission is based on (sale price less seller concessions). Preferred base. */
  commissionBasePrice?: number | null;
  /** Sale price — fallback when commissionBasePrice is absent. */
  salePrice?: number | null;
  /** Commission rate as a percentage (e.g. 3 for 3%). */
  commissionPercent?: number | null;
  /** Explicit GCI dollar amount — takes priority over computed value when > 0. */
  gci?: number | null;
}

/**
 * Resolves the GCI (Gross Commission Income) dollar amount from commission inputs.
 *
 * Priority:
 *   1. Explicit `gci` when > 0
 *   2. (commissionBasePrice || salePrice) × (commissionPercent / 100)
 *   3. 0
 */
export function resolveGCI(inputs: CommissionInputs): number {
  const manualGCI = Number(inputs.gci) || 0;
  if (manualGCI > 0) return manualGCI;

  const base = Number(inputs.commissionBasePrice) || Number(inputs.salePrice) || 0;
  const pct = Number(inputs.commissionPercent) || 0;
  if (base > 0 && pct > 0) {
    return Math.round(base * (pct / 100) * 100) / 100;
  }
  return 0;
}

/**
 * Returns the effective commission base price.
 * Prefers commissionBasePrice; falls back to salePrice; then 0.
 */
export function resolveCommissionBase(inputs: CommissionInputs): number {
  return Number(inputs.commissionBasePrice) || Number(inputs.salePrice) || 0;
}
