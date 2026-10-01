import { normalizeTransactionVersion } from '@/lib/transactions/transactionVersion';

export const HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID =
  '2026-definite-transaction-fee-gci-correction-v1';

export type HistoricalFeeGciCorrection = {
  id: string;
  expectedGrossCommission: number;
  correctedGrossCommission: number;
  expectedTransactionFee: number;
  expectedAgentNetCommission: number;
  expectedCompanyRetained: number;
};

/**
 * This is deliberately a closed manifest, not a general-purpose financial
 * update mechanism. Each entry was read-only audited and separately approved.
 */
export const APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS: readonly HistoricalFeeGciCorrection[] = [
  {
    id: 'JpTYOQ5WcUoS0D96uY4o',
    expectedGrossCommission: 9392,
    correctedGrossCommission: 8997,
    expectedTransactionFee: 395,
    expectedAgentNetCommission: 7197.6,
    expectedCompanyRetained: 1799.4,
  },
  {
    id: 'jd4NBEj0jKzYYsoj9BGN',
    expectedGrossCommission: 5345,
    correctedGrossCommission: 4950,
    expectedTransactionFee: 395,
    expectedAgentNetCommission: 3960,
    expectedCompanyRetained: 990,
  },
] as const;

export type HistoricalFeeCorrectionRequest = {
  id: string;
  expectedUpdatedAt: string;
};

export type PreparedHistoricalFeeCorrection = {
  correction: HistoricalFeeGciCorrection;
  expectedUpdatedAt: string;
  agentId: string;
  year: number;
  progressionLeaderAgentId: string | null;
  before: {
    grossCommission: number;
    agentNetCommission: number;
    companyRetained: number;
    transactionFee: number;
  };
  after: {
    grossCommission: number;
    agentNetCommission: number;
    companyRetained: number;
  };
};

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function equalsMoney(left: unknown, right: unknown): boolean {
  return Math.abs(money(left) - money(right)) <= 0.01;
}

function validationError(message: string): never {
  throw new Error(`Historical fee GCI correction rejected: ${message}`);
}

export function requireApprovedHistoricalFeeManifest(
  manifestId: unknown,
  requests: unknown,
): HistoricalFeeCorrectionRequest[] {
  if (manifestId !== HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID) {
    validationError('unrecognized correction manifest');
  }
  if (!Array.isArray(requests) || requests.length !== APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS.length) {
    validationError('request must contain the exact approved correction set');
  }

  const approvedIds = new Set(APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS.map((entry) => entry.id));
  const receivedIds = new Set<string>();
  const normalized: HistoricalFeeCorrectionRequest[] = [];

  for (const value of requests) {
    const item = value as Partial<HistoricalFeeCorrectionRequest>;
    const id = String(item?.id || '').trim();
    const expectedUpdatedAt = normalizeTransactionVersion(item?.expectedUpdatedAt);
    if (!approvedIds.has(id) || receivedIds.has(id)) {
      validationError('request contains an unapproved or duplicate transaction');
    }
    if (!expectedUpdatedAt) {
      validationError(`missing current version for ${id}`);
    }
    receivedIds.add(id);
    normalized.push({ id, expectedUpdatedAt });
  }

  if (receivedIds.size !== approvedIds.size) {
    validationError('request does not contain every approved transaction');
  }

  return normalized;
}

export function prepareHistoricalFeeGciCorrection(
  transaction: Record<string, any>,
  request: HistoricalFeeCorrectionRequest,
): PreparedHistoricalFeeCorrection {
  const correction = APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS.find((entry) => entry.id === request.id);
  if (!correction) validationError(`transaction ${request.id} is not approved`);

  const currentVersion = normalizeTransactionVersion(transaction.updatedAt);
  if (!currentVersion || currentVersion !== request.expectedUpdatedAt) {
    validationError(`transaction ${request.id} changed after the audit; reload before correcting`);
  }
  if (String(transaction.status || '').trim().toLowerCase() !== 'closed') {
    validationError(`transaction ${request.id} is no longer Closed`);
  }
  if (transaction.manualGciOverride === true || transaction.commissionOverridden === true) {
    validationError(`transaction ${request.id} has a manual commission override`);
  }
  if (transaction.hasCoAgent === true || transaction.coAgent?.agentId) {
    validationError(`transaction ${request.id} has a co-agent allocation`);
  }

  const snapshot = transaction.splitSnapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    validationError(`transaction ${request.id} has no saved split snapshot`);
  }

  const transactionFee = money(transaction.transactionFee ?? transaction.txComplianceFeeAmount);
  if (!equalsMoney(transactionFee, correction.expectedTransactionFee)) {
    validationError(`transaction ${request.id} fee no longer matches the audited amount`);
  }
  if (!equalsMoney(snapshot.grossCommission, correction.expectedGrossCommission)) {
    validationError(`transaction ${request.id} gross commission no longer matches the audited amount`);
  }
  if (!equalsMoney(snapshot.agentNetCommission, correction.expectedAgentNetCommission)) {
    validationError(`transaction ${request.id} agent payout no longer matches the audited amount`);
  }
  if (!equalsMoney(snapshot.companyRetained, correction.expectedCompanyRetained)) {
    validationError(`transaction ${request.id} company retained amount no longer matches the audited amount`);
  }
  if (!equalsMoney(correction.expectedGrossCommission - correction.correctedGrossCommission, transactionFee)) {
    validationError(`transaction ${request.id} correction no longer equals the recorded fee`);
  }

  const agentId = String(transaction.agentId || '').trim();
  const year = Number(transaction.year || 0);
  if (!agentId || !Number.isInteger(year) || year < 2000 || year > 2100) {
    validationError(`transaction ${request.id} is missing rollup identity`);
  }

  return {
    correction,
    expectedUpdatedAt: request.expectedUpdatedAt,
    agentId,
    year,
    progressionLeaderAgentId: String(transaction.creditSnapshot?.progressionLeaderAgentId || '').trim() || null,
    before: {
      grossCommission: money(snapshot.grossCommission),
      agentNetCommission: money(snapshot.agentNetCommission),
      companyRetained: money(snapshot.companyRetained),
      transactionFee,
    },
    after: {
      grossCommission: correction.correctedGrossCommission,
      agentNetCommission: money(snapshot.agentNetCommission),
      companyRetained: money(snapshot.companyRetained),
    },
  };
}

export function buildHistoricalFeeGciCorrectionUpdate(
  transaction: Record<string, any>,
  prepared: PreparedHistoricalFeeCorrection,
  now: Date,
): Record<string, unknown> {
  return {
    splitSnapshot: {
      ...(transaction.splitSnapshot || {}),
      grossCommission: prepared.after.grossCommission,
      // Deliberately retain historical agent and company allocation. The defect
      // was fee inflation of gross commission, not payout allocation.
      agentNetCommission: prepared.after.agentNetCommission,
      companyRetained: prepared.after.companyRetained,
    },
    updatedAt: now,
  };
}
