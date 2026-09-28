import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const initialSubmissionRoute = read('src/app/api/tc/route.ts');
const tcQueueApi = read('src/app/api/admin/tc/route.ts');
const tcQueuePage = read('src/app/dashboard/admin/tc/page.tsx');
const lifecycleHelper = read('src/lib/transactions/tcQueueLifecycle.ts');

test('TC lifecycle finds all legacy links but selects one durable wrapper per transaction', () => {
  assert.match(lifecycleHelper, /where\('transactionId', '==', transactionId\)/);
  assert.match(lifecycleHelper, /where\('approvedTransactionId', '==', transactionId\)/);
  assert.match(lifecycleHelper, /selectCanonicalTcIntake/);
  assert.match(lifecycleHelper, /preferredIntakeId/);
  assert.match(lifecycleHelper, /duplicateCount: Math\.max\(0, candidates\.length - 1\)/);
});

test('a changed TC-managed transaction reopens the existing queue item without resetting its assignment or checklist', () => {
  assert.match(lifecycleHelper, /status: 'submitted'/);
  assert.match(lifecycleHelper, /submittedAt: existing\.data\.submittedAt \|\| nowIso/);
  assert.match(lifecycleHelper, /reviewedAt: null/);
  assert.match(lifecycleHelper, /reopenedAt: nowIso/);
  assert.match(lifecycleHelper, /await ensureTcChecklist\(db, existing\.id\)/);
  assert.match(lifecycleHelper, /set\([\s\S]*\{ merge: true \}\)/);
  assert.doesNotMatch(lifecycleHelper, /assignedTcProfileId:/, 'An agent edit must not clear the existing TC assignment.');
  assert.doesNotMatch(lifecycleHelper, /checklistRef\.doc\(.*\)\.delete/, 'An agent edit must not delete TC checklist progress.');
});

test('new TC-managed submissions use the transaction ID as the durable queue ID', () => {
  assert.match(initialSubmissionRoute, /collection\('tcIntakes'\)\.doc\(txRef\.id\)/);
  assert.match(initialSubmissionRoute, /queueUpdatedAt: now/);
  assert.match(initialSubmissionRoute, /lastChangedByRole: 'agent'/);
});

test('agent edits refresh one TC queue record and reopen approvals instead of creating resubmission rows', () => {
  assert.match(agentRoute, /findTcIntakesForTransaction\(adminDb, txId, txData\.tcIntakeId\)/);
  assert.match(agentRoute, /const shouldRefreshTcQueue = effectiveWorkingWithTc \|\| hasLinkedTcIntake \|\| !!resubmitToTc/);
  assert.match(agentRoute, /reopenTcIntakeForTransaction\(adminDb, \{/);
  assert.match(agentRoute, /tcIntakeId: tcQueueUpdate\.id/);
  assert.match(agentRoute, /tcQueueRefreshed: Boolean\(tcQueueUpdate\)/);
  assert.doesNotMatch(agentRoute, /collection\('tcIntakes'\)\.add\(/, 'Agent edits must not append a new TC queue wrapper.');
});

test('operational Admin and Staff edits follow the same TC queue upsert lifecycle', () => {
  assert.match(adminRoute, /findTcIntakesForTransaction\(adminDb, id, txForTcQueue\?\.tcIntakeId\)/);
  assert.match(adminRoute, /reopenTcIntakeForTransaction\(adminDb, \{/);
  assert.match(adminRoute, /tcIntakeId: queueUpdate\.id/);
});

test('TC Queue returns one row per transaction and sorts newest changes first', () => {
  assert.match(tcQueueApi, /function dedupeTcQueueIntakes/);
  assert.match(tcQueueApi, /const intakes = dedupeTcQueueIntakes\(rawIntakes\)/);
  assert.match(tcQueueApi, /queueUpdatedAt \|\| intake\.lastChangedAt \|\| intake\.updatedAt \|\| intake\.submittedAt/);
  assert.match(tcQueueApi, /return queueActivityTime\(b\) - queueActivityTime\(a\)/);
  assert.match(tcQueuePage, /Last Changed/);
  assert.match(tcQueuePage, /Reopened for review/);
});

test('direct administrative TC submissions refresh an existing linked queue item', () => {
  assert.match(tcQueueApi, /const canonicalTransactionId = toStr\(body\.transactionId\)/);
  assert.match(tcQueueApi, /if \(body\.assignedTcProfileId === undefined\) delete linkedIntakeData\.assignedTcProfileId/);
  assert.match(tcQueueApi, /reopenTcIntakeForTransaction\(adminDb, \{/);
  assert.match(tcQueueApi, /reopened: queueUpdate\.reopened/);
});
