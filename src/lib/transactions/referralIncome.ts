type TransactionLike = Record<string, any>;

function amount(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[$,%]/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function percent(value: unknown): number | null {
  const parsed = amount(value);
  return parsed !== null && parsed <= 100 ? parsed : null;
}

function dateValue(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

/**
 * A referral-income file represents money paid to Keaty for an agent's referral.
 * It is not a represented property side: it has zero production volume and zero
 * sides, but the received fee is regular GCI that is split under the agent's
 * normal plan and counts toward company GCI and tier progression.
 */
export function isReferralIncomeTransaction(tx: TransactionLike): boolean {
  return String(tx.closingType || '').trim().toLowerCase() === 'referral';
}

export type ReferralIncomeResolution = {
  expectedExternalGrossCommission: number | null;
  referralFeePercent: number | null;
  expectedFee: number | null;
  actualFeeReceived: number | null;
  recognizedGci: number;
  recognizedSource: 'actual_received' | 'expected' | 'none';
  receivedDate: string | null;
};

/**
 * Resolves the money Keaty expects or has actually received for a referral.
 * An actual payment is authoritative once recorded; until then, the expected
 * fee is the planning basis. Legacy referral records hydrate safely from their
 * older GCI + outbound-referral fields without treating the external deal value
 * as Keaty GCI.
 */
export function resolveReferralIncome(tx: TransactionLike): ReferralIncomeResolution {
  const isReferral = isReferralIncomeTransaction(tx);
  const expectedExternalGrossCommission = amount(
    tx.referralExpectedExternalGrossCommission ?? tx.referralExpectedGrossCommission,
  ) ?? (isReferral ? amount(tx.legacyExternalGrossCommission) : null);
  const referralFeePercent = percent(tx.referralFeePercent ?? tx.referralIncomePercent);

  const explicitExpectedFee = amount(tx.referralExpectedFee ?? tx.referralFeeExpected);
  const calculatedExpectedFee = expectedExternalGrossCommission !== null && referralFeePercent !== null
    ? Math.round(expectedExternalGrossCommission * (referralFeePercent / 100) * 100) / 100
    : null;

  // Before this workflow existed, a referral file commonly stored the external
  // commission in GCI and the expected Keaty fee in outboundReferralFeeDollar.
  const legacyExpectedFee = isReferral
    ? amount(tx.outboundReferralFeeDollar ?? tx.outboundReferralDollar ?? tx.outboundReferralFee?.referralDollar)
    : null;

  const expectedFee = explicitExpectedFee ?? calculatedExpectedFee ?? legacyExpectedFee;
  const actualFeeReceived = amount(tx.referralActualFeeReceived ?? tx.referralFeeActualReceived);
  const recognizedGci = actualFeeReceived !== null && actualFeeReceived > 0
    ? actualFeeReceived
    : expectedFee ?? 0;

  return {
    expectedExternalGrossCommission,
    referralFeePercent,
    expectedFee,
    actualFeeReceived,
    recognizedGci,
    recognizedSource: actualFeeReceived !== null && actualFeeReceived > 0
      ? 'actual_received'
      : expectedFee !== null && expectedFee > 0
        ? 'expected'
        : 'none',
    receivedDate: dateValue(tx.referralFeeReceivedDate),
  };
}

/**
 * Converts a referral-income record to its canonical financial fields before
 * every commission calculation. This never enables the separate outbound-fee
 * deduction workflow: there is no external fee taken off the top of this file.
 */
export function applyReferralIncomeFinancials(
  current: TransactionLike,
  proposed: TransactionLike,
): Record<string, unknown> {
  const merged = { ...current, ...proposed };
  if (!isReferralIncomeTransaction(merged)) return {};

  const referral = resolveReferralIncome(merged);
  const receivedYear = referral.actualFeeReceived && referral.receivedDate
    ? new Date(`${referral.receivedDate}T12:00:00Z`).getUTCFullYear()
    : null;
  return {
    referralExpectedExternalGrossCommission: referral.expectedExternalGrossCommission,
    referralFeePercent: referral.referralFeePercent,
    referralExpectedFee: referral.expectedFee,
    referralActualFeeReceived: referral.actualFeeReceived,
    referralFeeReceivedDate: referral.receivedDate,
    // Referral fees are an exact, separately received dollar amount—not a
    // commission percentage applied to the outside property sale price.
    commissionCalculationMethod: 'flat_dollar',
    commissionFlatAmount: referral.recognizedGci,
    commissionBasePrice: null,
    commissionPercent: null,
    gci: referral.recognizedGci,
    commission: referral.recognizedGci,
    manualGciOverride: true,
    // This transaction earns a referral fee; it does not pay an outbound
    // referral from its own GCI.
    hasOutboundReferral: false,
    outboundReferralFee: null,
    outboundReferralFeePercent: null,
    outboundReferralFeeDollar: null,
    outboundReferralDollar: null,
    ...(receivedYear && Number.isFinite(receivedYear) ? { year: receivedYear } : {}),
  };
}
