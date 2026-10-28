import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const summary = read('src/lib/transactions/changeSummary.ts');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const staffRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const editor = read('src/app/dashboard/transactions/new/page.tsx');
const notifications = read('src/lib/notifications/sendNotification.ts');
const settings = read('src/app/dashboard/settings/notifications/page.tsx');

test('change alerts use only a verified before-and-after summary and never put contact values in the message body', () => {
  assert.match(summary, /Summarizes only verified, persisted differences/);
  assert.match(summary, /Contact values and notes are[\s\S]*not copied into a notification/);
  assert.match(agentRoute, /const persistedTxSnapForNotifications = await txRef\.get\(\)/);
  assert.match(agentRoute, /buildTransactionChangeSummary\([\s\S]*txData,[\s\S]*persistedTxForNotifications/);
  assert.match(staffRoute, /buildTransactionChangeSummary\([\s\S]*currentTx,[\s\S]*verifiedTransaction/);
  assert.match(tcRoute, /buildTransactionChangeSummary\([\s\S]*currentTxForUpdate,[\s\S]*verifiedTransaction/);
});

test('agent edits notify Staff and appropriate TC recipients exactly once with field-level details', () => {
  assert.match(agentRoute, /type: 'transaction_change_details'/);
  assert.match(agentRoute, /recipientUids: staffUids/);
  assert.match(agentRoute, /const tcOnly = tcUids\.filter\(uid => !staffSet\.has\(uid\)\)/);
  assert.match(agentRoute, /shouldRefreshTcQueue && !tcQueueUpdate/);
  assert.doesNotMatch(agentRoute, /title: 'Transaction Updated — Please Review'/);
});

test('Staff and TC saves return exact field-level updates to the other operational role or agent', () => {
  assert.match(staffRoute, /Staff Updated Transaction — \$\{transactionChangeSummary\.sectionLabel\}/);
  assert.match(staffRoute, /transactionChangeUrl\(String\(item\.transactionId\), transactionChangeSummary\.section\)/);
  assert.match(tcRoute, /TC Updated Your Transaction — \$\{verifiedChangeSummary\.sectionLabel\}/);
  assert.match(tcRoute, /transactionChangeUrl\(linkedTxId, verifiedChangeSummary\.section\)/);
});

test('detailed alerts have their own recipient preference and open the relevant transaction section', () => {
  assert.match(notifications, /'transaction_change_details'/);
  assert.match(settings, /Detailed Transaction Changes/);
  assert.match(editor, /notificationFocus/);
  assert.match(editor, /transaction-section-\$\{notificationFocus\}/);
  assert.match(editor, /setMediaOrderOpen\(true\)/);
  assert.match(editor, /transaction-section-documents/);
});
