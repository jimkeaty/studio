import { resolveCommissionBase, resolveGCI } from '@/lib/commissions';
import { calculatePercentageGrossCommission } from '@/lib/transactions/percentageGrossCommission';

type TransactionFinancials = Record<string, any>;

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

  updates.commissionCalculationMethod = 'percentage';
  updates.commissionFlatAmount = null;
  updates.manualGciOverride = false;

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
