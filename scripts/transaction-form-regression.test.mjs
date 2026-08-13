import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const formSource = readFileSync(resolve(root, 'src/app/dashboard/transactions/new/page.tsx'), 'utf8');
const agentRouteSource = readFileSync(resolve(root, 'src/app/api/agent/transactions/[txId]/route.ts'), 'utf8');
const adminRouteSource = readFileSync(resolve(root, 'src/app/api/admin/transactions/route.ts'), 'utf8');
const brokerFeeSettingsSource = readFileSync(resolve(root, 'src/app/api/admin/transaction-fee-settings/route.ts'), 'utf8');
const createTransactionSource = readFileSync(resolve(root, 'src/app/api/tc/route.ts'), 'utf8');

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

test('legacy listing fees hydrate into visible editable fee controls and clear canonically', () => {
  assert.match(formSource, /const resolvedLegacyListingFee = Number\(tx\.transactionFee \?\? 0\) \|\| 0/);
  assert.match(formSource, /resolvedLegacyListingFee > 0/);
  assert.match(formSource, /transactionFee: resolvedComplianceFee === 'yes'/);
  assert.match(formSource, /watchedClosingType !== 'referral' && <Section title="Additional Info">/);
  assert.match(formSource, /form\.setValue\('transactionFee', ''\)/);
  assert.match(adminRouteSource, /updates\.transactionFee = 0/);
  assert.match(agentRouteSource, /updates\.transactionFee = 0/);
});

test('legacy finalized commission aliases hydrate the earnings breakdown GCI', () => {
  assert.match(formSource, /const explicitGci = tx\.gci \|\| tx\.splitSnapshot\?\.grossCommission \|\| tx\.splitSnapshot\?\.grossCommissionAmount \|\| tx\.grossCommission \|\| tx\.commission \|\| tx\.commissionAmount \|\| tx\.grossCommissionIncome \|\| ''/);
  assert.match(formSource, /const resolvedAgentDollar = tx\.agentDollar \|\| tx\.splitSnapshot\?\.agentNetCommission \|\| tx\.splitSnapshot\?\.agentDollar \|\| tx\.agentNetCommission \|\| tx\.agentCommission \|\| ''/);
  assert.match(formSource, /gci: resolvedGci/);
  assert.match(formSource, /agentDollar: resolvedAgentDollar/);
});

test('a legacy zero GCI is recalculated from saved commission base and rate before split-dollar inference', () => {
  assert.match(formSource, /const resolvedCommissionBasePrice = tx\.commissionBasePrice \|\| resolvedSalePrice \|\| ''/);
  assert.match(formSource, /const calculatedLegacyGci = !isPassThroughTransaction && Number\(explicitGci\) <= 0 && Number\(resolvedCommissionBasePrice\) > 0 && Number\(resolvedCommissionPercent\) > 0/);
  assert.match(formSource, /resolveGCI\(\{ commissionBasePrice: Number\(resolvedCommissionBasePrice\), commissionPercent: Number\(resolvedCommissionPercent\) \}\)/);
  assert.match(formSource, /const inferredLegacyGci = !isPassThroughTransaction && Number\(explicitGci\) <= 0 && calculatedLegacyGci <= 0/);
  assert.match(formSource, /const resolvedGci = Number\(explicitGci\) > 0 \? explicitGci : \(calculatedLegacyGci \|\| inferredLegacyGci \|\| ''\)/);
});

test('operational staff can override closed-file GCI while agents remain read-only', () => {
  assert.match(formSource, /const isClosedAgentView = editMode && persistedEditStatus === 'closed' && !hasOperationalEditAuthority/);
  assert.match(formSource, /\{hasOperationalEditAuthority && \(/);
  assert.match(formSource, /gciManuallyEdited\.current = true/);
  assert.match(formSource, /if \(gciManuallyEdited\.current\) return/);
  assert.match(formSource, /if \(!hasOperationalEditAuthority\) return/);
  assert.match(adminRouteSource, /'gci'/);
  assert.match(adminRouteSource, /'brokerPct'/);
  assert.match(adminRouteSource, /'agentPct'/);
  assert.match(adminRouteSource, /'brokerGci'/);
  assert.match(adminRouteSource, /'agentDollar'/);
});

test('referrals keep address optional while persisting optional contacts, key dates, and referral fee details', () => {
  assert.match(formSource, /address: z\.string\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
  assert.match(formSource, /data\.closingType === 'referral' \|\| String\(data\.address \|\| ''\)\.trim\(\)\.length >= 5/);
  assert.match(formSource, /outboundReferralEmail: z\.string\(\)\.email\(\)\.optional\(\)\.or\(z\.literal\(''\)\)/);
  assert.match(formSource, /Referral Key Dates/);
  assert.match(formSource, /Expected Gross Commission/);
  assert.match(createTransactionSource, /if \(!address && closingType !== 'referral'\) return jsonError\(400, 'address is required'\)/);
  assert.match(createTransactionSource, /outboundReferralEmail: toStr\(body\.outboundReferralEmail\) \|\| null/);
  assert.match(createTransactionSource, /outboundReferralPhone: toStr\(body\.outboundReferralPhone\) \|\| null/);
  assert.match(agentRouteSource, /'outboundReferralFeePercent', 'outboundReferralFeeDollar'/);
  assert.match(agentRouteSource, /'outboundReferralEmail', 'outboundReferralPhone'/);
  assert.match(adminRouteSource, /'outboundReferralFee', 'outboundReferralFeePercent', 'outboundReferralFeeDollar'/);
});
