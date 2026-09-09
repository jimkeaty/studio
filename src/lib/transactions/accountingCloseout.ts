import type { Firestore } from 'firebase-admin/firestore';
import { getAgentBonusPassThrough } from '@/lib/transactions/resolveAgentBonusPassThrough';
import { resolveGCI } from '@/lib/commissions';
import { isPassThroughTransaction } from '@/lib/transactions/isPassThroughTransaction';

export type AccountingFieldState = 'value' | 'zero' | 'missing' | 'na';
export type AccountingFieldFormat = 'currency' | 'percent' | 'text' | 'date';

export type AccountingActor = {
  uid: string;
  name: string;
  email: string;
};

/**
 * The field list is an accounting review snapshot, not a second transaction
 * record. Values are rebuilt from the canonical transaction on every queue
 * load so corrections made by Admin, Staff, or TC are reflected immediately.
 */
export const ACCOUNTING_FIELDS = [
  { id: 'propertyAddress', label: 'Property address', required: true },
  { id: 'clientNames', label: 'Client name(s)', required: false },
  { id: 'leadSource', label: 'Lead source', required: false },
  { id: 'transactionIdentifier', label: 'Transaction / MLS identifier', required: true },
  { id: 'agents', label: 'Agent(s)', required: true },
  { id: 'listingDate', label: 'List date', required: false },
  { id: 'contractDate', label: 'Under contract date', required: false },
  { id: 'projectedCloseDate', label: 'Projected close date', required: false },
  { id: 'listingExpirationDate', label: 'Expiration date', required: false },
  { id: 'closeDate', label: 'Close date', required: true },
  { id: 'listPrice', label: 'List price', required: false },
  { id: 'salePrice', label: 'Sales price', required: true },
  { id: 'commissionPercent', label: 'Commission percentage', required: false },
  { id: 'grossGci', label: 'GCI', required: true },
  { id: 'transactionFee', label: 'Transaction fee', required: true },
  { id: 'listingFee', label: 'Listing fee', required: false },
  { id: 'brokerPercent', label: 'Broker percentage', required: false },
  { id: 'brokerGci', label: 'Broker GCI', required: true },
  { id: 'referral', label: 'Referral', required: false },
  { id: 'agentPercent', label: 'Percent to agent', required: false },
  { id: 'agentNet', label: 'Agent net commission', required: true },
  { id: 'bonuses', label: 'Agent bonus pass-through', required: false },
  { id: 'totalAgentPayout', label: 'Total agent payout', required: false },
  { id: 'inHouse', label: 'In-house', required: true },
  { id: 'dualAgent', label: 'Dual agent', required: true },
  { id: 'warranty', label: 'Warranty type and amount', required: false },
] as const;

export type AccountingField = {
  id: (typeof ACCOUNTING_FIELDS)[number]['id'];
  label: string;
  required: boolean;
  state: AccountingFieldState;
  value: string | number | boolean | null;
  detail?: string | null;
  format?: AccountingFieldFormat;
};

function textState(value: unknown): AccountingFieldState {
  return String(value ?? '').trim() ? 'value' : 'missing';
}

function numberState(value: unknown): AccountingFieldState {
  if (value === null || value === undefined || value === '') return 'missing';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'missing';
  return number === 0 ? 'zero' : 'value';
}

function yesNoState(value: unknown): AccountingFieldState {
  return typeof value === 'boolean' || ['yes', 'no', 'true', 'false'].includes(String(value ?? '').toLowerCase())
    ? 'value'
    : 'missing';
}

function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstMoney(...values: unknown[]): number | null {
  for (const value of values) {
    const resolved = money(value);
    if (resolved !== null) return resolved;
  }
  return null;
}

function percent(value: unknown): number | null {
  const resolved = money(value);
  return resolved !== null && resolved >= 0 && resolved <= 100 ? resolved : null;
}

function firstPercent(...values: unknown[]): number | null {
  for (const value of values) {
    const resolved = percent(value);
    if (resolved !== null) return resolved;
  }
  return null;
}

function boolValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').toLowerCase().trim();
  if (normalized === 'yes' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;
  return null;
}

function present(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueNames(...values: unknown[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = present(value);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names.join(', ');
}

function dateValue(value: unknown): string | null {
  const date = present(value);
  return date || null;
}

function amountDetail(percentValue: number | null, dollarValue: number | null): string {
  const parts: string[] = [];
  if (percentValue !== null) parts.push(`${percentValue}%`);
  if (dollarValue !== null) parts.push(`$${dollarValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return parts.join(' / ');
}

function referralSummary(transaction: Record<string, any>, split: Record<string, any>): string | null {
  const outbound = transaction.outboundReferralFee && typeof transaction.outboundReferralFee === 'object'
    ? transaction.outboundReferralFee
    : {};
  const inbound = transaction.inboundReferralFee && typeof transaction.inboundReferralFee === 'object'
    ? transaction.inboundReferralFee
    : {};
  const outboundPercent = firstPercent(transaction.outboundReferralFeePercent, outbound.referralPercent, split.referralFeePercent);
  const outboundDollar = firstMoney(transaction.outboundReferralFeeDollar, outbound.referralDollar, split.referralFeeDollar);
  const inboundPercent = firstPercent(transaction.inboundReferralFeePercent, inbound.referralPercent);
  const inboundDollar = firstMoney(transaction.inboundReferralFeeDollar, inbound.referralDollar);
  const outboundName = present(transaction.outboundReferralAgentName || outbound.agentName || outbound.name);
  const inboundName = present(transaction.inboundReferralAgentName || inbound.agentName || inbound.name);
  const lines: string[] = [];
  if (transaction.hasOutboundReferral || outboundName || outboundPercent !== null || outboundDollar !== null) {
    lines.push(`Outbound${outboundName ? ` — ${outboundName}` : ''}${amountDetail(outboundPercent, outboundDollar) ? ` (${amountDetail(outboundPercent, outboundDollar)})` : ''}`);
  }
  if (transaction.hasInboundReferral || inboundName || inboundPercent !== null || inboundDollar !== null) {
    lines.push(`Inbound${inboundName ? ` — ${inboundName}` : ''}${amountDetail(inboundPercent, inboundDollar) ? ` (${amountDetail(inboundPercent, inboundDollar)})` : ''}`);
  }
  return lines.length ? lines.join('; ') : null;
}

export function buildAccountingSnapshot(transaction: Record<string, any>, transactionId: string) {
  const split = (transaction.splitSnapshot || {}) as Record<string, any>;
  const primaryAgent = present(transaction.agentDisplayName || transaction.agentName || transaction.agentId);
  const coAgent = present(transaction.coAgentDisplayName || transaction.coAgentName || transaction.coAgent?.displayName || transaction.coAgentId);
  const agents = uniqueNames(primaryAgent, coAgent);
  const clientNames = uniqueNames(
    transaction.clientName,
    transaction.client2Name,
    transaction.buyerName,
    transaction.buyer2Name,
    transaction.sellerName,
    transaction.seller2Name,
  );
  const closingType = present(transaction.closingType || transaction.transactionType).toLowerCase();
  const dualValue = ['dual', 'dual_agent', 'dual agent'].includes(closingType)
    ? true
    : (transaction.isDualAgent ?? transaction.dualAgent ?? false);
  const inHouseValue = boolValue(transaction.isInHouse ?? transaction.inHouse ?? transaction.inHouseTransaction);
  const warrantyType = present(transaction.warrantyType || transaction.warrantyAtClosing);
  const warrantyAmount = money(transaction.warrantyAmount);
  const transactionFee = firstMoney(transaction.txComplianceFeeAmount, transaction.buyerTransactionFee, transaction.transactionFeeAmount, transaction.transactionFee);
  const listingFee = firstMoney(transaction.listingFee);
  const isPassThrough = isPassThroughTransaction(transaction);
  const grossGci = resolveGCI({
    commissionBasePrice: money(transaction.commissionBasePrice),
    salePrice: money(transaction.salePrice),
    listPrice: money(transaction.listPrice),
    status: transaction.status,
    commissionPercent: percent(transaction.commissionPercent),
    gci: money(transaction.gci),
    commissionCalculationMethod: transaction.commissionCalculationMethod,
    commissionFlatAmount: money(transaction.commissionFlatAmount),
    isPassThrough,
    dealSource: transaction.dealSource,
  });
  const brokerPercent = firstPercent(split.companySplitPercent, transaction.brokerPct);
  const brokerGci = isPassThrough ? 0 : firstMoney(split.companyRetained, transaction.brokerGci, transaction.companyDollar);
  const agentPercent = firstPercent(split.agentSplitPercent, transaction.agentPct);
  const agentNet = isPassThrough ? 0 : firstMoney(split.agentNetCommission, transaction.agentDollar, transaction.agentNetCommission, transaction.netCommission);
  const bonus = getAgentBonusPassThrough(transaction);
  const totalAgentPayout = agentNet === null ? null : Math.round((agentNet + bonus) * 100) / 100;
  const referral = referralSummary(transaction, split);

  const fields: AccountingField[] = [
    { id: 'propertyAddress', label: 'Property address', required: true, state: textState(transaction.propertyAddress || transaction.address), value: present(transaction.propertyAddress || transaction.address) || null, format: 'text' },
    { id: 'clientNames', label: 'Client name(s)', required: false, state: textState(clientNames), value: clientNames || null, format: 'text' },
    { id: 'leadSource', label: 'Lead source', required: false, state: textState(transaction.dealSource || transaction.source), value: present(transaction.dealSource || transaction.source) || null, format: 'text' },
    { id: 'transactionIdentifier', label: 'Transaction / MLS identifier', required: true, state: textState(transaction.mlsNumber || transactionId), value: present(transaction.mlsNumber || transactionId) || null, format: 'text' },
    { id: 'agents', label: 'Agent(s)', required: true, state: textState(agents), value: agents || null, format: 'text' },
    { id: 'listingDate', label: 'List date', required: false, state: textState(transaction.listingDate), value: dateValue(transaction.listingDate), format: 'date' },
    { id: 'contractDate', label: 'Under contract date', required: false, state: textState(transaction.contractDate), value: dateValue(transaction.contractDate), format: 'date' },
    { id: 'projectedCloseDate', label: 'Projected close date', required: false, state: textState(transaction.projectedCloseDate), value: dateValue(transaction.projectedCloseDate), format: 'date' },
    { id: 'listingExpirationDate', label: 'Expiration date', required: false, state: textState(transaction.listingExpirationDate || transaction.optionExpiration), value: dateValue(transaction.listingExpirationDate || transaction.optionExpiration), format: 'date' },
    { id: 'closeDate', label: 'Close date', required: true, state: textState(transaction.closedDate || transaction.closingDate), value: dateValue(transaction.closedDate || transaction.closingDate), format: 'date' },
    { id: 'listPrice', label: 'List price', required: false, state: numberState(transaction.listPrice), value: money(transaction.listPrice), format: 'currency' },
    { id: 'salePrice', label: 'Sales price', required: true, state: numberState(transaction.salePrice), value: money(transaction.salePrice), format: 'currency' },
    { id: 'commissionPercent', label: 'Commission percentage', required: false, state: numberState(transaction.commissionPercent), value: percent(transaction.commissionPercent), format: 'percent' },
    { id: 'grossGci', label: 'GCI', required: true, state: grossGci === 0 ? 'zero' : 'value', value: grossGci, format: 'currency' },
    { id: 'transactionFee', label: 'Transaction fee', required: true, state: numberState(transactionFee), value: transactionFee, detail: present(transaction.txComplianceFeePaidBy || transaction.transactionFeePayer) || null, format: 'currency' },
    { id: 'listingFee', label: 'Listing fee', required: false, state: numberState(listingFee), value: listingFee, detail: present(transaction.listingFeePaidBy || transaction.transactionFeePaidBy) || null, format: 'currency' },
    { id: 'brokerPercent', label: 'Broker percentage', required: false, state: numberState(brokerPercent), value: brokerPercent, format: 'percent' },
    { id: 'brokerGci', label: 'Broker GCI', required: true, state: numberState(brokerGci), value: brokerGci, format: 'currency' },
    { id: 'referral', label: 'Referral', required: false, state: textState(referral), value: referral, format: 'text' },
    { id: 'agentPercent', label: 'Percent to agent', required: false, state: numberState(agentPercent), value: agentPercent, format: 'percent' },
    { id: 'agentNet', label: 'Agent net commission', required: true, state: numberState(agentNet), value: agentNet, format: 'currency' },
    { id: 'bonuses', label: 'Agent bonus pass-through', required: false, state: bonus === 0 ? 'zero' : 'value', value: bonus, format: 'currency' },
    { id: 'totalAgentPayout', label: 'Total agent payout', required: false, state: numberState(totalAgentPayout), value: totalAgentPayout, detail: totalAgentPayout === null ? null : 'Agent net commission + bonus', format: 'currency' },
    { id: 'inHouse', label: 'In-house', required: true, state: yesNoState(inHouseValue), value: inHouseValue, format: 'text' },
    { id: 'dualAgent', label: 'Dual agent', required: true, state: yesNoState(dualValue), value: boolValue(dualValue), format: 'text' },
    { id: 'warranty', label: 'Warranty type and amount', required: false, state: warrantyType ? (warrantyAmount === null ? 'value' : numberState(warrantyAmount)) : 'na', value: warrantyAmount, detail: warrantyType || 'N/A', format: 'currency' },
  ];

  return { transactionId, capturedAt: new Date().toISOString(), fields };
}

export function requiredAccountingFieldsMissing(
  snapshot: ReturnType<typeof buildAccountingSnapshot>,
  fieldOverrides: Record<string, 'na' | undefined> = {},
) {
  return snapshot.fields
    .filter((field) => field.required && field.state === 'missing' && fieldOverrides[field.id] !== 'na')
    .map((field) => field.id);
}

export async function writeProcessingHistory(
  db: Firestore,
  transactionId: string,
  entry: { action: string; detail: string; actor: AccountingActor; metadata?: Record<string, any> },
) {
  await db.collection('transactions').doc(transactionId).collection('processingHistory').add({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

export async function handoffClosedTransactionToAccounting(
  db: Firestore,
  transactionId: string,
  actor: AccountingActor,
) {
  const txRef = db.collection('transactions').doc(transactionId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) throw new Error('Linked transaction was not found');
  const transaction = txDoc.data() as Record<string, any>;
  const current = (transaction.accountingCloseout || {}) as Record<string, any>;
  if (current.status && !['completed', 'archived'].includes(String(current.status))) return current;

  const now = new Date().toISOString();
  const snapshot = buildAccountingSnapshot(transaction, transactionId);
  const accountingCloseout = {
    ...current,
    status: 'new',
    snapshot,
    fieldOverrides: current.fieldOverrides || {},
    tcCompletedAt: current.tcCompletedAt || now,
    tcCompletedBy: current.tcCompletedBy || actor,
    handedOffAt: now,
    handedOffBy: actor,
    notificationSentAt: now,
    assignedToUid: null,
    assignedToName: null,
    updatedAt: now,
  };
  await txRef.set({
    departmentalProcessing: {
      ...(transaction.departmentalProcessing || {}),
      tcStaffCloseout: { status: 'completed', completedAt: accountingCloseout.tcCompletedAt, completedBy: accountingCloseout.tcCompletedBy },
      accounting: { status: 'new', handedOffAt: now, handedOffBy: actor },
    },
    accountingCloseout,
    updatedAt: now,
  }, { merge: true });
  await writeProcessingHistory(db, transactionId, {
    action: 'Accounting handoff created',
    detail: 'TC/Staff closeout completed and the closed transaction was sent to Accounting.',
    actor,
  });
  return accountingCloseout;
}
