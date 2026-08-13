import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const formSource = readFileSync(resolve(root, 'src/app/dashboard/transactions/new/page.tsx'), 'utf8');
const agentRouteSource = readFileSync(resolve(root, 'src/app/api/agent/transactions/[txId]/route.ts'), 'utf8');
const adminRouteSource = readFileSync(resolve(root, 'src/app/api/admin/transactions/route.ts'), 'utf8');
const brokerFeeSettingsSource = readFileSync(resolve(root, 'src/app/api/admin/transaction-fee-settings/route.ts'), 'utf8');

test('new buyer transactions default to the editable $395 compliance fee', () => {
  assert.match(formSource, /txComplianceFee: initialClosingType === 'buyer' \? 'yes' : ''/);
  assert.match(formSource, /txComplianceFeeAmount: initialClosingType === 'buyer' \? 395 : ''/);
  assert.match(formSource, /if \(editMode \|\| watchedClosingType !== 'buyer'\) return/);
  assert.match(formSource, /form\.setValue\('txComplianceFeeAmount', 395 as any\)/);
});

test('reopened shared transaction forms hydrate and submit their document list', () => {
  assert.match(formSource, /const hydratedDocs = \(Array\.isArray\(tx\.documents\) \? tx\.documents : \[\]\)/);
  assert.match(formSource, /setUploadedDocs\(Array\.from\(new Map\(hydratedDocs\.map/);
  assert.match(formSource, /documents: uploadedDocs,\s*\/\/ The hydrated document list is authoritative[\s\S]*?_replaceDocuments: true/);
  assert.match(agentRouteSource, /When _replaceDocuments=true \(delete\/archive\), use the provided array as-is/);
  assert.match(adminRouteSource, /'documents'/);
});

test('listing lifecycle dates remain visible and hydrate after a listing becomes Pending', () => {
  assert.match(formSource, /listingDate: tx\.listingDate \|\| tx\.listDate \|\| ''/);
  assert.match(formSource, /listingExpirationDate: tx\.listingExpirationDate \|\| tx\.expirationDate \|\| tx\.listingExpiration \|\| ''/);
  assert.match(formSource, /const isListingSideTransaction = watchedClosingType === 'listing' \|\| watchedClosingType === 'dual'/);
  assert.match(formSource, /\{isListingSideTransaction && \(/);
});

test('an explicit No clears a transaction fee and cannot be re-enabled by stale fee values', () => {
  assert.match(formSource, /const feeExplicitlyDisabled = \['no', 'false', 'off', '0'\]\.includes\(rawComplianceFee\)/);
  assert.match(formSource, /if \(value === 'no'\) \{[\s\S]*form\.setValue\('txComplianceFeeAmount', ''\)/);
  assert.match(adminRouteSource, /updates\.txComplianceFee = 'no';[\s\S]*updates\.txComplianceFeeAmount = 0/);
  assert.match(agentRouteSource, /updates\.txComplianceFee = 'no';[\s\S]*updates\.txComplianceFeeAmount = 0/);
});

test('broker configuration exposes separate buyer and listing defaults', () => {
  assert.match(brokerFeeSettingsSource, /const FALLBACKS = \{ buyerDefault: 395, listingDefault: 150 \}/);
  assert.match(formSource, /watchedClosingType === 'listing' \|\| watchedClosingType === 'dual'/);
  assert.match(formSource, /defaults\.listingDefault/);
  assert.match(formSource, /defaults\.buyerDefault/);
});
