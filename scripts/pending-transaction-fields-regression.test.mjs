import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const form = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');

const pendingTerms = [
  'contractDate', 'projectedCloseDate', 'salePrice',
  'sellerPayingListingAgent', 'cooperatingAgentCommissionMethod',
  'commissionCalculationMethod', 'commissionFlatAmount',
  'agentId', 'clientName', 'mortgageCompany', 'titleCompany',
  'agentBonusPassThrough', 'txComplianceFee', 'shortageAmount',
  'warrantyAtClosing', 'buyerClosingCostTotal',
];

test('Pending transaction hydration restores all applicable terms instead of dropping them after a status change', () => {
  for (const field of pendingTerms) assert.match(form, new RegExp(`${field}:`));
  assert.match(form, /setPersistedEditStatus\(String\(fieldMap\.status/);
  assert.match(form, /const valuesForSave: Record<string, any> = \{ \.\.\.values \}/);
});

test('all authorized Pending save paths retain the full term set, including bonuses, without treating bonuses or cooperating offers as GCI inputs', () => {
  for (const [name, route] of Object.entries({ agentRoute, adminRoute, staffRoute, tcRoute })) {
    for (const field of pendingTerms) {
      assert.match(route, new RegExp(field), `${name} must support ${field}`);
    }
  }
  assert.doesNotMatch(staffRoute.match(/const COMMISSION_TRIGGER_FIELDS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '', /agentBonusPassThrough/);
  assert.doesNotMatch(tcRoute.match(/const COMMISSION_TRIGGER = new Set\(\[[\s\S]*?\]\);/)?.[0] || '', /agentBonusPassThrough/);
});

test('pending-to-edit-to-refresh flow retains concurrency protection and supports authorized operational review', () => {
  assert.match(form, /expectedUpdatedAt: transactionVersionRef\.current/);
  assert.match(form, /Transaction changed — refresh required/);
  assert.match(agentRoute, /hasTransactionVersionConflict/);
  assert.match(adminRoute, /hasTransactionVersionConflict/);
  assert.match(staffRoute, /hasTransactionVersionConflict/);
  assert.match(tcRoute, /hasTransactionVersionConflict/);
});

test('Pending listing cooperation remains independently editable while the global agent closed-file guard remains intact', () => {
  assert.match(form, /isListingSideTransaction && PENDING_STATUSES/);
  assert.match(form, /cooperatingAgentCommissionFlatAmount/);
  assert.match(agentRoute, /Closed transactions cannot be edited by agents/);
  assert.match(adminRoute, /verifyAdmin/);
});
