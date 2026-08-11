import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';

type AnyRecord = Record<string, any>;

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clampPercent(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}

/**
 * Builds the accounting allocation stored on one shared transaction document.
 * It deliberately never creates or deletes transaction documents.
 */
export async function buildCoAgentAllocationUpdate(
  db: Firestore,
  transaction: AnyRecord,
): Promise<AnyRecord> {
  const coAgent = transaction.coAgent as AnyRecord | null | undefined;
  const coAgentId = String(coAgent?.agentId || transaction.coAgentId || '').trim();
  if (!transaction.hasCoAgent || !coAgentId) return {};

  const coPercent = clampPercent(
    transaction.coAgentSplitPercent ?? coAgent?.splitPercent ?? transaction.coListingAgentSplit,
    50,
  );
  const primaryPercent = clampPercent(
    transaction.primaryAgentSplitPercent ?? coAgent?.primarySplitPercent,
    100 - coPercent,
  );
  const totalGci = money(transaction.gci ?? transaction.commission);
  const salePrice = money(transaction.salePrice ?? transaction.listPrice);

  const feeAmount = transaction.txComplianceFee === 'yes'
    ? money(transaction.txComplianceFeeAmount)
    : 0;
  const feePaidBy = String(transaction.txComplianceFeePaidBy || '');
  const feeMode = String(transaction.txComplianceFeeAgentAllocation || 'primary_agent');
  let primaryFee = 0;
  let coFee = 0;
  if (feePaidBy === 'agent' && feeAmount > 0) {
    if (feeMode === 'co_agent') coFee = feeAmount;
    else if (feeMode === 'split_equal') {
      primaryFee = money(feeAmount / 2);
      coFee = money(feeAmount - primaryFee);
    } else if (feeMode === 'custom') {
      primaryFee = Math.min(feeAmount, Math.max(0, money(transaction.txComplianceFeePrimaryAgentAmount)));
      coFee = money(feeAmount - primaryFee);
    } else {
      primaryFee = feeAmount;
    }
  }

  const primaryAgentId = String(transaction.agentId || '').trim();
  const primaryAgentName = String(transaction.agentDisplayName || '').trim();
  const coAgentName = String(coAgent?.agentDisplayName || coAgent?.agentName || transaction.coAgentDisplayName || '').trim();
  const primaryGci = money(totalGci * (primaryPercent / 100));
  const coGci = money(totalGci * (coPercent / 100));

  const [primaryCalc, coCalc] = await Promise.all([
    primaryAgentId
      ? resolveTransactionCalculation({ agentId: primaryAgentId, agentDisplayName: primaryAgentName, commission: primaryGci, referralFeePercent: null })
      : Promise.resolve(null),
    resolveTransactionCalculation({ agentId: coAgentId, agentDisplayName: coAgentName, commission: coGci, referralFeePercent: null }),
  ]);

  const primarySnapshot = primaryCalc?.splitSnapshot
    ? { ...primaryCalc.splitSnapshot, agentNetCommission: money(Number(primaryCalc.splitSnapshot.agentNetCommission ?? 0) - primaryFee) }
    : null;
  const coSnapshot = coCalc?.splitSnapshot
    ? { ...coCalc.splitSnapshot, agentNetCommission: money(Number(coCalc.splitSnapshot.agentNetCommission ?? 0) - coFee) }
    : null;

  const canonicalCoAgent = {
    ...(coAgent || {}),
    agentId: coAgentId,
    agentDisplayName: coAgentName,
    agentName: coAgentName,
    splitPercent: coPercent,
    primarySplitPercent: primaryPercent,
    // Volume follows percentage; units are intentionally credited as one per participant.
    sideCredit: coPercent / 100,
    unitCredit: 1,
    transactionFeeDeduction: coFee,
    splitSnapshot: coSnapshot,
    creditSnapshot: coCalc?.creditSnapshot ?? coAgent?.creditSnapshot ?? null,
  };

  return {
    hasCoAgent: true,
    primaryAgentSplitPercent: primaryPercent,
    primaryAgentSideCredit: primaryPercent / 100,
    primaryAgentUnitCredit: 1,
    txComplianceFeeAgentAllocation: feeMode,
    txComplianceFeePrimaryAgentAmount: primaryFee,
    txComplianceFeeCoAgentAmount: coFee,
    splitSnapshot: primarySnapshot ?? transaction.splitSnapshot ?? null,
    creditSnapshot: primaryCalc?.creditSnapshot ?? transaction.creditSnapshot ?? null,
    coAgent: canonicalCoAgent,
    participantAllocations: {
      version: 1,
      primary: {
        agentId: primaryAgentId,
        agentDisplayName: primaryAgentName,
        percentage: primaryPercent,
        volumeCredit: money(salePrice * (primaryPercent / 100)),
        closedUnitCredit: 1,
        grossCommission: primaryGci,
        transactionFeeDeduction: primaryFee,
        netCommission: primarySnapshot?.agentNetCommission ?? 0,
      },
      coAgent: {
        agentId: coAgentId,
        agentDisplayName: coAgentName,
        percentage: coPercent,
        volumeCredit: money(salePrice * (coPercent / 100)),
        closedUnitCredit: 1,
        grossCommission: coGci,
        transactionFeeDeduction: coFee,
        netCommission: coSnapshot?.agentNetCommission ?? 0,
      },
      transactionFee: {
        amount: feeAmount,
        paidBy: feePaidBy,
        allocationMode: feeMode,
        primaryAgentAmount: primaryFee,
        coAgentAmount: coFee,
      },
      updatedAt: new Date().toISOString(),
    },
  };
}
