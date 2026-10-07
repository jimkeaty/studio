import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const editor = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const intakeRoute = read('src/app/api/tc/route.ts');
const production = read('src/lib/transactions/resolveProductionCredit.ts');
const rollup = read('src/lib/rollups/rebuildAgentRollup.ts');

for (const [name, source] of Object.entries({ agentRoute, adminRoute, staffRoute, tcRoute, intakeRoute })) {
  assert.match(source, /applyReferralIncomeFinancials/, `${name} must normalize referral income before persistence or calculation`);
}

for (const field of [
  'referralExpectedExternalGrossCommission',
  'referralFeePercent',
  'referralExpectedFee',
  'referralActualFeeReceived',
  'referralFeeReceivedDate',
]) {
  assert.match(editor, new RegExp(field), `editor must expose ${field}`);
  assert.match(agentRoute, new RegExp(field), `agent route must permit ${field}`);
  assert.match(adminRoute, new RegExp(field), `operational route must permit ${field}`);
}

assert.match(editor, /zero sides and zero dollar volume/);
assert.match(editor, /Expected Gross Commission on Outside Deal/);
assert.match(editor, /Actual Referral Fee Received/);
assert.match(production, /if \(isReferralIncome\(tx\)\) return 0/);
assert.match(rollup, /referralFeeReceivedDate/);

console.log('referral-income persistence boundary regression passed');
