import { isPassThroughTransaction } from '@/lib/transactions/isPassThroughTransaction';

/**
 * Applies the approved pass-through policy to the same canonical transaction
 * record used by all operational editors. A pass-through remains a closed sale
 * with its price and side/volume credit, but it cannot retain brokerage GCI,
 * agent commission, company dollar, or tier-credit economics after a save.
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

  // Preserve price and commission-rate context for audit/reference purposes,
  // but zero the financial values that must never be credited on a pass-through.
  updates.gci = 0;
  updates.commission = 0;
  updates.commissionFlatAmount = 0;
  updates.agentPct = 0;
  updates.agentDollar = 0;
  updates.brokerPct = 0;
  updates.brokerGci = 0;
  updates.manualGciOverride = false;

  updates.splitSnapshot = {
    ...existingSplit,
    ...proposedSplit,
    grossCommission: 0,
    referralFeeDollar: 0,
    netAfterReferral: 0,
    agentSplitPercent: 0,
    companySplitPercent: 0,
    agentNetCommission: 0,
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
