import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('agent saves persist a canonical TC flag and canonical transaction link', () => {
  const source = read('src/app/api/agent/transactions/[txId]/route.ts');
  assert.match(source, /intake\.transactionId\s*=\s*txId/, 'Agent-created TC intake must carry transactionId.');
  assert.match(source, /workingWithTc:\s*true/, 'Agent-created TC intake link update must persist canonical workingWithTc.');
  assert.match(source, /createTcIntakeWithChecklist\(adminDb, txId, intake\)/, 'Agent-created TC intake must atomically seed its checklist at the canonical transaction ID.');
});

test('administrative saves recover an active intake for TC-managed Pending files', () => {
  const source = read('src/app/api/admin/transactions/route.ts');
  assert.match(source, /TC Queue recovery/, 'Admin route must contain TC queue recovery.');
  assert.match(source, /where\('approvedTransactionId', '==', id\)/, 'Recovery must locate prior intakes by the canonical transaction ID.');
  assert.match(source, /status:\s*'submitted'/, 'Recovery must create a submitted workflow intake when none is active.');
  assert.match(source, /transactionId:\s*id/, 'Recovered intake must reopen the canonical transaction.');
  assert.match(source, /approvedTransactionId:\s*id/, 'Recovered intake must never create a duplicate transaction on approval.');
  assert.match(source, /createTcIntakeWithChecklist\(adminDb, id, \{/, 'Recovery must atomically seed its checklist at the canonical transaction ID.');
  assert.match(source, /ensureTcChecklist\(adminDb, activeIntake\.id\)/, 'Recovery must repair a missing checklist on an existing active intake.');
});
