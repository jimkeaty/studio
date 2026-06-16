/**
 * splitCoAgentTransaction
 *
 * When a transaction with a co-agent is moved to "closed" status, this utility:
 *   1. Reads the original transaction document.
 *   2. Calculates each agent's proportional share of salePrice, GCI, and compliance fee.
 *   3. Looks up each agent's commission tier independently via resolveTransactionCalculation.
 *   4. Creates two new transaction documents — one per agent.
 *   5. Deletes the original combined transaction document.
 *   6. Rebuilds rollups for both agents.
 *   7. Sends a "Transaction Split" notification to both agents.
 *
 * Returns the IDs of the two newly created transactions, or null if the transaction
 * does not qualify for splitting (no co-agent, already split, etc.).
 */

import { adminDb } from '@/lib/firebase/admin';
import { resolveTransactionCalculation } from '@/app/api/transactions/_lib/teamTransactionResolver';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { sendNotification } from '@/lib/notifications/sendNotification';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SplitResult {
  primaryTransactionId: string;
  coAgentTransactionId: string;
}

export async function splitCoAgentTransaction(
  originalTxId: string,
): Promise<SplitResult | null> {
  const txRef = adminDb.collection('transactions').doc(originalTxId);
  const txSnap = await txRef.get();
  if (!txSnap.exists) return null;

  const tx = txSnap.data() as Record<string, any>;

  // Only split if there is a valid co-agent
  const hasCoAgent = !!tx.hasCoAgent;
  const coAgentData = tx.coAgent as Record<string, any> | undefined;
  const coAgentId = String(coAgentData?.agentId || '').trim();
  // agentDisplayName may not be stored when added via admin edit form — fall back to agentId slug
  const coAgentDisplayName = String(coAgentData?.agentDisplayName || coAgentData?.agentId || '').trim();
  if (!hasCoAgent || !coAgentId) return null;

  // Guard: do not re-split a transaction that was already created by a split
  if (tx.source === 'co_agent_split') return null;

  // ── Split percentages ────────────────────────────────────────────────────────
  // Support multiple field name conventions used by different form paths:
  //   coAgentData.coAgentSplitPct  — admin edit form (PATCH via admin transactions route)
  //   coAgentData.splitPercent     — agent new transaction form
  //   tx.coAgentSplitPercent       — top-level legacy field
  const coSplitPct: number = Number(
    coAgentData?.coAgentSplitPct ??
    coAgentData?.splitPercent ??
    tx.coAgentSplitPercent ??
    50
  );
  const primarySplitPct: number = Number(
    coAgentData?.primarySplitPct ??
    tx.primaryAgentSplitPercent ??
    (100 - coSplitPct)
  );

  // ── Proportional values ──────────────────────────────────────────────────────
  const totalSalePrice = Number(tx.salePrice ?? 0);
  const totalGci = Number(tx.commission ?? tx.gci ?? 0);
  const commissionPct = Number(tx.commissionPercent ?? 0);
  const totalTxFee = Number(tx.txComplianceFeeAmount ?? 0);

  const primarySalePrice = round2(totalSalePrice * (primarySplitPct / 100));
  const coSalePrice = round2(totalSalePrice * (coSplitPct / 100));

  const primaryGci = round2(totalGci * (primarySplitPct / 100));
  const coGci = round2(totalGci * (coSplitPct / 100));

  const primaryFee = totalTxFee > 0 ? round2(totalTxFee * (primarySplitPct / 100)) : null;
  const coFee = totalTxFee > 0 ? round2(totalTxFee * (coSplitPct / 100)) : null;

  // Commission base price: use (salePrice - sellerConcessions) when populated, otherwise salePrice.
  // This is the price commissions are actually calculated on — NOT dealValue.
  // dealValue is a user-entered field not used in any calculations.
  const storedCBP = Number(tx.commissionBasePrice ?? 0);
  const totalCommissionBasePrice = storedCBP > 0 ? storedCBP : totalSalePrice;
  const primaryCommissionBasePrice = round2(totalCommissionBasePrice * (primarySplitPct / 100));
  const coCommissionBasePrice = round2(totalCommissionBasePrice * (coSplitPct / 100));

  // ── Commission tier lookups ──────────────────────────────────────────────────
  const primaryAgentId = String(tx.agentId || '').trim();
  const primaryAgentDisplayName = String(tx.agentDisplayName || '').trim();

  let primaryCalc: Awaited<ReturnType<typeof resolveTransactionCalculation>> | null = null;
  let coCalc: Awaited<ReturnType<typeof resolveTransactionCalculation>> | null = null;

  // Referral fee is proportional to each agent's share of the GCI
  const referralFee = tx.outboundReferralFee as Record<string, any> | undefined;
  const referralPct = referralFee ? Number(referralFee.referralPercent ?? 0) : 0;

  try {
    primaryCalc = await resolveTransactionCalculation({
      agentId: primaryAgentId,
      agentDisplayName: primaryAgentDisplayName,
      commission: primaryGci,
      referralFeePercent: referralPct > 0 ? referralPct : null,
    });
  } catch (err) {
    console.warn('[splitCoAgentTransaction] Primary agent tier lookup failed:', err);
  }

  try {
    coCalc = await resolveTransactionCalculation({
      agentId: coAgentId,
      agentDisplayName: coAgentDisplayName,
      commission: coGci,
      referralFeePercent: referralPct > 0 ? referralPct : null,
    });
  } catch (err) {
    console.warn('[splitCoAgentTransaction] Co-agent tier lookup failed:', err);
  }

  // ── Build shared base payload (all non-commission, non-agent fields) ─────────
  const now = new Date().toISOString();
  const year = Number(tx.year ?? new Date().getFullYear());

  // Fields that are the same on both split transactions
  const basePayload: Record<string, any> = {
    // Identity — will be overridden per agent below
    status: 'closed',
    transactionType: tx.transactionType ?? null,
    closingType: tx.closingType ?? null,
    dealType: tx.dealType ?? null,
    dealSource: tx.dealSource ?? null,

    // Property
    address: tx.address ?? tx.propertyAddress ?? null,
    clientName: tx.clientName ?? null,
    clientType: tx.clientType ?? null,
    clientEmail: tx.clientEmail ?? null,
    clientPhone: tx.clientPhone ?? null,
    clientNewAddress: tx.clientNewAddress ?? null,
    client2Name: tx.client2Name ?? null,
    client2Email: tx.client2Email ?? null,
    client2Phone: tx.client2Phone ?? null,

    // Buyer / Seller contacts
    buyerName: tx.buyerName ?? null,
    buyerEmail: tx.buyerEmail ?? null,
    buyerPhone: tx.buyerPhone ?? null,
    buyer2Name: tx.buyer2Name ?? null,
    buyer2Email: tx.buyer2Email ?? null,
    buyer2Phone: tx.buyer2Phone ?? null,
    sellerName: tx.sellerName ?? null,
    sellerEmail: tx.sellerEmail ?? null,
    sellerPhone: tx.sellerPhone ?? null,
    seller2Name: tx.seller2Name ?? null,
    seller2Email: tx.seller2Email ?? null,
    seller2Phone: tx.seller2Phone ?? null,

    // Dates
    listingDate: tx.listingDate ?? null,
    contractDate: tx.contractDate ?? null,
    closedDate: tx.closedDate ?? null,
    projectedCloseDate: tx.projectedCloseDate ?? null,
    optionExpiration: tx.optionExpiration ?? null,
    inspectionDeadline: tx.inspectionDeadline ?? null,
    surveyDeadline: tx.surveyDeadline ?? null,
    loanApplicationDeadline: tx.loanApplicationDeadline ?? null,
    appraisalDeadline: tx.appraisalDeadline ?? null,
    titleDeadline: tx.titleDeadline ?? null,
    finalLoanCommitmentDeadline: tx.finalLoanCommitmentDeadline ?? null,

    // Commission %
    commissionPercent: commissionPct,
    listPrice: tx.listPrice ?? null,

    // Compliance fee
    txComplianceFee: totalTxFee > 0 ? 'yes' : (tx.txComplianceFee ?? null),
    txComplianceFeePaidBy: tx.txComplianceFeePaidBy ?? null,

    // Other agent / lender / title
    otherAgentName: tx.otherAgentName ?? null,
    otherAgentEmail: tx.otherAgentEmail ?? null,
    otherAgentPhone: tx.otherAgentPhone ?? null,
    otherBrokerage: tx.otherBrokerage ?? null,
    mortgageCompany: tx.mortgageCompany ?? null,
    loanOfficer: tx.loanOfficer ?? null,
    loanOfficerEmail: tx.loanOfficerEmail ?? null,
    loanOfficerPhone: tx.loanOfficerPhone ?? null,
    lenderOffice: tx.lenderOffice ?? null,
    titleCompany: tx.titleCompany ?? null,
    titleOfficer: tx.titleOfficer ?? null,
    titleOfficerEmail: tx.titleOfficerEmail ?? null,
    titleOfficerPhone: tx.titleOfficerPhone ?? null,
    titleAttorney: tx.titleAttorney ?? null,
    titleOffice: tx.titleOffice ?? null,

    // Additional info
    warrantyAtClosing: tx.warrantyAtClosing ?? null,
    warrantyPaidBy: tx.warrantyPaidBy ?? null,
    occupancyDates: tx.occupancyDates ?? null,
    shortageAmount: tx.shortageAmount ?? null,
    buyerBringToClosing: tx.buyerBringToClosing ?? null,
    earnestMoney: tx.earnestMoney ?? null,
    buyerClosingCostTotal: tx.buyerClosingCostTotal ?? null,
    buyerClosingCostAgentCommission: tx.buyerClosingCostAgentCommission ?? null,
    buyerClosingCostTxFee: tx.buyerClosingCostTxFee ?? null,
    buyerClosingCostOther: tx.buyerClosingCostOther ?? null,
    sellerPayingListingAgent: tx.sellerPayingListingAgent ?? null,
    sellerPayingListingAgentUnknown: tx.sellerPayingListingAgentUnknown ?? null,
    sellerPayingBuyerAgent: tx.sellerPayingBuyerAgent ?? null,

    // Notes & documents
    notes: tx.notes ?? null,
    additionalComments: tx.additionalComments ?? null,
    documents: Array.isArray(tx.documents) ? tx.documents : [],

    // Audit trail
    source: 'co_agent_split',
    splitFromTransactionId: originalTxId,
    intakeId: tx.intakeId ?? null,
    year,
    createdAt: now,
    updatedAt: now,

    // Outbound referral fee — carried through to both split transactions
    outboundReferralFee: tx.outboundReferralFee ?? null,

    // No co-agent on split transactions
    hasCoAgent: false,
    coAgent: null,
    primaryAgentSplitPercent: null,
    coAgentSplitPercent: null,
  };

  // ── Primary agent transaction ────────────────────────────────────────────────
  const primaryPayload: Record<string, any> = {
    ...basePayload,
    agentId: primaryAgentId,
    agentDisplayName: primaryAgentDisplayName,
    agentType: primaryCalc?.agentType ?? tx.agentType ?? null,
    calculationModel: primaryCalc?.calculationModel ?? tx.calculationModel ?? null,
    salePrice: primarySalePrice,
    commissionBasePrice: primaryCommissionBasePrice,
    commission: primaryGci,
    gci: primaryGci,
    txComplianceFeeAmount: primaryFee,
    splitSnapshot: primaryCalc?.splitSnapshot ?? null,
    creditSnapshot: primaryCalc?.creditSnapshot ?? null,
    // Store the split context so agents can see what the original deal was
    coSplitContext: {
      originalTxId,
      totalSalePrice,
      totalGci,
      primarySplitPct,
      coSplitPct,
      coAgentId,
      coAgentDisplayName,
    },
  };

  // ── Co-agent transaction ─────────────────────────────────────────────────────
  const coPayload: Record<string, any> = {
    ...basePayload,
    agentId: coAgentId,
    agentDisplayName: coAgentDisplayName,
    agentType: coCalc?.agentType ?? null,
    calculationModel: coCalc?.calculationModel ?? null,
    salePrice: coSalePrice,
    commissionBasePrice: coCommissionBasePrice,
    commission: coGci,
    gci: coGci,
    txComplianceFeeAmount: coFee,
    splitSnapshot: coCalc?.splitSnapshot ?? null,
    creditSnapshot: coCalc?.creditSnapshot ?? null,
    // Store the split context so agents can see what the original deal was
    coSplitContext: {
      originalTxId,
      totalSalePrice,
      totalGci,
      primarySplitPct,
      coSplitPct,
      primaryAgentId,
      primaryAgentDisplayName,
    },
  };

  // ── Write to Firestore ───────────────────────────────────────────────────────
  const [primaryRef, coRef] = await Promise.all([
    adminDb.collection('transactions').add(primaryPayload),
    adminDb.collection('transactions').add(coPayload),
  ]);

  // Delete the original combined transaction
  await txRef.delete();

  // ── Rebuild rollups ──────────────────────────────────────────────────────────
  await Promise.allSettled([
    rebuildAgentRollup(adminDb, primaryAgentId, year),
    rebuildAgentRollup(adminDb, coAgentId, year),
  ]);

  // ── Notify both agents ───────────────────────────────────────────────────────
  const address = String(tx.address ?? tx.propertyAddress ?? 'your transaction');
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  void sendNotification(adminDb, {
    type: 'co_agent_split',
    recipientUids: [primaryAgentId],
    title: 'Transaction Closed & Split',
    body: `${address} has been closed. Your share: ${fmt(primaryGci)} GCI (${primarySplitPct}%).`,
    url: `/dashboard/transactions/${primaryRef.id}`,
  }).catch((err) => console.warn('[splitCoAgentTransaction] Primary notification failed:', err));

  void sendNotification(adminDb, {
    type: 'co_agent_split',
    recipientUids: [coAgentId],
    title: 'Transaction Closed & Split',
    body: `${address} has been closed. Your share: ${fmt(coGci)} GCI (${coSplitPct}%).`,
    url: `/dashboard/transactions/${coRef.id}`,
  }).catch((err) => console.warn('[splitCoAgentTransaction] Co-agent notification failed:', err));

  return {
    primaryTransactionId: primaryRef.id,
    coAgentTransactionId: coRef.id,
  };
}
