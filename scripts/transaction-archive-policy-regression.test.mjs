import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const helper = read('src/lib/transactions/archiveTransaction.ts');
const adminLedger = read('src/app/api/admin/transactions/route.ts');
const selectedArchive = read('src/app/api/admin/transactions/bulk-delete/route.ts');
const filteredArchive = read('src/app/api/admin/bulk-delete/route.ts');
const duplicateArchive = read('src/app/api/admin/migrations/bulk-delete-duplicates/route.ts');
const agentProfileRoute = read('src/app/api/admin/agent-profiles/[agentId]/route.ts');
const importHistoryRoute = read('src/app/api/admin/import-history/route.ts');
const splitCoAgent = read('src/lib/transactions/splitCoAgentTransaction.ts');
const ledgerPage = read('src/app/dashboard/admin/transactions/page.tsx');
const importPage = read('src/app/dashboard/admin/import/page.tsx');

test('canonical transaction archives retain lifecycle state, audit the actor and reason, and do not delete the ledger document', () => {
  assert.match(helper, /isArchived: true/);
  assert.match(helper, /archiveState: 'archived'/);
  assert.match(helper, /type: 'transaction_archived'/);
  assert.match(helper, /const reason = normalizedReason\(request\.reason\)/);
  assert.match(helper, /transactionRef\.collection\('auditEvents'\)\.doc\(\)/);
  assert.doesNotMatch(helper, /transactionRef\.delete\(/);
});

test('all transaction deletion workflows use the archive helper instead of removing canonical records', () => {
  for (const [name, source] of [
    ['admin ledger', adminLedger],
    ['selected bulk archive', selectedArchive],
    ['filtered archive', filteredArchive],
    ['duplicate migration archive', duplicateArchive],
    ['import history archive', importHistoryRoute],
    ['co-agent replacement archive', splitCoAgent],
  ]) {
    assert.match(source, /archiveCanonicalTransaction/, `${name} must archive through the canonical helper`);
    assert.doesNotMatch(source, /(?:transactions\)\.doc\([^\n]*\)\.delete\(|batch\.delete\(adminDb\.collection\('transactions'\)|batch\.delete\(doc\.ref\)|txRef\.delete\()/s, `${name} must not hard-delete canonical transaction documents`);
  }
  assert.match(agentProfileRoute, /archiveCanonicalTransaction/);
  assert.doesNotMatch(agentProfileRoute, /for \(const doc of allTx\.values\(\)\)\s*\{\s*await doc\.ref\.delete/s);
});

test('transaction reads and rollup rebuilds exclude archived records by default', () => {
  const agentLedger = read('src/app/api/agent/transactions/route.ts');
  const staffQueue = read('src/app/api/admin/staff-queue/route.ts');
  const tcQueue = read('src/app/api/admin/tc/route.ts');
  const accountingQueue = read('src/app/api/admin/accounting-closeout/route.ts');
  const rollups = read('src/lib/rollups/rebuildAgentRollup.ts');

  for (const [name, source] of [
    ['admin ledger', adminLedger],
    ['agent ledger', agentLedger],
    ['staff queue', staffQueue],
    ['TC queue', tcQueue],
    ['Accounting queue', accountingQueue],
    ['rollups', rollups],
  ]) {
    assert.match(source, /isArchivedTransaction/, `${name} must respect the canonical archive flag`);
  }
});

test('ledger and import controls require auditable archive confirmations', () => {
  assert.match(ledgerPage, /archiveReason/);
  assert.match(ledgerPage, /bulkArchiveReason/);
  assert.match(ledgerPage, /action: 'archive'/);
  assert.match(ledgerPage, /Archive Transaction/);
  assert.match(importPage, /ARCHIVE/);
  assert.match(importPage, /Archive Transactions/);
});
