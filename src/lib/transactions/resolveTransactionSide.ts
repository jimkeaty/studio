export type TransactionSide = 'buyer' | 'listing' | 'dual' | 'referral';

export type TransactionSideResolutionSource =
  | 'closing_type'
  | 'side'
  | 'legacy_type'
  | 'referral_marker'
  | 'unresolved';

export type TransactionSideResolution = {
  side: TransactionSide | null;
  source: TransactionSideResolutionSource;
  /** True only when the record lacks enough evidence to safely choose a side. */
  requiresManualReview: boolean;
  /** True when the displayed side was inferred and must not be written merely by viewing/saving another field. */
  preventsAutomaticPersistence: boolean;
};

export type TransactionSideRecord = {
  closingType?: unknown;
  side?: unknown;
  type?: unknown;
  transactionType?: unknown;
  referralType?: unknown;
  isReferral?: unknown;
};

function firstScalar(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === null || raw === undefined ? '' : String(raw);
}

function normalize(value: unknown): string {
  return firstScalar(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function canonicalSide(value: unknown): TransactionSide | null {
  const aliases: Record<string, TransactionSide> = {
    buyer: 'buyer',
    buyer_side: 'buyer',
    buyer_representation: 'buyer',
    buyer_transaction: 'buyer',
    purchaser: 'buyer',
    listing: 'listing',
    seller: 'listing',
    seller_side: 'listing',
    seller_representation: 'listing',
    new_listing: 'listing',
    listing_transaction: 'listing',
    dual: 'dual',
    dual_agency: 'dual',
    both: 'dual',
    referral: 'referral',
    outbound_referral: 'referral',
    referral_out: 'referral',
  };
  return aliases[normalize(value)] ?? null;
}

/**
 * Resolves the transaction representation side for display only.
 *
 * This deliberately does not treat deal categories such as lease, rental, land,
 * residential sale, or commercial sale as a buyer/listing representation side.
 * Those records must remain in manual review when no trusted side is available.
 */
export function resolveTransactionSide(record: TransactionSideRecord): TransactionSideResolution {
  const closingType = canonicalSide(record.closingType);
  if (closingType) {
    return { side: closingType, source: 'closing_type', requiresManualReview: false, preventsAutomaticPersistence: false };
  }

  const side = canonicalSide(record.side);
  if (side) {
    return { side, source: 'side', requiresManualReview: false, preventsAutomaticPersistence: false };
  }

  const legacyType = canonicalSide(record.type);
  if (legacyType) {
    return { side: legacyType, source: 'legacy_type', requiresManualReview: false, preventsAutomaticPersistence: true };
  }

  const hasReferralMarker =
    record.isReferral === true ||
    normalize(record.transactionType).includes('referral') ||
    normalize(record.referralType).includes('referral');
  if (hasReferralMarker) {
    return { side: 'referral', source: 'referral_marker', requiresManualReview: false, preventsAutomaticPersistence: true };
  }

  return { side: null, source: 'unresolved', requiresManualReview: true, preventsAutomaticPersistence: false };
}
