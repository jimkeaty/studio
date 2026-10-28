export type TransactionChangeSummary = {
  hasChanges: boolean;
  section: string;
  sectionLabel: string;
  items: string[];
  body: string;
  changedFields: string[];
};

type SectionMeta = {
  section: string;
  sectionLabel: string;
  label: string;
  valueKind?: 'currency' | 'percent' | 'date' | 'status' | 'text';
  showValues?: boolean;
};

const IGNORED_FIELDS = new Set([
  'updatedAt',
  'lastUpdatedBy',
  'year',
  'splitSnapshot',
  'creditSnapshot',
  'participantAllocations',
  'grossCommission',
  'agentNetCommission',
  'companyRetained',
  'agentType',
  'calculationModel',
  'manualGciOverride',
  'manualCommissionPercentOverriddenBy',
  'manualCommissionPercentOverriddenAt',
  'tcIntakeId',
  'accountingCloseout',
]);

const FIELD_META: Record<string, SectionMeta> = {
  status: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Status', valueKind: 'status', showValues: true },
  address: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Property Address', valueKind: 'text', showValues: true },
  propertyAddress: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Property Address', valueKind: 'text', showValues: true },
  closingType: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Transaction Side', valueKind: 'text', showValues: true },
  dealType: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Deal Type', valueKind: 'text', showValues: true },
  transactionType: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Deal Type', valueKind: 'text', showValues: true },
  dealSource: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'Lead Source', valueKind: 'text', showValues: true },
  mlsNumber: { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: 'MLS Number', valueKind: 'text', showValues: true },
  mlsDescription: { section: 'mls', sectionLabel: 'MLS Description Builder', label: 'MLS Description' },
  listingDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Listing Date', valueKind: 'date', showValues: true },
  listingExpirationDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Listing Expiration Date', valueKind: 'date', showValues: true },
  contractDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Contract Date', valueKind: 'date', showValues: true },
  optionExpiration: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Option Expiration', valueKind: 'date', showValues: true },
  inspectionDeadline: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Inspection Deadline', valueKind: 'date', showValues: true },
  appraisalDeadline: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Appraisal Deadline', valueKind: 'date', showValues: true },
  titleDeadline: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Title Deadline', valueKind: 'date', showValues: true },
  projectedCloseDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Projected Close Date', valueKind: 'date', showValues: true },
  closingDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Close Date', valueKind: 'date', showValues: true },
  closedDate: { section: 'key-dates', sectionLabel: 'Key Dates', label: 'Close Date', valueKind: 'date', showValues: true },
  buyerName: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Buyer Name' },
  buyer2Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Buyer' },
  buyer3Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Buyer' },
  buyer4Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Buyer' },
  sellerName: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Seller Name' },
  seller2Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Seller' },
  seller3Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Seller' },
  seller4Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Seller' },
  clientName: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Client Name' },
  client2Name: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Additional Client' },
  buyerEmail: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Buyer Email' },
  buyerPhone: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Buyer Phone' },
  sellerEmail: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Seller Email' },
  sellerPhone: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Seller Phone' },
  clientEmail: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Client Email' },
  clientPhone: { section: 'parties', sectionLabel: 'Buyer / Seller Information', label: 'Client Phone' },
  otherAgentName: { section: 'cooperating-agent', sectionLabel: 'Cooperating Agent', label: 'Other Agent' },
  otherAgentBrokerage: { section: 'cooperating-agent', sectionLabel: 'Cooperating Agent', label: 'Other Brokerage' },
  mortgageCompany: { section: 'mortgage-lender', sectionLabel: 'Mortgage / Lender', label: 'Mortgage Company' },
  loanOfficer: { section: 'mortgage-lender', sectionLabel: 'Mortgage / Lender', label: 'Loan Officer' },
  loanOfficerEmail: { section: 'mortgage-lender', sectionLabel: 'Mortgage / Lender', label: 'Loan Officer Email' },
  loanOfficerPhone: { section: 'mortgage-lender', sectionLabel: 'Mortgage / Lender', label: 'Loan Officer Phone' },
  titleCompany: { section: 'title-company', sectionLabel: 'Title Company', label: 'Title Company' },
  titleOfficer: { section: 'title-company', sectionLabel: 'Title Company', label: 'Title Officer' },
  titleOfficerEmail: { section: 'title-company', sectionLabel: 'Title Company', label: 'Title Officer Email' },
  titleOfficerPhone: { section: 'title-company', sectionLabel: 'Title Company', label: 'Title Officer Phone' },
  listPrice: { section: 'financial-details', sectionLabel: 'Financial Details', label: 'List Price', valueKind: 'currency', showValues: true },
  salePrice: { section: 'financial-details', sectionLabel: 'Financial Details', label: 'Sale Price', valueKind: 'currency', showValues: true },
  earnestMoney: { section: 'financial-details', sectionLabel: 'Financial Details', label: 'Earnest Money', valueKind: 'currency', showValues: true },
  commissionPercent: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Commission %', valueKind: 'percent', showValues: true },
  commissionBasePrice: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Commission Base Price', valueKind: 'currency', showValues: true },
  commissionCalculationMethod: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Commission Method', valueKind: 'text', showValues: true },
  commissionFlatAmount: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Exact Gross Commission', valueKind: 'currency', showValues: true },
  gci: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Gross Commission', valueKind: 'currency', showValues: true },
  transactionFee: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Transaction Fee', valueKind: 'currency', showValues: true },
  agentBonusPassThrough: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Agent Bonus Pass-Through', valueKind: 'currency', showValues: true },
  agentPct: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Agent Split', valueKind: 'percent', showValues: true },
  brokerPct: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Broker Split', valueKind: 'percent', showValues: true },
  agentDollar: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Agent Net', valueKind: 'currency', showValues: true },
  brokerGci: { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: 'Broker GCI', valueKind: 'currency', showValues: true },
  hasCoAgent: { section: 'cooperating-agent', sectionLabel: 'Co-Agent / Team Split', label: 'Co-Agent' },
  coAgentId: { section: 'cooperating-agent', sectionLabel: 'Co-Agent / Team Split', label: 'Co-Agent' },
  coAgentDisplayName: { section: 'cooperating-agent', sectionLabel: 'Co-Agent / Team Split', label: 'Co-Agent' },
  primaryAgentSplitPercent: { section: 'cooperating-agent', sectionLabel: 'Co-Agent / Team Split', label: 'Primary Agent Split', valueKind: 'percent', showValues: true },
  coAgentSplitPercent: { section: 'cooperating-agent', sectionLabel: 'Co-Agent / Team Split', label: 'Co-Agent Split', valueKind: 'percent', showValues: true },
  mediaRequested: { section: 'media-order', sectionLabel: 'Media Order', label: 'Media Requested' },
  mediaTypes: { section: 'media-order', sectionLabel: 'Media Order', label: 'Media Types' },
  mediaRequestedDate: { section: 'media-order', sectionLabel: 'Media Order', label: 'Media Date', valueKind: 'date', showValues: true },
  mediaNotes: { section: 'media-order', sectionLabel: 'Media Order', label: 'Media Notes' },
  listingMediaFolderUrl: { section: 'media-order', sectionLabel: 'Media Order', label: 'Shared Listing Media Folder' },
  signOrderRequested: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Order' },
  signServiceType: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Service', valueKind: 'text', showValues: true },
  signInstallDate: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Requested Sign Date', valueKind: 'date', showValues: true },
  signRequestedDate: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Requested Sign Date', valueKind: 'date', showValues: true },
  signPlacementAddress: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Placement Address' },
  signPlacementLatitude: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Placement Pin' },
  signPlacementLongitude: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Placement Pin' },
  signPlacementNotes: { section: 'sign-order', sectionLabel: 'Sign Order', label: 'Sign Placement Notes' },
  inspectionOrdered: { section: 'inspections', sectionLabel: 'Inspections', label: 'Inspection Status' },
  targetInspectionDate: { section: 'inspections', sectionLabel: 'Inspections', label: 'Target Inspection Date', valueKind: 'date', showValues: true },
  inspectionTypes: { section: 'inspections', sectionLabel: 'Inspections', label: 'Inspection Types' },
  documents: { section: 'documents', sectionLabel: 'Documents', label: 'Documents' },
  notes: { section: 'additional-information', sectionLabel: 'Additional Information', label: 'Notes' },
  additionalComments: { section: 'additional-information', sectionLabel: 'Additional Information', label: 'Additional Comments' },
};

