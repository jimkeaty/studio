import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const queue = read('src/components/dashboard/broker/AccountingCloseoutQueue.tsx');
const snapshot = read('src/lib/transactions/accountingCloseout.ts');
const route = read('src/app/api/admin/accounting-closeout/route.ts');

const requestedFieldIds = [
  'type', 'transactionStatus', 'dealType', 'agent', 'propertyAddress', 'leadSource', 'closeDate',
  'listPrice', 'salePrice', 'commissionPercent', 'grossGci', 'transactionFee', 'brokerPercent',
  'brokerGci', 'referral', 'agentPercent', 'agentNet', 'teamMember1', 'teamMember1Pct',
  'teamMember1Gci', 'teamMember2',
];

test('Accounting snapshot provides the requested transaction and payout detail fields from the canonical transaction', () => {
  for (const id of requestedFieldIds) {
    assert.match(snapshot, new RegExp(`id: '${id}'`));
  }
  assert.match(snapshot, /label: 'List price \/ Buyer rep price'/);
  assert.match(snapshot, /label: 'Agent net \/ Primary GCI'/);
  assert.match(snapshot, /value: transactionStatus === 'closed' \? 'Closed'/);
});

test('Accounting Queue presents Closed as the transaction status and keeps department review separate', () => {
  assert.match(queue, /Transaction status/);
  assert.match(queue, /<Badge variant="outline">\{textValue\(item, 'transactionStatus', 'Closed'\)\}<\/Badge>/);
  assert.match(queue, /Accounting review:/);
  assert.match(queue, /Ready for Accounting review/);
  assert.doesNotMatch(queue, /statusLabel/);
  assert.doesNotMatch(queue, /In Progress/);
  assert.doesNotMatch(queue, /New<\/div>/);
});

test('Accounting Queue offers a detailed transaction view without creating a second editor', () => {
  assert.match(queue, /Accounting Transaction Detail/);
  assert.match(queue, /<Eye[\s\S]*?View/);
  assert.match(queue, /title="Financials" fields=\{\['listPrice', 'salePrice', 'commissionPercent', 'grossGci', 'transactionFee', 'brokerPercent', 'brokerGci', 'referral'\]\}/);
  assert.match(queue, /title="Agent and Team Payouts" fields=\{\['agentPercent', 'agentNet', 'teamMember1', 'teamMember1Pct', 'teamMember1Gci', 'teamMember2'\]\}/);
  assert.match(queue, /dashboard\/transactions\/new\?edit=\$\{viewingItem\.transactionId\}&accountingCloseout=1/);
});

test('Accounting Queue remains an index of canonical Closed transactions only', () => {
  assert.match(route, /String\(transaction\.status \|\| ''\)\.toLowerCase\(\) !== 'closed'/);
  assert.match(route, /buildAccountingSnapshot\(transaction, doc\.id\)/);
});
