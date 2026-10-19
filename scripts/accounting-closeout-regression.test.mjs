import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const closeout = read('src/lib/transactions/accountingCloseout.ts');
const route = read('src/app/api/admin/accounting-closeout/route.ts');
const staffQueue = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcQueue = read('src/app/api/admin/tc/[id]/route.ts');
const adminTransactions = read('src/app/api/admin/transactions/route.ts');
const access = read('src/lib/auth/staffAccess.ts');
const panel = read('src/components/dashboard/broker/AccountingCloseoutQueue.tsx');

test('accounting closeout is a departmental workflow on the canonical transaction', () => {
  assert.match(closeout, /departmentalProcessing/);
  assert.match(closeout, /accountingCloseout/);
  assert.match(closeout, /processingHistory/);
  assert.match(closeout, /const batch = db\.batch\(\)/);
  assert.match(closeout, /await batch\.commit\(\)/);
  assert.match(closeout, /TC\/Staff closeout completed and the closed transaction was sent to Accounting/);
  assert.match(staffQueue, /handoffClosedTransactionToAccounting/);
  assert.match(staffQueue, /action === 'approve' && Boolean\(item\.transactionId\)/);
  assert.match(staffQueue, /const shouldVerifyAccountingHandoff/);
  assert.match(staffQueue, /const queueRequestedClosedStatus/);
  assert.match(staffQueue, /Accounting handoff could not be verified/);
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
  assert.match(closeout, /Agent net \/ Primary GCI/);
  assert.match(panel, /agentNet/);
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

test('a Closed save remains in Staff Queue until Staff approves it for Accounting', () => {
  assert.doesNotMatch(adminTransactions, /handoffClosedTransactionToAccounting/);
  assert.doesNotMatch(tcQueue, /handoffClosedTransactionToAccounting/);
  assert.doesNotMatch(staffQueue, /closedCanonicalSaveNeedsAccountingHandoff/);
  assert.match(staffQueue, /A Staff approval is the sole gate from a closed canonical transaction into/);
  assert.match(staffQueue, /The Staff Queue item was not approved/);
  assert.match(staffQueue, /verified handoff to Accounting/);
  assert.match(staffQueue, /accountingHandoff: \{ \.\.\.accountingHandoff, verified: true \}/);
  assert.match(route, /TC\/Staff closeout has not handed this transaction to Accounting yet/);
});

test('status normalization cannot hide a valid Staff handoff and TC-created closed files enter Staff review first', () => {
  assert.match(closeout, /ACCOUNTING_CLOSEOUT_QUERY_STATUSES/);
  assert.match(closeout, /normalizeAccountingCloseoutStatus/);
  assert.match(closeout, /isClosedTransactionStatus/);
  assert.match(closeout, /status === 'new' \|\| status === 'in_progress' \|\| status === 'needs_information'/);
  assert.match(route, /ACCOUNTING_CLOSEOUT_QUERY_STATUSES/);
  assert.match(route, /isClosedTransactionStatus\(transaction\.status\)/);
  assert.match(tcQueue, /closed_tc_approval/);
  assert.match(tcQueue, /staffCloseoutQueueItemId/);
  assert.match(tcQueue, /hasOpenAccountingCloseout/);
  assert.doesNotMatch(tcQueue, /handoffClosedTransactionToAccounting/);
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
