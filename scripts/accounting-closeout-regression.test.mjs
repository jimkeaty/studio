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
  assert.match(staffQueue, /action === 'approve' \|\| action === 'complete'/);
  assert.match(staffQueue, /const shouldHandoffClosedTransaction/);
  assert.match(staffQueue, /String\(txDocForAccounting\.data\(\)\?\.status \|\| ''\)\.toLowerCase\(\) === 'closed'/);
});

test('accounting snapshot supplies the full requested transaction, commission, referral, fee, and payout data to the list-first queue', () => {
  for (const field of [
    'propertyAddress', 'clientNames', 'leadSource', 'listingDate', 'contractDate', 'projectedCloseDate', 'listingExpirationDate', 'closeDate',
    'listPrice', 'salePrice', 'commissionPercent', 'grossGci', 'transactionFee', 'brokerPercent', 'brokerGci', 'referral', 'agentPercent', 'agentNet', 'bonuses', 'totalAgentPayout',
  ]) {
    assert.match(closeout, new RegExp(`id: '${field}'`));
  }
  assert.match(closeout, /resolveGCI/);
  assert.match(closeout, /getAgentBonusPassThrough/);
  assert.match(closeout, /companySplitPercent/);
  assert.match(closeout, /agentSplitPercent/);
  assert.match(closeout, /outboundReferralFeePercent/);
  assert.match(closeout, /'value' \| 'zero' \| 'missing' \| 'na'/);
  assert.match(closeout, /requiredAccountingFieldsMissing/);
  assert.match(panel, /Client\(s\)/);
  assert.match(panel, /Agent Take Home/);
  assert.match(panel, /totalAgentPayout/);
});

test('accounting access and completion validation cannot silently bypass incomplete data', () => {
  assert.match(access, /'accounting'/);
  assert.match(access, /isAccountingUser/);
  assert.match(route, /Only closed transactions can be processed by Accounting/);
  assert.match(route, /Required accounting fields are incomplete/);
  assert.match(staffQueue, /getDesignatedAccountingUids/);
  assert.match(staffQueue, /accounting_closeout_new/);
  assert.match(staffQueue, /const alreadyInAccounting/);
});

test('the accounting workflow is list-first, opens the full editor, and has no manual case assignment', () => {
  for (const action of ['needs_information', 'set_field_state', 'complete', 'reopen']) {
    assert.match(route, new RegExp(`action === '${action}'`));
  }
  assert.doesNotMatch(route, /action === 'take'/);
  assert.doesNotMatch(route, /action === 'assign'/);
  assert.doesNotMatch(panel, /Take case/);
  assert.match(panel, /Open &amp; edit/);
  assert.match(panel, /accountingCloseout=1/);
});
