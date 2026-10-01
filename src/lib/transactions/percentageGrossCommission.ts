type GrossCommissionInputs = {
  baseCommission: unknown;
  shortageInCommission?: unknown;
  shortageHandledBy?: unknown;
  shortageAmount?: unknown;
  warrantyAtClosing?: unknown;
  warrantyPaidBy?: unknown;
  warrantyAmount?: unknown;
};

function amount(value: unknown): number {
  const parsed = Number(value) || 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isEnabled(value: unknown): boolean {
  return String(value || '').trim().toLowerCase() === 'yes';
}

function addsToGrossCommission(payer: unknown): boolean {
  return ['buyer', 'seller_closing_cost'].includes(String(payer || '').trim().toLowerCase());
}

/**
 * Calculates the commission that is eligible for internal split and tier lookup.
 *
 * Transaction compliance fees are intentionally absent from these inputs: they are
 * never commission revenue, never GCI, and never split between the brokerage and
 * the agent. Their payer only determines whether the fee is separately deducted
 * from the agent's take-home or simply recorded as a closing charge.
 */
export function calculatePercentageGrossCommission({
  baseCommission,
  shortageInCommission,
  shortageHandledBy,
  shortageAmount,
  warrantyAtClosing,
  warrantyPaidBy,
  warrantyAmount,
}: GrossCommissionInputs): number {
  const base = amount(baseCommission);
  const shortageAddition = isEnabled(shortageInCommission) && addsToGrossCommission(shortageHandledBy)
    ? amount(shortageAmount)
    : 0;
  const warrantyAddition = isEnabled(warrantyAtClosing) && addsToGrossCommission(warrantyPaidBy)
    ? amount(warrantyAmount)
    : 0;
  const warrantyAgentDeduction = isEnabled(warrantyAtClosing) &&
    String(warrantyPaidBy || '').trim().toLowerCase() === 'agent'
    ? amount(warrantyAmount)
    : 0;

  return Number(Math.max(0, base + shortageAddition + warrantyAddition - warrantyAgentDeduction).toFixed(2));
}
