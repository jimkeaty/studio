import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGCI } from '../src/lib/commissions';
import { enforcePassThroughFinancialPolicy } from '../src/lib/transactions/passThroughFinancialPolicy';
import { buildAccountingSnapshot } from '../src/lib/transactions/accountingCloseout';

test('an authorized pass-through save preserves actual commission and gives the agent 100 percent while clearing brokerage economics', () => {
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
  assert.equal(updates.gci, 6450);
  assert.equal(updates.commission, 6450);
  assert.equal(updates.agentPct, 100);
  assert.equal(updates.agentDollar, 6450);
  assert.equal(updates.brokerGci, 0);
  assert.equal(updates.splitSnapshot.grossCommission, 6450);
  assert.equal(updates.splitSnapshot.agentNetCommission, 6450);
  assert.equal(updates.splitSnapshot.companyRetained, 0);
  assert.equal(current.salePrice, 215000);
  assert.equal(current.commissionPercent, 3);
});

test('legacy pass-through source labels persist the marker while retaining agent payout and the referral deduction', () => {
  const updates: Record<string, any> = { dealSource: 'Pass-Through' };
  assert.equal(enforcePassThroughFinancialPolicy({ salePrice: 215000, commissionPercent: 3, outboundReferralFeeDollar: 1000 }, updates), true);
  assert.equal(updates.isPassThrough, true);
  assert.equal(updates.gci, 6450);
  assert.equal(updates.agentDollar, 5450);
  assert.equal(updates.brokerGci, 0);
  assert.equal(resolveGCI({ salePrice: 215000, commissionPercent: 3 }), 6450);
});

test('Accounting shows actual pass-through commission and 100-percent agent net while broker GCI remains zero', () => {
  const fields = new Map(buildAccountingSnapshot({
    isPassThrough: true,
    salePrice: 215000,
    commissionPercent: 3,
    splitSnapshot: { grossCommission: 6450, agentNetCommission: 6450, companyRetained: 0 },
  }, 'pass-through-test').fields.map((field) => [field.id, field]));
  assert.equal(fields.get('grossGci')?.value, 6450);
  assert.equal(fields.get('agentPercent')?.value, 100);
  assert.equal(fields.get('agentNet')?.value, 6450);
  assert.equal(fields.get('brokerGci')?.value, 0);
});
