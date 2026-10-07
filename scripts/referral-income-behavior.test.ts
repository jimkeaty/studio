import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReferralIncomeFinancials,
  isReferralIncomeTransaction,
  resolveReferralIncome,
} from '../src/lib/transactions/referralIncome';
import { getAgentProductionCredit, getTotalSideMultiplier } from '../src/lib/transactions/resolveProductionCredit';

test('referral income uses expected Keaty fee, not outside sale value or outside gross commission', () => {
  const referral = resolveReferralIncome({
    closingType: 'referral',
    salePrice: 650000,
    referralExpectedExternalGrossCommission: 19500,
    referralFeePercent: 25,
  });

  assert.equal(referral.expectedFee, 4875);
  assert.equal(referral.actualFeeReceived, null);
  assert.equal(referral.recognizedGci, 4875);
  assert.equal(referral.recognizedSource, 'expected');

  const normalized = applyReferralIncomeFinancials({}, {
    closingType: 'referral',
    salePrice: 650000,
    referralExpectedExternalGrossCommission: 19500,
    referralFeePercent: 25,
    // Stale data from the older referral form must not be reinterpreted as a
    // fee deducted from this income record.
    hasOutboundReferral: true,
    outboundReferralFeeDollar: 4875,
  });

  assert.equal(normalized.gci, 4875);
  assert.equal(normalized.commission, 4875);
  assert.equal(normalized.commissionFlatAmount, 4875);
  assert.equal(normalized.hasOutboundReferral, false);
  assert.equal(normalized.outboundReferralFeeDollar, null);
  assert.equal(normalized.commissionBasePrice, null);
});

test('actual referral fee and received date supersede the expected preview', () => {
  const normalized = applyReferralIncomeFinancials({}, {
    closingType: 'referral',
    referralExpectedExternalGrossCommission: 19500,
    referralFeePercent: 25,
    referralActualFeeReceived: 5000,
    referralFeeReceivedDate: '2026-10-07',
  });

  assert.equal(normalized.referralExpectedFee, 4875);
  assert.equal(normalized.gci, 5000);
  assert.equal(normalized.commission, 5000);
  assert.equal(normalized.year, 2026);
});

test('referral income has zero production sides and volume while remaining a normal financial record', () => {
  const transaction = {
    closingType: 'referral',
    agentId: 'sammy-cart',
    salePrice: 650000,
    splitSnapshot: { grossCommission: 4875, agentNetCommission: 2925 },
  };

  assert.equal(isReferralIncomeTransaction(transaction), true);
  assert.equal(getTotalSideMultiplier(transaction), 0);
  assert.deepEqual(getAgentProductionCredit(transaction, 'sammy-cart'), {
    closedSides: 0,
    pendingSides: 0,
    volumeMultiplier: 0,
    usesExplicitSideRole: false,
  });
});

test('ordinary property-side transactions retain existing production treatment', () => {
  const transaction = { closingType: 'buyer', agentId: 'sammy-cart', salePrice: 650000 };
  assert.equal(isReferralIncomeTransaction(transaction), false);
  assert.equal(getTotalSideMultiplier(transaction), 1);
  assert.deepEqual(getAgentProductionCredit(transaction, 'sammy-cart'), {
    closedSides: 1,
    pendingSides: 1,
    volumeMultiplier: 1,
    usesExplicitSideRole: false,
  });
});
