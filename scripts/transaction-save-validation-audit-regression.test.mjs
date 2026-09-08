import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const form = read('src/app/dashboard/transactions/new/page.tsx');
const createRoute = read('src/app/api/tc/route.ts');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffQueueRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');

test('the unified form has only status, transaction side, TC routing, and a non-referral address as hard content requirements', () => {
  assert.match(form, /status: z\.enum\(\['active', 'coming_soon', 'pending', 'closed', 'cancelled', 'temp_off_market'\], \{ required_error: 'Please select a status to continue' \}\)/);
  assert.match(form, /closingType: z\.enum\(\['buyer', 'listing', 'referral', 'dual'\], \{ required_error: 'Type of closing is required' \}\)/);
  assert.match(form, /tcWorking: z\.enum\(\['yes', 'no'\], \{ required_error: 'Please select Yes or No\.' \}\)/);
  assert.match(form, /data\.closingType === 'referral' \|\| String\(data\.address \|\| ''\)\.trim\(\)\.length >= 5/);
  assert.match(form, /Full property address is required for buyer, listing, and dual transactions\./);
  assert.match(form, /dealType: 'residential_sale'/);
  assert.match(form, /tcWorking: 'yes'/);
  assert.doesNotMatch(form, /<Input[^>]*\srequired(?:=|\s|>)/);
  assert.doesNotMatch(form, /<Select[^>]*\srequired(?:=|\s|>)/);
});

test('all optional select families accept blank values and cannot block a Pending status save', () => {
  const blankSafeHelpers = [
    'optionalYesNo',
    'optionalCommissionCalculationMethod',
    'optionalDepositHolder',
    'optionalCommercialLeaseCommissionMode',
    'optionalClientType',
    'optionalInspectionScheduleChoice',
    'optionalShowingNewOrChange',
    'optionalShowingContactType',
    'optionalCooperatingCommissionMethod',
    'optionalCommissionMode',
    'optionalFeeAllocation',
    'optionalCoAgentRole',
  ];
  for (const helper of blankSafeHelpers) {
    assert.match(form, new RegExp(`const ${helper} = .*\\.optional\\(\\)\\.or\\(z\\.literal\\(''\\)\\)`), `${helper} must accept a blank form value`);
  }
  assert.match(form, /preListingTcScheduleInspections: optionalInspectionScheduleChoice/);
  assert.match(form, /tcScheduleInspections: optionalInspectionScheduleChoice/);
  assert.match(form, /buyerWarrantyEducationRequested: optionalYesNo/);
  assert.match(form, /sellerWarrantyEducationRequested: optionalYesNo/);
  assert.match(form, /showingNewOrChange: optionalShowingNewOrChange/);
  assert.match(form, /if \(typeof candidate === 'boolean' \|\| candidate === null \|\| candidate === undefined\) return fallback/);
  assert.match(form, /const safeStringArray = \(val: unknown\): string\[\] => \{/);
  assert.match(form, /showingCallOrder2Notify: safeStringArray\(tx\.showingCallOrder2Notify\)/);
  assert.match(form, /showingCallOrder3Notify: safeStringArray\(tx\.showingCallOrder3Notify\)/);
});

test('conditional financial and co-agent rules apply only when the user elects those workflows', () => {
  assert.match(form, /if \(!data\.hasCoAgent\) return true/);
  assert.match(form, /Primary and co-agent split percentages must total 100%/);
  assert.match(adminRoute, /body\.validateManualPercentageSplit === true/);
  assert.match(adminRoute, /Broker % and Agent % must both be provided and total 100%, or clear both values for a manual dollar override/);
  assert.match(adminRoute, /Exact gross commission must be a valid non-negative dollar amount/);
  assert.match(form, /z\.string\(\)\.email\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
});

test('new-agent submission requires a valid transaction type, a non-referral address, and a client name only for buyer or dual files', () => {
  assert.match(createRoute, /if \(!closingType \|\| !VALID_CLOSING_TYPES\.has\(closingType\)\)/);
  assert.match(createRoute, /if \(!address && closingType !== 'referral'\) return jsonError\(400, 'address is required'\)/);
  assert.match(createRoute, /if \(!clientName && closingType !== 'listing' && closingType !== 'referral'\)/);
  assert.match(createRoute, /if \(!VALID_DEAL_TYPES\.has\(dealType\)\)/);
});

test('existing transaction updates allow Pending status changes and do not impose content-field requirements in operational queue routes', () => {
  assert.match(agentRoute, /AGENT_ALLOWED_STATUSES = new Set\(\['active', 'coming_soon', 'temp_off_market', 'pending'/);
  assert.doesNotMatch(agentRoute, /clientName is required/);
  assert.doesNotMatch(agentRoute, /address is required/);
  assert.doesNotMatch(staffQueueRoute, /clientName is required/);
  assert.doesNotMatch(staffQueueRoute, /address is required/);
  assert.match(tcRoute, /Cannot approve: this intake has no agent assigned/);
  assert.match(adminRoute, /No valid fields to update/);
});
