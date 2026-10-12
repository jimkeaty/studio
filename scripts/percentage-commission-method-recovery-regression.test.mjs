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
  assert.match(form, /form\.setValue\('commissionFlatAmount', '' as any\)/);
  assert.match(form, /form\.setValue\('gci', '' as any\)/);
  assert.match(form, /warrantyPaidBy, commissionMode\]/);
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

test('TC intake persists the selected commission method and flat amount separately', () => {
  assert.match(intakeRoute, /commissionCalculationMethod: body\.commissionCalculationMethod === 'flat_dollar' \? 'flat_dollar' : 'percentage'/);
  assert.match(intakeRoute, /commissionFlatAmount: body\.commissionCalculationMethod === 'flat_dollar' \? toNum\(body\.commissionFlatAmount\) : null/);
});
