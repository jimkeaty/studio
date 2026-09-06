import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const closeout = read('src/lib/transactions/accountingCloseout.ts');
const route = read('src/app/api/admin/accounting-closeout/route.ts');
const staffQueue = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const access = read('src/lib/auth/staffAccess.ts');
const panel = read('src/components/dashboard/broker/AccountingCloseoutQueue.tsx');

test('accounting closeout is a departmental workflow on the canonical transaction', () => {
  assert.match(closeout, /departmentalProcessing/);
  assert.match(closeout, /accountingCloseout/);
  assert.match(closeout, /processingHistory/);
  assert.match(closeout, /TC\/Staff closeout completed and the closed transaction was sent to Accounting/);
  assert.match(staffQueue, /handoffClosedTransactionToAccounting/);
  assert.match(staffQueue, /String\(txDocForAccounting\.data\(\)\?\.status \|\| ''\)\.toLowerCase\(\) === 'closed'/);
});

test('accounting snapshot preserves the required financial and closeout fields with zero, missing, and N/A states', () => {
  for (const field of ['propertyAddress', 'transactionIdentifier', 'salePrice', 'grossGci', 'companyDollar', 'agentCommission', 'bonuses', 'inHouse', 'dualAgent', 'warranty', 'transactionFee', 'listingFee']) {
    assert.match(closeout, new RegExp(`id: '${field}'`));
  }
  assert.match(closeout, /'value' \| 'zero' \| 'missing' \| 'na'/);
  assert.match(closeout, /requiredAccountingFieldsMissing/);
});

test('accounting access and completion validation cannot silently bypass incomplete data', () => {
  assert.match(access, /'accounting'/);
  assert.match(access, /isAccountingUser/);
  assert.match(route, /Only closed transactions can be processed by Accounting/);
  assert.match(route, /Required accounting fields are incomplete/);
  assert.match(staffQueue, /getAccountingUids/);
  assert.match(staffQueue, /accounting_closeout_new/);
});

test('the accounting queue supports taking, assigning, requesting information, N/A review, and completion', () => {
  for (const action of ['take', 'assign', 'needs_information', 'set_field_state', 'complete', 'reopen']) {
    assert.match(route, new RegExp(`action === '${action}'`));
  }
  assert.match(panel, /Take case/);
  assert.match(panel, /Request information/);
  assert.match(panel, /Mark \{field\} N\/A/);
  assert.match(panel, /Accounting complete/);
});
