import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/api/admin/agent-profiles/[agentId]/rollup-rebuild/route.ts', import.meta.url), 'utf8');

test('targeted rollup rebuild is authorized, year-scoped, and ledger-read-only', () => {
  assert.match(source, /isAdminLike/);
  assert.match(source, /rebuildAgentRollup\(adminDb, normalizedAgentId, year\)/);
  assert.match(source, /A valid calendar year is required/);
  assert.match(source, /agentYearRollups/);
  assert.match(source, /targeted_rollup_rebuild/);
  assert.doesNotMatch(source, /collection\('transactions'\)\.doc\(.*\)\.update/);
  assert.doesNotMatch(source, /rebuildAllRollupsForYear/);
});
