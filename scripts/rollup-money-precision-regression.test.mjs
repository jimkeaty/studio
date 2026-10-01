import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/rollups/rebuildAgentRollup.ts', import.meta.url), 'utf8');

test('rollup currency totals are persisted at cents precision', () => {
  assert.match(source, /function money\(v: any\): number/);
  assert.match(source, /companyDollar: money\(companyDollar\)/);
  assert.match(source, /tierProgressionCompanyDollar: money\(tierProgressionCompanyDollar\)/);
  assert.match(source, /agentNetCommission: money\(agentNetCommission\)/);
});
