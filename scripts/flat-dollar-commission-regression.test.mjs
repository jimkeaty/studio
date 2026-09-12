import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const commissionCalculator = read('src/lib/commissions/index.ts');
const transactionForm = read('src/app/dashboard/transactions/new/page.tsx');
const agentRoute = read('src/app/api/agent/transactions/[txId]/route.ts');
const adminTransactionRoute = read('src/app/api/admin/transactions/route.ts');
const staffQueueRoute = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');

test('flat-dollar commission uses a durable explicit method and exact amount', () => {
  assert.match(commissionCalculator, /function isFlatDollarCommission/);
  assert.match(commissionCalculator, /commissionCalculationMethod/);
  assert.match(commissionCalculator, /commissionFlatAmount/);
  assert.match(commissionCalculator, /flatAmount >= 0/);
  assert.match(transactionForm, /const optionalCommissionCalculationMethod = optionalSelect\(\['percentage', 'flat_dollar'\]\)/);
  assert.match(transactionForm, /commissionCalculationMethod: optionalCommissionCalculationMethod/);
  assert.match(transactionForm, /commissionFlatAmount:/);
  assert.match(transactionForm, /SmartBroker saves that amount as the authoritative gross commission/);
});

test('flat-dollar commission rehydrates and survives authorized transaction saves', () => {
  assert.match(transactionForm, /savedFlatDollarMethod/);
  assert.match(transactionForm, /setCommissionMode\(savedFlatDollarMethod/);
  assert.match(transactionForm, /commissionCalculationMethod === 'flat_dollar'/);
  assert.match(agentRoute, /updates\.commissionCalculationMethod === 'flat_dollar'/);
  assert.match(agentRoute, /updates\.commissionFlatAmount = exactAmount/);
  assert.match(adminTransactionRoute, /effectiveCommissionMethod === 'flat_dollar'/);
  assert.match(adminTransactionRoute, /updates\.commissionFlatAmount = flatAmount/);
  assert.match(adminTransactionRoute, /updates\.gci = flatAmount/);
  assert.match(staffQueueRoute, /allowed\.commissionCalculationMethod === 'flat_dollar'/);
  assert.match(staffQueueRoute, /commissionFlatAmount: merged\.commissionFlatAmount/);
  assert.match(tcRoute, /txSyncUpdate\.commissionCalculationMethod === 'flat_dollar'/);
  assert.match(tcRoute, /commissionFlatAmount: mergedWithMethod\.commissionFlatAmount/);
});

test('intentional percentage changes clear the flat-dollar override path', () => {
  assert.match(agentRoute, /updates\.commissionCalculationMethod === 'percentage'/);
  assert.match(agentRoute, /updates\.commissionFlatAmount = null/);
  assert.match(staffQueueRoute, /allowed\.commissionCalculationMethod === 'percentage'/);
  assert.match(tcRoute, /txSyncUpdate\.commissionCalculationMethod === 'percentage'/);
});

test('Admin Ledger recalculates ordinary flat-dollar snapshots and retains authorized direct corrections', () => {
  assert.match(adminTransactionRoute, /hasCommissionCalculationChange/);
  assert.match(adminTransactionRoute, /resolveTransactionCalculation\(/);
  assert.match(adminTransactionRoute, /mergeOperationalDirectSplit\(existingData \|\| \{\}, updates\)/);
  assert.match(adminTransactionRoute, /hasDirectSplitChange && !isPassThrough/);
  assert.match(transactionForm, /form\.setValue\('commissionFlatAmount', flatAmount/);
  assert.match(transactionForm, /form\.setValue\('gci', flatAmount/);
});
