import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommissionBase } from '../src/lib/commissions';
import { calculatePercentageGrossCommission } from '../src/lib/transactions/percentageGrossCommission';

test('closed listing commission uses the sale price instead of the historical list price', () => {
  const base = resolveCommissionBase({
    status: 'closed',
    listPrice: 95_000,
    salePrice: 93_000,
  });

  assert.equal(base, 93_000);
  assert.equal(base * 0.025, 2_325);
});

test('an explicit concession-adjusted commission base remains authoritative', () => {
  const base = resolveCommissionBase({
    status: 'closed',
    listPrice: 95_000,
    salePrice: 93_000,
    commissionBasePrice: 90_000,
  });

  assert.equal(base, 90_000);
});

test('an active listing without a sale price still estimates from its list price', () => {
  const base = resolveCommissionBase({
    status: 'active',
    listPrice: 95_000,
    salePrice: 0,
  });

  assert.equal(base, 95_000);
});

test('transaction compliance fees never increase gross commission or the split base', () => {
  const grossCommission = calculatePercentageGrossCommission({
    baseCommission: 2_325,
    // Intentionally supplied extra transaction-fee details are not an input to
    // the policy function and therefore cannot be included in GCI.
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 150,
    txComplianceFeePaidBy: 'buyer',
  } as any);

  assert.equal(grossCommission, 2_325);
});
