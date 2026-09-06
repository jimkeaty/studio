import type { Firestore } from 'firebase-admin/firestore';

export type AccountingFieldState = 'value' | 'zero' | 'missing' | 'na';

export type AccountingActor = {
  uid: string;
  name: string;
  email: string;
};

export const ACCOUNTING_FIELDS = [
  { id: 'propertyAddress', label: 'Property / address', required: true },
  { id: 'transactionIdentifier', label: 'Transaction / MLS identifier', required: true },
  { id: 'agents', label: 'Agent(s)', required: true },
  { id: 'closeDate', label: 'Close date', required: true },
  { id: 'salePrice', label: 'Sales price', required: true },
  { id: 'totalCommission', label: 'Total commission', required: true },
  { id: 'grossGci', label: 'Gross GCI', required: true },
  { id: 'companyDollar', label: 'Company commission / company dollar', required: true },
  { id: 'agentCommission', label: 'Agent commission', required: true },
  { id: 'bonuses', label: 'Agent bonus pass-throughs', required: false },
  { id: 'inHouse', label: 'In-house', required: true },
  { id: 'dualAgent', label: 'Dual agent', required: true },
  { id: 'warranty', label: 'Warranty type and amount', required: false },
  { id: 'transactionFee', label: 'Transaction fee and payer', required: true },
  { id: 'listingFee', label: 'Listing fee and payer', required: true },
] as const;

type AccountingField = {
  id: (typeof ACCOUNTING_FIELDS)[number]['id'];
  label: string;
  required: boolean;
  state: AccountingFieldState;
  value: string | number | boolean | null;
  detail?: string | null;
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

export function buildAccountingSnapshot(transaction: Record<string, any>, transactionId: string) {
  const split = transaction.splitSnapshot || {};
  const primaryAgent = present(transaction.agentDisplayName || transaction.agentName || transaction.agentId);
  const coAgent = present(transaction.coAgentDisplayName || transaction.coAgentName || transaction.coAgentId);
  const agents = [primaryAgent, coAgent].filter(Boolean).join(', ');
  const closingType = present(transaction.closingType || transaction.transactionType).toLowerCase();
  const dualValue = ['dual', 'dual_agent', 'dual agent'].includes(closingType)
    ? true
    : (transaction.isDualAgent ?? transaction.dualAgent ?? false);
  const inHouseValue = boolValue(transaction.isInHouse ?? transaction.inHouse ?? transaction.inHouseTransaction);
  const warrantyType = present(transaction.warrantyType || transaction.warrantyAtClosing);
  const warrantyAmount = money(transaction.warrantyAmount);
  const transactionFee = money(transaction.txComplianceFeeAmount ?? transaction.buyerTransactionFee ?? transaction.transactionFeeAmount);
  const listingFee = money(transaction.listingFee ?? transaction.transactionFee);
  const totalCommission = money(split.grossCommission ?? transaction.commission ?? transaction.gci);
  const grossGci = money(transaction.gci ?? split.grossCommission ?? transaction.commission);
  const companyDollar = money(split.companyRetained ?? transaction.brokerGci ?? transaction.companyDollar);
  const agentCommission = money(split.agentNetCommission ?? transaction.agentDollar);
  const bonus = money(transaction.agentBonusPassThrough) ?? 0;

  const fields: AccountingField[] = [
    { id: 'propertyAddress', label: 'Property / address', required: true, state: textState(transaction.propertyAddress || transaction.address), value: present(transaction.propertyAddress || transaction.address) || null },
    { id: 'transactionIdentifier', label: 'Transaction / MLS identifier', required: true, state: textState(transaction.mlsNumber || transactionId), value: present(transaction.mlsNumber || transactionId) || null },
    { id: 'agents', label: 'Agent(s)', required: true, state: textState(agents), value: agents || null },
    { id: 'closeDate', label: 'Close date', required: true, state: textState(transaction.closedDate || transaction.closingDate), value: present(transaction.closedDate || transaction.closingDate) || null },
    { id: 'salePrice', label: 'Sales price', required: true, state: numberState(transaction.salePrice), value: money(transaction.salePrice) },
    { id: 'totalCommission', label: 'Total commission', required: true, state: numberState(totalCommission), value: totalCommission },
    { id: 'grossGci', label: 'Gross GCI', required: true, state: numberState(grossGci), value: grossGci },
    { id: 'companyDollar', label: 'Company commission / company dollar', required: true, state: numberState(companyDollar), value: companyDollar },
    { id: 'agentCommission', label: 'Agent commission', required: true, state: numberState(agentCommission), value: agentCommission },
    { id: 'bonuses', label: 'Agent bonus pass-throughs', required: false, state: numberState(bonus), value: bonus },
    { id: 'inHouse', label: 'In-house', required: true, state: yesNoState(inHouseValue), value: inHouseValue },
    { id: 'dualAgent', label: 'Dual agent', required: true, state: yesNoState(dualValue), value: boolValue(dualValue) },
    { id: 'warranty', label: 'Warranty type and amount', required: false, state: warrantyType ? (warrantyAmount === null ? 'value' : numberState(warrantyAmount)) : 'na', value: warrantyAmount, detail: warrantyType || 'N/A' },
    { id: 'transactionFee', label: 'Transaction fee and payer', required: true, state: numberState(transactionFee), value: transactionFee, detail: present(transaction.txComplianceFeePaidBy || transaction.transactionFeePayer) || null },
    { id: 'listingFee', label: 'Listing fee and payer', required: true, state: numberState(listingFee), value: listingFee, detail: present(transaction.listingFeePaidBy || transaction.transactionFeePaidBy) || null },
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
