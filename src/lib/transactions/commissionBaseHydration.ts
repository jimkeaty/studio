import { resolveCommissionBase, type CommissionInputs } from '@/lib/commissions';

/**
 * A saved commission base is a deliberate financial input when it differs from
 * the normal status-aware sale/list-price fallback. This commonly reflects a
 * seller concession and must survive reopening the transaction editor.
 */
export function hasExplicitCommissionBaseOverride(inputs: CommissionInputs): boolean {
  const savedBase = Number(inputs.commissionBasePrice) || 0;
  if (savedBase <= 0) return false;

  const automaticBase = resolveCommissionBase({
    ...inputs,
    commissionBasePrice: null,
  });

  return Math.abs(savedBase - automaticBase) > 0.005;
}
