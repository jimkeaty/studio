import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const form = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffQueueRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const createRoute = read('src/app/api/tc/route.ts');
const auditHelper = read('src/lib/transactions/cooperatingCommission.ts');
const sharedTypes = read('src/lib/types.ts');

test('pending listing cooperating commission has a dedicated, independent percentage-or-dollar model', () => {
  assert.match(form, /const optionalCooperatingCommissionMethod = optionalSelect\(\['percentage', 'flat_dollar'\]\)/);
  assert.match(form, /cooperatingAgentCommissionMethod: optionalCooperatingCommissionMethod/);
  assert.match(form, /cooperatingAgentCommissionPercent:/);
  assert.match(form, /cooperatingAgentCommissionFlatAmount:/);
  assert.match(form, /Cooperating Agent Commission/);
  assert.match(form, /This buyer-agent offer is separate from SmartBroker/);
  assert.match(form, /isListingSideTransaction && PENDING_STATUSES/);
  assert.match(form, /else if \(watchedClosingType === 'dual'\) autoPct = listingPct;/);
  assert.match(form, /const buyerAmount = watchedClosingType === 'buyer'/);
  assert.match(sharedTypes, /cooperatingAgentCommissionMethod/);
  assert.match(auditHelper, /listing-side gross commission/);
  assert.match(auditHelper, /closingType !== 'listing' && closingType !== 'dual'/);
});

test('all authorized save paths preserve dedicated cooperating commission values without treating them as GCI inputs', () => {
  for (const source of [agentRoute, adminRoute, staffQueueRoute, tcRoute]) {
    assert.match(source, /cooperatingAgentCommissionMethod/);
    assert.match(source, /cooperatingAgentCommissionPercent/);
    assert.match(source, /cooperatingAgentCommissionFlatAmount/);
    assert.match(source, /buildCooperatingCommissionUpdate/);
  }
  assert.match(createRoute, /cooperatingAgentCommissionMethod/);
  assert.match(createRoute, /cooperatingAgentCommissionFlatAmount/);
  assert.doesNotMatch(staffQueueRoute.match(/const COMMISSION_TRIGGER_FIELDS[\s\S]*?\];/)?.[0] || '', /cooperatingAgentCommission/);
  assert.doesNotMatch(tcRoute.match(/const COMMISSION_TRIGGER[\s\S]*?\];/)?.[0] || '', /cooperatingAgentCommission/);
});

test('each changed offer creates an immutable before-and-after audit event for outside and in-house cooperation', () => {
  assert.match(auditHelper, /eventType: 'cooperating_agent_commission_changed'/);
  assert.match(auditHelper, /before:/);
  assert.match(auditHelper, /after:/);
  assert.match(auditHelper, /category: hasInHouseCoAgent \? 'in_house' : \(brokerage \? 'outside_brokerage'/);
  for (const source of [agentRoute, adminRoute, staffQueueRoute, tcRoute]) {
    assert.match(source, /collection\('auditEvents'\)\.doc\(\)/);
    assert.match(source, /batch\.create/);
  }
});

test('agent edits remain blocked after Closed while operational routes retain their authorized transaction update paths', () => {
  assert.match(agentRoute, /txData\.status === 'closed'/);
  assert.match(agentRoute, /hasTransactionVersionConflict\(txData\.updatedAt, expectedUpdatedAt\)/);
  assert.match(adminRoute, /verifyAdmin/);
  assert.match(staffQueueRoute, /isStaff\(decoded\.uid\)/);
  assert.match(tcRoute, /isAdminLike|isStaff/);
});

test('legacy buyer-side seller-paid commission remains outside the new listing-side offer model', () => {
  assert.match(form, /if \(values\.isPassThrough \|\| !isListingSideTransaction\) \{/);
  assert.match(form, /delete valuesForSave\.cooperatingAgentCommissionMethod/);
  assert.match(auditHelper, /blank form defaults can never erase buyer data/);
});
