import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const protectedWriteBoundaries = [
  '../src/app/api/tc/route.ts',
  '../src/app/api/transactions/route.ts',
  '../src/app/api/agent/transactions/[txId]/route.ts',
  '../src/app/api/admin/transactions/route.ts',
  '../src/app/api/admin/staff-queue/[itemId]/route.ts',
  '../src/app/api/admin/tc/[id]/route.ts',
];

test('every co-agent transaction write boundary uses shared split validation', () => {
  for (const path of protectedWriteBoundaries) {
    const source = read(path);
    assert.match(source, /validateCoAgentSplit/,
      `${path} must validate a co-agent allocation before it persists or recalculates`);
  }
});

test('the unified editor and allocation builder do not coerce a valid zero percent to fifty', () => {
  const editor = read('../src/app/dashboard/transactions/new/page.tsx');
  const allocationBuilder = read('../src/lib/transactions/syncCoAgentAllocations.ts');

  assert.match(editor, /const validatedCoAgentSplit = validateCoAgentSplit\(values\)/);
  assert.doesNotMatch(editor, /Number\(values\.coAgentSplitPercent \|\| 50\)/);
  assert.doesNotMatch(editor, /Number\(values\.primaryAgentSplitPercent \|\| 50\)/);
  assert.match(allocationBuilder, /const coAgentSplit = validateCoAgentSplit\(transaction\)/);
  assert.doesNotMatch(allocationBuilder, /function clampPercent/);
});
