import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePercentageCommissionMethod } from '../src/lib/transactions/commissionMethodRecovery';

test('switching a closed transaction from flat-dollar to percentage replaces the stale flat GCI', () => {
  const current = {
    commissionCalculationMethod: 'flat_dollar',
    commissionFlatAmount: 4_000,
    gci: 4_000,
    commission: 4_000,
    manualGciOverride: true,
    status: 'closed',
    listPrice: 190_000,
    salePrice: 182_000,
    commissionBasePrice: 182_000,
    commissionPercent: 3,
  };
  const updates: Record<string, any> = {
    commissionCalculationMethod: 'percentage',
    commissionPercent: 3,
  };

  const grossCommission = normalizePercentageCommissionMethod(current, updates);

  assert.equal(grossCommission, 5_460);
  assert.equal(updates.commissionCalculationMethod, 'percentage');
  assert.equal(updates.commissionFlatAmount, null);
  assert.equal(updates.manualGciOverride, false);
  assert.equal(updates.gci, 5_460);
  assert.equal(updates.commission, 5_460);
});

test('percentage recovery keeps the current explicit commission base authoritative', () => {
  const updates: Record<string, any> = { commissionCalculationMethod: 'percentage' };
  const grossCommission = normalizePercentageCommissionMethod({
    commissionCalculationMethod: 'flat_dollar',
    commissionFlatAmount: 6_000,
    gci: 6_000,
    manualGciOverride: true,
    status: 'closed',
    salePrice: 200_000,
    commissionBasePrice: 175_000,
    commissionPercent: 3,
  }, updates);

  assert.equal(grossCommission, 5_250);
  assert.equal(updates.gci, 5_250);
});

test('the helper does not change a transaction unless percentage mode was explicitly selected', () => {
  const updates: Record<string, any> = { commissionCalculationMethod: 'flat_dollar', gci: 4_000 };
  const result = normalizePercentageCommissionMethod({ salePrice: 182_000, commissionPercent: 3 }, updates);

  assert.equal(result, null);
  assert.deepEqual(updates, { commissionCalculationMethod: 'flat_dollar', gci: 4_000 });
});
