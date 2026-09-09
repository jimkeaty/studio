import { isPassThroughTransaction } from '@/lib/transactions/isPassThroughTransaction';
import { resolveGCI } from '@/lib/commissions';

/**
 * Applies the approved pass-through policy to the same canonical transaction
 * record used by all operational editors. A pass-through remains a closed sale
 * with its price and side/volume credit. When an actual commission check is
 * received, the agent retains 100% of the net commission before any separate
 * agent-paid fee. The brokerage retains no company dollar and the transaction
 * remains excluded from company-GCI and tier-progress reporting.
 */
export function enforcePassThroughFinancialPolicy(
  currentTransaction: Record<string, any>,
  updates: Record<string, any>,
): boolean {
  const merged = { ...currentTransaction, ...updates };
  if (!isPassThroughTransaction(merged)) return false;

  const existingSplit = currentTransaction.splitSnapshot || {};
  const proposedSplit = updates.splitSnapshot || {};
  const existingCredit = currentTransaction.creditSnapshot || {};
  const proposedCredit = updates.creditSnapshot || {};

  // Persist a canonical boolean even when the selection originated from the
  // legacy deal-source field. This lets every queue and report identify it.
  updates.isPassThrough = true;

  // The gross commission and outbound referral deduction remain visible for
  // payout and Accounting review. The agent receives 100% of the amount left
  // after any outbound referral; transaction fees are shown separately and
  // deducted only in the Agent Take Home display.
  const grossCommission = resolveGCI({
    commissionBasePrice: Number(merged.commissionBasePrice) || null,
    salePrice: Number(merged.salePrice) || null,
    listPrice: Number(merged.listPrice) || null,
    status: merged.status,
    commissionPercent: Number(merged.commissionPercent) || null,
    gci: Number(merged.gci ?? merged.commission) || null,
    commissionCalculationMethod: merged.commissionCalculationMethod,
    commissionFlatAmount: Number(merged.commissionFlatAmount) || null,
  });
  const referralFee = Number(
    proposedSplit.referralFeeDollar ?? existingSplit.referralFeeDollar ??
    merged.outboundReferralFeeDollar ?? merged.outboundReferralFee?.referralDollar ?? 0,
  ) || 0;
  const agentNetCommission = Math.max(0, Math.round((grossCommission - referralFee) * 100) / 100);

  updates.gci = grossCommission;
  updates.commission = grossCommission;
  updates.agentPct = 100;
  updates.agentDollar = agentNetCommission;
  updates.brokerPct = 0;
  updates.brokerGci = 0;

  updates.splitSnapshot = {
    ...existingSplit,
    ...proposedSplit,
    grossCommission,
    referralFeeDollar: referralFee || null,
    netAfterReferral: agentNetCommission,
    agentSplitPercent: 100,
    companySplitPercent: 0,
    agentNetCommission,
    leaderStructureGross: 0,
    memberPaid: 0,
    leaderRetainedAfterMember: 0,
    companyRetained: 0,
  };
  updates.creditSnapshot = {
    ...existingCredit,
    ...proposedCredit,
    progressionCompanyDollarCredit: 0,
  };
  return true;
}
