import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const core = read('src/lib/smartProperty/core.ts');
const route = read('src/app/api/smart-property/transactions/[txId]/route.ts');
const panel = read('src/components/transactions/SmartPropertyTransactionPanel.tsx');
const form = read('src/app/dashboard/transactions/new/page.tsx');
const launcher = read('src/app/dashboard/smart-property/page.tsx');
const registry = read('src/lib/plugins/registry.ts');

test('Smart Property remains the independent investment calculation source rather than a Smart Broker calculator rebuild', () => {
  assert.match(core, /SMART_PROPERTY_URL = 'https:\/\/smartflip-rxtcvbcs\.manus\.space'/);
  for (const capability of ['ROI', 'cash flow', 'cap rate', 'cash-on-cash return', 'flip[- ]profit', 'rehab', 'financing', 'holding costs']) assert.match(launcher, new RegExp(capability, 'i'));
  assert.doesNotMatch(core, /calculateCapRate|calculateCashFlow|calculateFlipProfit/);
});
test('contextual ROI launch preserves canonical property/client/transaction information without leaking it in a URL', () => {
  assert.match(route, /body\.action === 'launch'/);
  assert.match(route, /contextShared: false/);
  for (const field of ['property', 'purchasePrice', 'rent', 'taxes', 'insurance', 'hoa', 'propertyType', 'clientName', 'agentId']) assert.match(core, new RegExp(field));
  assert.doesNotMatch(route, /SMART_PROPERTY_URL\?[^\n]*purchase/);
  assert.match(panel, /no record data was sent between apps/);
});
test('authorized transaction participants can store saved scenario references without a second property record', () => {
  assert.match(route, /scenario_reference/);
  assert.match(route, /SMART_PROPERTY_SUBCOLLECTION/);
  assert.match(core, /transaction\.agentId/);
  assert.match(core, /coAgent1Id/);
  assert.match(core, /isStaff/);
  assert.match(form, /SmartPropertyTransactionPanel/);
});
test('Smart Property is controlled through Task 16 rollout state and retains its standalone launcher', () => {
  assert.match(registry, /id: 'smart-property-roi'/);
  assert.match(registry, /href: '\/dashboard\/smart-property'/);
  assert.match(registry, /defaultEnabled: false/);
  assert.match(launcher, /Open Smart Property/);
});
