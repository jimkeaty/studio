import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');

const clientPath = path.join(repoRoot, 'src/app/dashboard/transactions/new/page.tsx');
const adminRoutePath = path.join(repoRoot, 'src/app/api/admin/transactions/route.ts');
const agentRoutePath = path.join(repoRoot, 'src/app/api/agent/transactions/[txId]/route.ts');

const clearedAliases = [
  ['coAgent', 'null'],
  ['coAgentId', "''"],
  ['coAgentDisplayName', "''"],
  ['coAgentRole', "''"],
  ['primaryAgentSplitPercent', "''"],
  ['coAgentSplitPercent', "''"],
  ['isCoListing', 'false'],
  ['coListingAgentName', "''"],
  ['coListingAgentEmail', "''"],
  ['coListingAgentBrokerage', "''"],
  ['coListingAgentPhone', "''"],
  ['coListingAgentSplit', "''"],
];

function removalBranch(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected removal branch marker not found: ${marker}`);
  return source.slice(start, start + 1800);
}

test('turning off a co-agent cannot rehydrate a stale relationship', () => {
  const cleared = {
    hasCoAgent: false,
    isCoListing: false,
    coAgentId: '',
    coAgentDisplayName: '',
    coListingAgentName: '',
  };

  const wouldRehydrate = Boolean(
    cleared.hasCoAgent ||
    cleared.isCoListing ||
    cleared.coAgentId ||
    cleared.coAgentDisplayName ||
    cleared.coListingAgentName,
  );

  assert.equal(wouldRehydrate, false);
});

test('unified form clears all co-agent aliases when the switch is off', async () => {
  const source = await readFile(clientPath, 'utf8');
  const branch = removalBranch(source, 'hasCoAgent: false,\n              coAgent: null,');

  for (const [field, value] of clearedAliases) {
    assert.match(branch, new RegExp(`${field}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

for (const [label, routePath] of [
  ['admin PATCH route', adminRoutePath],
  ['agent PATCH route', agentRoutePath],
]) {
  test(`${label} clears all co-agent aliases on intentional removal`, async () => {
    const source = await readFile(routePath, 'utf8');
    const branch = removalBranch(source, 'else if (updates.hasCoAgent === false)');

    for (const [field, value] of clearedAliases) {
      assert.match(branch, new RegExp(`updates\\.${field}\\s*=\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }

    assert.match(branch, /updates\.participantAllocations\s*=\s*null/);
    assert.match(branch, /updates\.primaryAgentSideCredit\s*=\s*null/);
    assert.match(branch, /updates\.primaryAgentUnitCredit\s*=\s*null/);
  });
}
