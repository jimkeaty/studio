type TransactionFinancialRecord = Record<string, any>;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function agentPaysTransactionFee(transaction: TransactionFinancialRecord): boolean {
  const feeAmount = Number(transaction.txComplianceFeeAmount ?? transaction.transactionFeeAmount ?? transaction.transactionFee ?? 0) || 0;
  const payer = String(transaction.txComplianceFeePaidBy ?? transaction.transactionFeePaidBy ?? '').trim().toLowerCase();
  const feeEnabled = transaction.txComplianceFee === 'yes' || (feeAmount > 0 && !!payer);
  return feeEnabled && feeAmount > 0 && payer === 'agent';
}

/**
 * Returns the gross amount allocated to the primary agent before an agent-paid
 * transaction fee. `agentDollar` is the canonical current-form value for that
 * gross split; older records may only contain the saved split snapshot.
 */
export function getAgentGrossSplit(transaction: TransactionFinancialRecord): number {
  const directSplit = numberOrNull(transaction.agentDollar);
  if (directSplit !== null) return directSplit;
  return numberOrNull(transaction.splitSnapshot?.agentNetCommission)
    ?? numberOrNull(transaction.netCommission)
    ?? 0;
}

/**
 * Calculates the amount the primary agent should actually receive at closing.
 * A current split snapshot may already contain the fee deduction; in that
 * case this function intentionally does not subtract it a second time.
 */
export function getAgentTakeHome(
  transaction: TransactionFinancialRecord,
  grossSplitOverride?: number | null,
): number {
  const grossSplit = grossSplitOverride ?? getAgentGrossSplit(transaction);
  if (!agentPaysTransactionFee(transaction)) return roundMoney(Math.max(0, grossSplit));

  const recordedDeduction = Number(transaction.splitSnapshot?.agentFeeDeduction ?? 0) || 0;
  const hasDirectGrossSplit = numberOrNull(transaction.agentDollar) !== null || grossSplitOverride !== undefined;
  if (!hasDirectGrossSplit && recordedDeduction > 0) {
    return roundMoney(Math.max(0, grossSplit));
  }

  const fee = recordedDeduction || Number(transaction.txComplianceFeeAmount ?? transaction.transactionFeeAmount ?? transaction.transactionFee ?? 0) || 0;
  return roundMoney(Math.max(0, grossSplit - fee));
}
