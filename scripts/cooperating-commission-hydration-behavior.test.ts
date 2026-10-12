import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCooperatingCommissionForEditor } from '../src/lib/transactions/cooperatingCommission';

test('buyer-side GCI never becomes a cooperating offer in the unified editor', () => {
  assert.deepEqual(
    resolveCooperatingCommissionForEditor({
      sellerPayingBuyerAgent: 7847,
      cooperatingAgentCommissionPercent: 7847,
      cooperatingAgentCommissionMethod: 'percentage',
    }, false),
    { method: 'percentage', percent: '', flatAmount: '' },
  );
});

test('legacy listing dollars stored in the percentage alias recover as exact dollars', () => {
  assert.deepEqual(
    resolveCooperatingCommissionForEditor({
      closingType: 'listing',
      sellerPayingBuyerAgent: 7847,
      cooperatingAgentCommissionPercent: 7847,
      // Earlier saves could have defaulted this value before an explicit method existed.
      cooperatingAgentCommissionMethod: 'percentage',
    }, true),
    { method: 'flat_dollar', percent: '', flatAmount: 7847 },
  );
});

test('valid listing percentage offers stay percentage offers', () => {
  assert.deepEqual(
    resolveCooperatingCommissionForEditor({
      closingType: 'dual',
      sellerPayingBuyerAgent: 3,
      cooperatingAgentCommissionPercent: 3,
      cooperatingAgentCommissionMethod: 'percentage',
    }, true),
    { method: 'percentage', percent: 3, flatAmount: '' },
  );
});

test('a zero-value unused flat field does not replace a valid percentage method', () => {
  assert.deepEqual(
    resolveCooperatingCommissionForEditor({
      sellerPayingBuyerAgent: 2.5,
      cooperatingAgentCommissionPercent: 2.5,
      cooperatingAgentCommissionFlatAmount: 0,
      cooperatingAgentCommissionMethod: 'percentage',
    }, true),
    { method: 'percentage', percent: 2.5, flatAmount: '' },
  );
});
