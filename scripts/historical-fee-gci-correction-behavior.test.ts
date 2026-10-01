import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS,
  buildHistoricalFeeGciCorrectionUpdate,
  HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID,
  prepareHistoricalFeeGciCorrection,
  requireApprovedHistoricalFeeManifest,
} from '../src/lib/transactions/historicalFeeGciCorrection';

const version = '2026-03-28T17:18:31.175Z';

function correctionRequests() {
  return APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS.map((correction) => ({
    id: correction.id,
    expectedUpdatedAt: version,
  }));
}

function transactionFor(id: string) {
  const correction = APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS.find((entry) => entry.id === id)!;
  return {
    id,
    status: 'closed',
    updatedAt: version,
    agentId: 'SRJCDxqAyjYzgHEUqTd7',
    year: 2026,
    transactionFee: correction.expectedTransactionFee,
    splitSnapshot: {
      grossCommission: correction.expectedGrossCommission,
      agentNetCommission: correction.expectedAgentNetCommission,
      companyRetained: correction.expectedCompanyRetained,
      agentSplitPercent: 80,
      companySplitPercent: 20,
      primaryTeamId: 'cgl-team',
    },
  };
}

test('historical fee correction accepts only the exact approved two-record manifest', () => {
  const requests = requireApprovedHistoricalFeeManifest(
    HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID,
    correctionRequests(),
  );
  assert.deepEqual(requests, correctionRequests());

  assert.throws(
    () => requireApprovedHistoricalFeeManifest(HISTORICAL_FEE_GCI_CORRECTION_MANIFEST_ID, correctionRequests().slice(0, 1)),
    /exact approved correction set/,
  );
  assert.throws(
    () => requireApprovedHistoricalFeeManifest('anything-else', correctionRequests()),
    /unrecognized correction manifest/,
  );
});

test('historical fee correction changes only gross commission and preserves payout allocation', () => {
  const correction = APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS[0];
  const transaction = transactionFor(correction.id);
  const prepared = prepareHistoricalFeeGciCorrection(transaction, {
    id: correction.id,
    expectedUpdatedAt: version,
  });
  const update = buildHistoricalFeeGciCorrectionUpdate(transaction, prepared, new Date('2026-10-01T17:00:00.000Z'));

  assert.equal((update.splitSnapshot as Record<string, unknown>).grossCommission, 8997);
  assert.equal((update.splitSnapshot as Record<string, unknown>).agentNetCommission, 7197.6);
  assert.equal((update.splitSnapshot as Record<string, unknown>).companyRetained, 1799.4);
  assert.equal(transaction.transactionFee, 395);
  assert.equal(Object.hasOwn(update, 'transactionFee'), false);
  assert.equal(Object.hasOwn(update, 'gci'), false);
  assert.equal(Object.hasOwn(update, 'commission'), false);
});

test('historical fee correction rejects stale versions and changed audited values', () => {
  const correction = APPROVED_HISTORICAL_FEE_GCI_CORRECTIONS[1];
  assert.throws(
    () => prepareHistoricalFeeGciCorrection({ ...transactionFor(correction.id), updatedAt: '2026-10-02T00:00:00.000Z' }, {
      id: correction.id,
      expectedUpdatedAt: version,
    }),
    /changed after the audit/,
  );
  assert.throws(
    () => prepareHistoricalFeeGciCorrection({
      ...transactionFor(correction.id),
      splitSnapshot: { ...transactionFor(correction.id).splitSnapshot, grossCommission: 5000 },
    }, {
      id: correction.id,
      expectedUpdatedAt: version,
    }),
    /gross commission no longer matches/,
  );
  assert.throws(
    () => prepareHistoricalFeeGciCorrection({ ...transactionFor(correction.id), manualGciOverride: true }, {
      id: correction.id,
      expectedUpdatedAt: version,
    }),
    /manual commission override/,
  );
});
