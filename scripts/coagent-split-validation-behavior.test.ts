import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCoAgentSplit } from '../src/lib/transactions/coAgentSplitValidation';

test('co-agent splits accept an exact 100% allocation to either participant', () => {
  assert.deepEqual(
    validateCoAgentSplit({ hasCoAgent: true, primaryAgentSplitPercent: 100, coAgentSplitPercent: 0 }),
    { active: true, valid: true, primaryPercent: 100, coAgentPercent: 0, error: null },
  );
  assert.deepEqual(
    validateCoAgentSplit({ hasCoAgent: true, primaryAgentSplitPercent: 0, coAgentSplitPercent: 100 }),
    { active: true, valid: true, primaryPercent: 0, coAgentPercent: 100, error: null },
  );
});

test('co-agent splits preserve valid decimal allocations', () => {
  const result = validateCoAgentSplit({
    hasCoAgent: true,
    primaryAgentSplitPercent: 33.333,
    coAgentSplitPercent: 66.667,
  });
  assert.equal(result.valid, true);
  assert.equal(result.primaryPercent, 33.333);
  assert.equal(result.coAgentPercent, 66.667);
});

test('a missing counterpart is resolved to the exact mathematical complement', () => {
  const result = validateCoAgentSplit({ hasCoAgent: true, primaryAgentSplitPercent: 35 });
  assert.equal(result.valid, true);
  assert.equal(result.primaryPercent, 35);
  assert.equal(result.coAgentPercent, 65);
});

test('missing legacy split values retain the established 50/50 default', () => {
  const result = validateCoAgentSplit({ hasCoAgent: 'yes' });
  assert.deepEqual(result, { active: true, valid: true, primaryPercent: 50, coAgentPercent: 50, error: null });
});

test('legacy nested split values survive blank top-level aliases', () => {
  const result = validateCoAgentSplit({
    hasCoAgent: true,
    primaryAgentSplitPercent: '',
    coAgentSplitPercent: '',
    coAgent: { primarySplitPercent: 70, splitPercent: 30 },
  });
  assert.deepEqual(result, { active: true, valid: true, primaryPercent: 70, coAgentPercent: 30, error: null });
});

test('invalid co-agent allocations fail before calculations can be performed', () => {
  for (const source of [
    { hasCoAgent: true, primaryAgentSplitPercent: 30, coAgentSplitPercent: 30 },
    { hasCoAgent: true, primaryAgentSplitPercent: -1, coAgentSplitPercent: 101 },
    { hasCoAgent: true, primaryAgentSplitPercent: 'not-a-number', coAgentSplitPercent: 50 },
  ]) {
    const result = validateCoAgentSplit(source);
    assert.equal(result.valid, false);
    assert.match(result.error || '', /total 100%/);
  }
});

test('a string false flag does not turn an ordinary transaction into a co-agent allocation', () => {
  assert.deepEqual(
    validateCoAgentSplit({ hasCoAgent: 'false', primaryAgentSplitPercent: 30, coAgentSplitPercent: 30 }),
    { active: false, valid: true, primaryPercent: null, coAgentPercent: null, error: null },
  );
});
