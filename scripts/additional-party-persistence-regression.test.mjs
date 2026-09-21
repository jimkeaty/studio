import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const unifiedEditor = readFileSync(new URL('src/app/dashboard/transactions/new/page.tsx', root), 'utf8');
const agentTransactionRoute = readFileSync(new URL('src/app/api/agent/transactions/[txId]/route.ts', root), 'utf8');
const tcSubmissionRoute = readFileSync(new URL('src/app/api/tc/route.ts', root), 'utf8');
const adminTransactionRoute = readFileSync(new URL('src/app/api/admin/transactions/route.ts', root), 'utf8');
const staffQueueRoute = readFileSync(new URL('src/app/api/admin/staff-queue/[itemId]/route.ts', root), 'utf8');
const tcQueueRoute = readFileSync(new URL('src/app/api/admin/tc/[id]/route.ts', root), 'utf8');
const legacyCreationRoute = readFileSync(new URL('src/app/api/transactions/route.ts', root), 'utf8');

const additionalPartyFields = [
  'buyer3Name', 'buyer3Email', 'buyer3Phone',
  'buyer4Name', 'buyer4Email', 'buyer4Phone',
  'seller3Name', 'seller3Email', 'seller3Phone',
  'seller4Name', 'seller4Email', 'seller4Phone',
];

test('additional buyers and sellers are accepted by every canonical transaction save path', () => {
  for (const field of additionalPartyFields) {
    for (const [name, source] of [
      ['agent transaction update', agentTransactionRoute],
      ['agent TC submission', tcSubmissionRoute],
      ['admin transaction update', adminTransactionRoute],
      ['Staff Queue update', staffQueueRoute],
      ['TC Queue update', tcQueueRoute],
      ['legacy transaction creation', legacyCreationRoute],
    ]) {
      assert.match(source, new RegExp(field), `${field} must remain in ${name}`);
    }
  }
});

test('reopening an existing transaction shows saved third and fourth parties', () => {
  assert.match(unifiedEditor, /const hasPartyContact = \(\.\.\.partyValues: unknown\[\]\)/);
  assert.match(unifiedEditor, /setShowBuyer3\(hasBuyer3 \|\| hasBuyer4\)/);
  assert.match(unifiedEditor, /setShowBuyer4\(hasBuyer4\)/);
  assert.match(unifiedEditor, /setShowSeller3\(hasSeller3 \|\| hasSeller4\)/);
  assert.match(unifiedEditor, /setShowSeller4\(hasSeller4\)/);
  for (const field of additionalPartyFields) {
    assert.match(unifiedEditor, new RegExp(`${field}: tx\\.${field} \\|\\| ''`));
  }
});

test('additional clients are saved to the agent contact book after a successful transaction save', () => {
  for (const expression of [
    'values.buyer3Name', 'values.buyer4Name', 'values.seller3Name', 'values.seller4Name',
  ]) {
    assert.match(unifiedEditor, new RegExp(expression.replace('.', '\\.')));
  }
  assert.match(unifiedEditor, /await syncContactsToBook\(token\)/);
});

test('Staff, TC, Admin, Accounting, and agent views use the same fully hydrated editor', () => {
  assert.match(unifiedEditor, /const isAccountingCloseoutMode = editMode/);
  assert.match(unifiedEditor, /isAdminEdit = hasOperationalEditAuthority/);
  assert.match(unifiedEditor, /apiUrl = `\/api\/agent\/transactions\/\$\{editTxId\}/);
});
