import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const resolverSource = readFileSync(resolve(root, 'src/lib/transactions/resolveTransactionSide.ts'), 'utf8');
const formSource = readFileSync(resolve(root, 'src/app/dashboard/transactions/new/page.tsx'), 'utf8');
const agentListSource = readFileSync(resolve(root, 'src/app/api/agent/transactions/route.ts'), 'utf8');
const agentDetailSource = readFileSync(resolve(root, 'src/app/api/agent/transactions/[txId]/route.ts'), 'utf8');
const adminListSource = readFileSync(resolve(root, 'src/app/api/admin/transactions/route.ts'), 'utf8');
const teamPipelineSource = readFileSync(resolve(root, 'src/app/api/agent/team-pipeline/route.ts'), 'utf8');
const staffQueueSource = readFileSync(resolve(root, 'src/app/api/admin/staff-queue/route.ts'), 'utf8');

test('legacy transaction-side resolver accepts only trusted representation-side aliases', () => {
  assert.match(resolverSource, /buyer_transaction: 'buyer'/);
  assert.match(resolverSource, /new_listing: 'listing'/);
  assert.match(resolverSource, /dual_agency: 'dual'/);
  assert.match(resolverSource, /outbound_referral: 'referral'/);
  assert.match(resolverSource, /const closingType = canonicalSide\(record\.closingType\)/);
  assert.match(resolverSource, /const side = canonicalSide\(record\.side\)/);
  assert.match(resolverSource, /const legacyType = canonicalSide\(record\.type\)/);
  assert.match(resolverSource, /source: 'unresolved', requiresManualReview: true/);
  assert.match(resolverSource, /does not treat deal categories such as lease, rental, land/);
});

test('legacy Buyer and Listing sides are inferred for display without automatic persistence', () => {
  assert.match(resolverSource, /source: 'legacy_type', requiresManualReview: false, preventsAutomaticPersistence: true/);
  assert.match(formSource, /const sideResolution = resolveTransactionSide\(tx\)/);
  assert.match(formSource, /legacySideResolutionRef\.current = \{[\s\S]*preventsAutomaticPersistence: sideResolution\.preventsAutomaticPersistence/);
  assert.match(formSource, /if \(legacySideResolutionRef\.current\.preventsAutomaticPersistence\) \{[\s\S]*delete valuesForSave\.closingType/);
});

test('unresolved lease and no-signal records require a human side selection instead of silently becoming listings', () => {
  assert.match(formSource, /setPdfStep\(sideResolution\.requiresManualReview \? 'type' : 'form'\)/);
  assert.match(formSource, /legacySideNeedsReview[\s\S]*does not clearly identify the representation side/);
  assert.match(formSource, /A record with no safe side must choose one before editing/);
  assert.match(formSource, /editMode \? 'loading'/);
});

test('manual type selection releases the no-write safeguard only after a human decision', () => {
  assert.match(formSource, /const chooseTransactionType = \(side: TransactionSide\) => \{/);
  assert.match(formSource, /legacySideResolutionRef\.current = \{ preventsAutomaticPersistence: false \}/);
  assert.match(formSource, /chooseTransactionType\('buyer'\)/);
  assert.match(formSource, /chooseTransactionType\('listing'\)/);
  assert.match(formSource, /chooseTransactionType\('dual'\)/);
  assert.match(formSource, /chooseTransactionType\('referral'\)/);
});

test('agent, admin, team, staff, and detail views normalize display data without writes', () => {
  for (const source of [agentListSource, agentDetailSource, adminListSource, teamPipelineSource, staffQueueSource]) {
    assert.match(source, /resolveTransactionSide/);
  }
  assert.match(agentListSource, /transactionSideResolution: sideResolution/);
  assert.match(agentDetailSource, /displayClosingType: resolveTransactionSide\(data\)\.side/);
  assert.match(adminListSource, /canonical transaction document is not changed by viewing the ledger/);
  assert.match(teamPipelineSource, /transactionSideResolution: sideResolution/);
  assert.match(staffQueueSource, /resolveTransactionSide\(tx\)\.side/);
});
