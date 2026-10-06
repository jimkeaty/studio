import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import {
  allocateOutboundReferralAcrossCoAgents,
  resolveOutboundReferral,
} from '@/lib/transactions/outboundReferral';
import { validateCoAgentSplit } from '@/lib/transactions/coAgentSplitValidation';

type AnyRecord = Record<string, any>;

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Builds the accounting allocation stored on one shared transaction document.
 * It deliberately never creates or deletes transaction documents.
 */
export async function buildCoAgentAllocationUpdate(
  db: FirebaseFirestore.Firestore,
  transaction: AnyRecord,
): Promise<Record<string, any>> {
  const coAgent = transaction.coAgent as AnyRecord | null | undefined;
  const coAgentId = String(coAgent?.agentId || transaction.coAgentId || '').trim();
  const coAgentSplit = validateCoAgentSplit(transaction);
  if (!coAgentSplit.active || !coAgentId) return {};
  if (!coAgentSplit.valid) throw new Error(coAgentSplit.error || 'Invalid co-agent split');
  const coPercent = coAgentSplit.coAgentPercent ?? 50;
  const primaryPercent = coAgentSplit.primaryPercent ?? 50;
  const totalGci = money(transaction.gci ?? transaction.commission);
  const salePrice = money(transaction.salePrice ?? transaction.listPrice);
  // This is a separate pass-through amount. It must never be folded into GCI,
  // split snapshots, company retained, or transaction-fee calculations.
  const totalAgentBonus = money(transaction.agentBonusPassThrough);
  const coAgentBonus = money(totalAgentBonus / 2);
  const primaryAgentBonus = money(totalAgentBonus - coAgentBonus);

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
  const referral = resolveOutboundReferral(transaction, totalGci);
  const referralAllocation = referral.active
    ? allocateOutboundReferralAcrossCoAgents(referral.referralFeeDollar, primaryPercent)
    : null;
  const primaryReferralDollar = referralAllocation?.primaryReferralFeeDollar ?? null;
  const coReferralDollar = referralAllocation?.coAgentReferralFeeDollar ?? null;

  const [primaryCalc, coCalc] = await Promise.all([
    primaryAgentId
      ? resolveTransactionCalculation({
        agentId: primaryAgentId,
        agentDisplayName: primaryAgentName,
        commission: primaryGci,
        referralFeePercent: referral.active ? referral.referralFeePercent : null,
        referralFeeDollar: primaryReferralDollar,
      })
      : Promise.resolve(null),
    resolveTransactionCalculation({
      agentId: coAgentId,
      agentDisplayName: coAgentName,
      commission: coGci,
      referralFeePercent: referral.active ? referral.referralFeePercent : null,
      referralFeeDollar: coReferralDollar,
    }),
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
    // Ledger convenience fields must match the canonical primary snapshot.
    agentDollar: primarySnapshot?.agentNetCommission ?? transaction.agentDollar ?? null,
    brokerGci: primarySnapshot?.companyRetained ?? transaction.brokerGci ?? null,
    agentNetCommission: primarySnapshot?.agentNetCommission ?? transaction.agentNetCommission ?? null,
    companyRetained: primarySnapshot?.companyRetained ?? transaction.companyRetained ?? null,
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
        referralFeeDollar: primaryReferralDollar,
        transactionFeeDeduction: primaryFee,
        netCommission: primarySnapshot?.agentNetCommission ?? 0,
        agentBonusPassThrough: primaryAgentBonus,
        totalAgentPayout: money(Number(primarySnapshot?.agentNetCommission ?? 0) + primaryAgentBonus),
      },
      coAgent: {
        agentId: coAgentId,
        agentDisplayName: coAgentName,
        percentage: coPercent,
        volumeCredit: money(salePrice * (coPercent / 100)),
        closedUnitCredit: 1,
        grossCommission: coGci,
        referralFeeDollar: coReferralDollar,
        transactionFeeDeduction: coFee,
        netCommission: coSnapshot?.agentNetCommission ?? 0,
        agentBonusPassThrough: coAgentBonus,
        totalAgentPayout: money(Number(coSnapshot?.agentNetCommission ?? 0) + coAgentBonus),
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
