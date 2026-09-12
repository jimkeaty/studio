import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const editor = read('src/app/dashboard/transactions/new/page.tsx');
const panel = read('src/components/dashboard/broker/AccountingCloseoutQueue.tsx');
const staffQueue = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const recipientHelpers = read('src/lib/notifications/getRecipientUids.ts');
const staffUsers = read('src/app/api/admin/staff-users/[userId]/route.ts');
const staffUsersPage = read('src/app/dashboard/admin/staff-users/page.tsx');

test('Accounting Queue is a searchable list with an explicit full-editor action', () => {
  assert.match(panel, /Search address, client, agent, or source/);
  assert.match(panel, /Open &amp; edit/);
  assert.match(panel, /dashboard\/transactions\/new\?edit=/);
  assert.match(panel, /accountingCloseout=1/);
  assert.doesNotMatch(panel, /Take case/);
  assert.doesNotMatch(panel, /Assign case/);
});

test('Accounting edit mode saves through the canonical editor before attempting completion', () => {
  assert.match(editor, /isAccountingCloseoutMode/);
  assert.match(editor, /saveAndCompleteAccounting/);
  assert.match(editor, /lastSaveSucceededRef\.current = false/);
  assert.match(editor, /await form\.handleSubmit\(onSubmit, handleInvalidSubmit\)\(\)/);
  assert.match(editor, /action: 'complete'/);
  assert.match(editor, /Save & complete Accounting/);
  assert.match(editor, /isInHouse/);
});

test('new closeouts notify one configurable designated Accounting recipient while honoring existing delivery preferences', () => {
  assert.match(recipientHelpers, /getDesignatedAccountingUids/);
  assert.match(recipientHelpers, /receivesAccountingCloseoutNotifications/);
  assert.match(staffQueue, /getDesignatedAccountingUids/);
  assert.match(staffUsers, /Only an Accounting user can be designated/);
  assert.match(staffUsers, /receivesAccountingCloseoutNotifications/);
  assert.match(staffUsersPage, /Designated Accounting recipient/);
});
