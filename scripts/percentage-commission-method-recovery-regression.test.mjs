import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const form = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminRoute = read('src/app/api/admin/transactions/route.ts');
const staffQueueRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const intakeRoute = read('src/app/api/tc/route.ts');

test('percentage selection clears the prior flat amount and schedules a percentage GCI recalculation', () => {
  assert.match(form, /form\.setValue\('commissionCalculationMethod', next === 'flat' \? 'flat_dollar' : 'percentage'\)/);
  assert.match(form, /profileRecalculationRequested\.current = true/);
  assert.match(form, /commissionManualOverride\.current = false/);
  assert.match(form, /form\.setValue\('commissionFlatAmount', '' as any\)/);
  assert.match(form, /form\.setValue\('gci', '' as any\)/);
  assert.match(form, /warrantyPaidBy, commissionMode\]/);
});

test('flat-dollar files reopen with the saved exact GCI rather than a legacy percentage field', () => {
  assert.match(form, /resolveSavedFlatDollarCommission/);
  assert.match(form, /const resolvedFlatDollarCommission = savedFlatDollarMethod/);
  assert.match(form, /sellerPayingBuyerAgent: resolvedSellerPayingBuyerAgent/);
  assert.match(form, /commissionFlatAmount: resolvedFlatDollarCommission/);
  assert.match(form, /retained their percentage in sellerPayingBuyerAgent/);
});

test('all operational edit routes normalize an explicit percentage selection before saving', () => {
  for (const [name, source] of [
    ['agent transaction route', agentRoute],
    ['admin transaction route', adminRoute],
    ['Staff Queue route', staffQueueRoute],
    ['TC queue route', tcRoute],
  ]) {
    assert.match(source, /normalizePercentageCommissionMethod/, `${name} must recover a stale flat GCI`);
  }

  assert.match(tcRoute, /normalizePercentageCommissionMethod\(\{\}, intake\)/);
  assert.match(intakeRoute, /normalizePercentageCommissionMethod\(\{\}, body\)/);
});

test('an explicit percentage recovery clears only a prior flat override and lets the calculated split win', () => {
  assert.match(adminRoute, /updates\.commissionOverridden === false\s*\? false/);
  assert.match(adminRoute, /hasDirectSplitChange && !isPassThrough && updates\.commissionOverridden !== false/);
  assert.match(staffQueueRoute, /allowed\.commissionOverridden !== false/);
  assert.match(tcRoute, /txSyncUpdate\.commissionOverridden !== false/);
  assert.match(agentRoute, /updates\.commissionOverridden === false\s*\? false/);
});

test('TC intake persists the selected commission method and flat amount separately', () => {
  assert.match(intakeRoute, /commissionCalculationMethod: body\.commissionCalculationMethod === 'flat_dollar' \? 'flat_dollar' : 'percentage'/);
  assert.match(intakeRoute, /commissionFlatAmount: body\.commissionCalculationMethod === 'flat_dollar' \? toNum\(body\.commissionFlatAmount\) : null/);
});
