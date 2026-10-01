export type OutboundReferralResolution = {
  active: boolean;
  referralFeePercent: number | null;
  referralFeeDollar: number | null;
  netAfterReferral: number;
};

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function money(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function firstPositiveMoney(...values: unknown[]): number {
  for (const value of values) {
    if (asRecord(value)) continue;
    const numeric = money(value);
    if (numeric > 0) return numeric;
  }
  return 0;
}

function firstValidPercent(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0 && numeric <= 100) {
      return numeric;
    }
  }
  return null;
}

/**
 * Resolves current scalar referral fields and the legacy outboundReferralFee
 * object into one safe, top-of-GCI deduction. An explicit false toggle always
 * wins over stale legacy values; records without a toggle retain compatible
 * legacy behavior when a real referral amount exists.
 */
export function resolveOutboundReferral(
  transaction: RecordLike,
  grossCommission: unknown,
): OutboundReferralResolution {
  const gross = Math.max(0, money(grossCommission));
  const legacyFee = asRecord(transaction.outboundReferralFee);
  const legacyDollarField = asRecord(transaction.outboundReferralFeeDollar);

  const referralFeePercent = firstValidPercent(
    transaction.outboundReferralFeePercent,
    transaction.outboundReferralPercent,
    legacyFee?.referralPercent,
    legacyFee?.percent,
    legacyDollarField?.referralPercent,
  );
  const explicitDollar = firstPositiveMoney(
    transaction.outboundReferralFeeDollar,
    transaction.outboundReferralDollar,
    typeof transaction.outboundReferralFee === 'number' ? transaction.outboundReferralFee : null,
    legacyFee?.referralDollar,
    legacyFee?.referralFeeDollar,
    legacyDollarField?.referralDollar,
  );

  const hasReferralDetails = Boolean(referralFeePercent || explicitDollar > 0);
  const toggle = transaction.hasOutboundReferral;
  const active = toggle === true || (toggle === undefined || toggle === null ? hasReferralDetails : false);
  if (!active || gross <= 0 || !hasReferralDetails) {
    return {
      active: false,
      referralFeePercent: null,
      referralFeeDollar: null,
      netAfterReferral: gross,
    };
  }

  const referralFeeDollar = Math.min(
    gross,
    explicitDollar > 0
      ? explicitDollar
      : money(gross * Number(referralFeePercent || 0) / 100),
  );

  return {
    active: referralFeeDollar > 0,
    referralFeePercent,
    referralFeeDollar,
    netAfterReferral: money(gross - referralFeeDollar),
  };
}

/** Allocate a whole-file referral between two participant shares without drift. */
export function allocateOutboundReferralAcrossCoAgents(
  referralFeeDollar: unknown,
  primaryPercent: unknown,
): { primaryReferralFeeDollar: number; coAgentReferralFeeDollar: number } {
  const total = Math.max(0, money(referralFeeDollar));
  const primaryShare = Number(primaryPercent);
  const boundedPrimaryPercent = Number.isFinite(primaryShare)
    ? Math.min(100, Math.max(0, primaryShare))
    : 50;
  const primaryReferralFeeDollar = money(total * (boundedPrimaryPercent / 100));
  return {
    primaryReferralFeeDollar,
    coAgentReferralFeeDollar: money(total - primaryReferralFeeDollar),
  };
}
