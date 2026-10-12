import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExplicitCommissionBaseOverride } from '../src/lib/transactions/commissionBaseHydration';

test('a concession-adjusted closed commission base survives editor hydration', () => {
  assert.equal(hasExplicitCommissionBaseOverride({
    status: 'closed',
    salePrice: 185_000,
    commissionBasePrice: 182_000,
  }), true);
});

test('an ordinary sale-price commission base remains eligible for automatic updates', () => {
  assert.equal(hasExplicitCommissionBaseOverride({
    status: 'closed',
    salePrice: 185_000,
    commissionBasePrice: 185_000,
  }), false);
});

test('an active listing base equal to list price remains eligible for automatic updates', () => {
  assert.equal(hasExplicitCommissionBaseOverride({
    status: 'active',
    listPrice: 185_000,
    salePrice: 0,
    commissionBasePrice: 185_000,
  }), false);
});
