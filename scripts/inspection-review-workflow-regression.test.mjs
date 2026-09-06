import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const agentRoute = readFileSync(new URL('src/app/api/agent/transactions/[txId]/inspection-review/route.ts', root), 'utf8');
const clientRoute = readFileSync(new URL('src/app/api/inspection-client-review/[token]/route.ts', root), 'utf8');
const panel = readFileSync(new URL('src/components/transactions/InspectionReviewPanel.tsx', root), 'utf8');
const form = readFileSync(new URL('src/app/dashboard/transactions/new/page.tsx', root), 'utf8');

test('Task 6 retains the required documented-finding categories and client decision choices', () => {
  for (const category of ['major_concerns', 'safety', 'structural', 'roof', 'hvac', 'plumbing', 'electrical', 'cosmetic_minor', 'maintenance', 'further_evaluation']) assert.match(agentRoute, new RegExp(`'${category}'`));
  for (const choice of ['concern', 'request_repair', 'request_credit_allowance', 'accept_as_is', 'needs_discussion', 'not_concerned']) assert.match(agentRoute, new RegExp(`'${choice}'`));
});

test('SmartBroker retains canonical transaction review records and a separately audited client share token', () => {
  assert.match(agentRoute, /transaction\.inspectionReview/);
  assert.match(agentRoute, /inspectionClientReviews/);
  assert.match(agentRoute, /processingHistory/);
  assert.match(clientRoute, /clientSelectionsReceivedAt/);
  assert.match(clientRoute, /inspectionReview: next/);
});

test('agents can review and negotiate findings while the external Smart Inspector app remains the analysis launcher', () => {
  assert.match(panel, /https:\/\/smartinspct-8sbkppda\.manus\.space/);
  assert.match(panel, /Open Smart Inspector/);
  assert.match(panel, /update_negotiation/);
  assert.match(panel, /Create client review link/);
  assert.match(form, /<InspectionReviewPanel transactionId=\{editTxId\}/);
});

test('client review guidance does not present AI as inspector, contractor, or legal advice', () => {
  assert.match(panel, /does not replace the original report, inspector judgment, contractor evaluation, or legal advice/i);
  assert.match(clientRoute, /does not replace the original inspection report, the inspector’s professional judgment, legal advice, or contractor evaluation/i);
});
