import { resolveCommissionBase, resolveGCI } from '@/lib/commissions';
import { calculatePercentageGrossCommission } from '@/lib/transactions/percentageGrossCommission';

type TransactionFinancials = Record<string, any>;

/**
 * Returns the saved exact-dollar commission for a transaction whose selected
 * method is flat_dollar. This keeps a legacy percentage field from being
 * mistaken for the flat dollar amount when the unified editor is reopened.
 */
export function resolveSavedFlatDollarCommission(transaction: TransactionFinancials): number | '' {
  const candidates = [
    transaction.commissionFlatAmount,
    transaction.gci,
    transaction.splitSnapshot?.grossCommission,
    transaction.commission,
  ];

  for (const candidate of candidates) {
    if (candidate === '' || candidate === null || candidate === undefined) continue;
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }

  return '';
}

/**
 * Replaces a previously selected flat-dollar commission with a percentage-based
 * gross commission when an authorized editor explicitly changes the method.
 *
 * A percentage method cannot retain a stale flat GCI: the current commission
 * base and percentage are the source of truth. This helper deliberately keeps
 * flat-dollar behavior untouched; it only normalizes an explicit switch back
 * to percentage mode.
 */
export function normalizePercentageCommissionMethod(
  current: TransactionFinancials,
  updates: TransactionFinancials,
): number | null {
  if (String(updates.commissionCalculationMethod || '').trim().toLowerCase() !== 'percentage') {
    return null;
  }

  const switchingFromFlatDollar =
    String(current.commissionCalculationMethod || '').trim().toLowerCase() === 'flat_dollar' ||
    String(current.commissionMode || '').trim().toLowerCase() === 'flat';

  updates.commissionCalculationMethod = 'percentage';
  updates.commissionFlatAmount = null;
  updates.manualGciOverride = false;
  // A prior flat-dollar file may also have carried a broad manual split override.
  // Once an authorized user explicitly chooses percentage mode, the current
  // percentage and the agent's saved tier must be allowed to rebuild the payout.
  // Do not clear an override on an ordinary percentage-mode save; that would
  // erase an intentional manual broker/agent split.
  if (switchingFromFlatDollar) {
    updates.commissionOverridden = false;
    updates.commissionOverriddenBy = null;
    updates.commissionOverriddenAt = null;
  }

  const effective = { ...current, ...updates };
  const commissionBasePrice = resolveCommissionBase({
    commissionBasePrice: effective.commissionBasePrice,
    salePrice: effective.salePrice,
    listPrice: effective.listPrice,
    status: effective.status,
  });
  const commissionPercent = Number(effective.commissionPercent) || 0;

  if (commissionBasePrice <= 0 || commissionPercent <= 0) {
    return null;
  }

  const baseCommission = resolveGCI({
    commissionBasePrice,
    commissionPercent,
    commissionCalculationMethod: 'percentage',
    gci: null,
  });
  const grossCommission = calculatePercentageGrossCommission({
    baseCommission,
    shortageInCommission: effective.shortageInCommission,
    shortageHandledBy: effective.shortageHandledBy,
    shortageAmount: effective.shortageAmount,
    warrantyAtClosing: effective.warrantyAtClosing,
    warrantyPaidBy: effective.warrantyPaidBy,
    warrantyAmount: effective.warrantyAmount,
  });

  updates.gci = grossCommission;
  updates.commission = grossCommission;
  return grossCommission;
}
