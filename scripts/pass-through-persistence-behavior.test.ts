import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGCI } from '../src/lib/commissions';
import { enforcePassThroughFinancialPolicy } from '../src/lib/transactions/passThroughFinancialPolicy';

test('an authorized pass-through save persists the canonical marker and clears only excluded brokerage economics', () => {
  const current = {
    salePrice: 215000,
    commissionPercent: 3,
    gci: 6450,
    commission: 6450,
    agentPct: 70,
    agentDollar: 4515,
    brokerPct: 30,
    brokerGci: 1935,
    splitSnapshot: {
      grossCommission: 6450,
      agentNetCommission: 4515,
      companyRetained: 1935,
    },
  };
  const updates: Record<string, any> = { isPassThrough: true };

  assert.equal(enforcePassThroughFinancialPolicy(current, updates), true);
  assert.equal(updates.isPassThrough, true);
  assert.equal(updates.gci, 0);
  assert.equal(updates.commission, 0);
  assert.equal(updates.agentDollar, 0);
  assert.equal(updates.brokerGci, 0);
  assert.equal(updates.splitSnapshot.grossCommission, 0);
  assert.equal(updates.splitSnapshot.agentNetCommission, 0);
  assert.equal(updates.splitSnapshot.companyRetained, 0);
  assert.equal(current.salePrice, 215000);
  assert.equal(current.commissionPercent, 3);
});

test('legacy pass-through source labels receive the same zero-economics protection and GCI resolver result', () => {
  const updates: Record<string, any> = { dealSource: 'Pass-Through' };
  assert.equal(enforcePassThroughFinancialPolicy({ salePrice: 215000, commissionPercent: 3 }, updates), true);
  assert.equal(updates.isPassThrough, true);
  assert.equal(updates.gci, 0);
  assert.equal(resolveGCI({ salePrice: 215000, commissionPercent: 3, isPassThrough: true }), 0);
  assert.equal(resolveGCI({ salePrice: 215000, commissionPercent: 3, dealSource: 'pass_through' }), 0);
});
