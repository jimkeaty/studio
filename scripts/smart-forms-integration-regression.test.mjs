import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const core = read('src/lib/smartForms/core.ts');
const route = read('src/app/api/smart-forms/transactions/[txId]/route.ts');
const panel = read('src/components/transactions/SmartFormsTransactionPanel.tsx');
const form = read('src/app/dashboard/transactions/new/page.tsx');
const launcher = read('src/app/dashboard/smart-forms/page.tsx');
const registry = read('src/lib/plugins/registry.ts');

test('Smart Forms remains an external signing product rather than a duplicate signing implementation', () => {
  assert.match(core, /SMART_FORMS_URL = 'https:\/\/smartforms-kxlzueqw\.manus\.space'/);
  assert.match(launcher, /Smart Forms keeps its own forms, signature workflow, completed PDFs, and account session/);
  assert.doesNotMatch(core, /signatureCanvas|signDocument|generatePdf/);
});
test('contextual launch records a canonical transaction relationship without passing client data by URL', () => {
  assert.match(route, /body\.action === 'launch'/);
  assert.match(route, /contextShared: false/);
  assert.match(route, /propertyAddress/);
  assert.match(route, /clientName/);
  assert.doesNotMatch(route, /SMART_FORMS_URL\?[^\n]*client/);
  assert.match(panel, /no client data was sent between apps/);
});
test('completed Smart Forms records are securely accessible from the proper canonical transaction', () => {
  assert.match(route, /completed_form_reference/);
  assert.match(route, /SMART_FORMS_SUBCOLLECTION/);
  assert.match(core, /transaction\.agentId/);
  assert.match(core, /coAgent1Id/);
  assert.match(core, /isStaff/);
  assert.match(form, /SmartFormsTransactionPanel/);
});
test('Smart Forms stays under centralized Task 16 app management with a native contextual launcher', () => {
  assert.match(registry, /id: 'smart-forms'/);
  assert.match(registry, /href: '\/dashboard\/smart-forms'/);
  assert.match(registry, /defaultEnabled: false/);
  assert.match(launcher, /Open Smart Forms/);
});