function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      normalized[key] = normalizeValue(entry);
    }
    return normalized;
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

function formatDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return 'blank';
  const parsed = new Date(`${raw.length === 10 ? `${raw}T12:00:00` : raw}`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function formatValue(value: unknown, kind: SectionMeta['valueKind']): string {
  if (value === undefined || value === null || value === '') return 'blank';
  if (kind === 'date') return formatDate(value);
  if (kind === 'currency') {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : String(value);
  }
  if (kind === 'percent') {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount}%` : String(value);
  }
  if (kind === 'status') return String(value).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  return String(value);
}

function documentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((document) => String((document as Record<string, unknown>)?.name || (document as Record<string, unknown>)?.originalName || '').trim())
    .filter(Boolean);
}

function documentChange(before: unknown, after: unknown): string | null {
  const beforeNames = documentNames(before);
  const afterNames = documentNames(after);
  const beforeSet = new Set(beforeNames);
  const afterSet = new Set(afterNames);
  const added = afterNames.filter(name => !beforeSet.has(name));
  const removed = beforeNames.filter(name => !afterSet.has(name));
  const parts: string[] = [];
  if (added.length > 0) parts.push(`${added.length} added${added.length <= 2 ? ` (${added.join(', ')})` : ''}`);
  if (removed.length > 0) parts.push(`${removed.length} removed${removed.length <= 2 ? ` (${removed.join(', ')})` : ''}`);
  return parts.length > 0 ? `Documents: ${parts.join('; ')}` : null;
}

function genericMeta(field: string): SectionMeta {
  const pretty = field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase());
  if (/date|deadline|expiration/i.test(field)) {
    return { section: 'key-dates', sectionLabel: 'Key Dates', label: pretty, valueKind: 'date', showValues: true };
  }
  if (/commission|gci|price|fee|money|dollar|amount|percent|pct/i.test(field)) {
    return { section: 'commission-fees', sectionLabel: 'Commission & Fees', label: pretty, valueKind: /percent|pct/i.test(field) ? 'percent' : 'currency', showValues: true };
  }
  if (/showing/i.test(field)) return { section: 'showingtime', sectionLabel: 'ShowingTime Setup', label: pretty };
  if (/warranty|occupancy|compliance|shortage/i.test(field)) return { section: 'additional-info', sectionLabel: 'Additional Info', label: pretty };
  return { section: 'transaction-details', sectionLabel: 'Property / Transaction Details', label: pretty };
}

/**
 * Summarizes only verified, persisted differences. Contact values and notes are
 * deliberately not copied into a notification because email/SMS may be enabled.
 */
export function buildTransactionChangeSummary(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  candidateFields: Iterable<string>,
  maxItems = 5,
): TransactionChangeSummary {
  const prior = before || {};
  const saved = after || {};
  const seenLabels = new Set<string>();
  const items: string[] = [];
  const changedFields: string[] = [];
  let section = 'transaction-details';
  let sectionLabel = 'Property / Transaction Details';

  for (const field of [...new Set([...candidateFields])]) {
    if (IGNORED_FIELDS.has(field) || valuesEqual(prior[field], saved[field])) continue;
    const meta = FIELD_META[field] || genericMeta(field);
    let item: string;
    if (field === 'documents') {
      item = documentChange(prior[field], saved[field]) || '';
    } else if (meta.showValues) {
      item = `${meta.label}: ${formatValue(prior[field], meta.valueKind)} → ${formatValue(saved[field], meta.valueKind)}`;
    } else {
      item = `${meta.label} updated`;
    }
    if (!item || seenLabels.has(item)) continue;
    seenLabels.add(item);
    changedFields.push(field);
    if (items.length === 0) {
      section = meta.section;
      sectionLabel = meta.sectionLabel;
    }
    if (items.length < maxItems) items.push(item);
  }

  const remaining = Math.max(0, changedFields.length - items.length);
  const body = items.length > 0
    ? `Changed in ${sectionLabel}:\n• ${items.join('\n• ')}${remaining > 0 ? `\n• ${remaining} more field${remaining === 1 ? '' : 's'} changed` : ''}`
    : '';

  return { hasChanges: items.length > 0, section, sectionLabel, items, body, changedFields };
}

export function transactionChangeUrl(transactionId: string, section: string, role?: 'staff' | 'tc', intakeId?: string): string {
  const params = new URLSearchParams({ edit: transactionId, focus: section });
  if (role && intakeId) {
    params.set('role', role);
    params.set('intakeId', intakeId);
  }
  return `/dashboard/transactions/new?${params.toString()}`;
}
