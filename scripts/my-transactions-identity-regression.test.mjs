import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const standalonePage = read('src/app/dashboard/my-transactions/page.tsx');
const dashboardLedger = read('src/components/dashboard/AgentTransactionsSection.tsx');
const pipelineRoute = read('src/app/api/agent/pipeline/route.ts');
const legacyListRoute = read('src/app/api/agent/transactions/route.ts');

test('standalone My Transactions uses the same canonical ledger and pipeline as the main dashboard', () => {
  assert.match(standalonePage, /AgentTransactionsSection/);
  assert.match(standalonePage, /viewAs=\{isImpersonating \? impersonatedAgent\?\.uid : undefined\}/);
  assert.match(standalonePage, /!impersonationReady/);
  assert.match(dashboardLedger, /\/api\/agent\/pipeline/);
  assert.match(pipelineRoute, /collection\('transactions'\)/);
});

test('canonical identity resolution supports three independent direct-agent linking paths', () => {
  // The identity set supports direct Firebase UID records, profile slug/agentId
  // records, and users/{uid}.agentId mappings; profile email is a fourth fallback.
  assert.match(pipelineRoute, /const ids = new Set<string>\(\[uid\]\)/);
  assert.match(pipelineRoute, /collection\('agentProfiles'\)\.doc\(uid\)/);
  assert.match(pipelineRoute, /where\('agentId', '==', uid\)/);
  assert.match(pipelineRoute, /collection\('users'\)\.doc\(uid\)/);
  assert.match(pipelineRoute, /where\('email', '==', email\)/);
  assert.match(legacyListRoute, /resolveAgentIds/);
});

test('Admin View as Agent replaces the caller identity before canonical transaction queries', () => {
  assert.match(pipelineRoute, /const uid = \(viewAs && callerIsAdmin\) \? viewAs : decoded\.uid/);
  assert.match(pipelineRoute, /resolveEmail = \(viewAs && callerIsAdmin\) \? undefined : decoded\.email/);
  assert.match(pipelineRoute, /const agentIds = await resolveQueryIds\(uid, resolveEmail\)/);
  assert.match(pipelineRoute, /const viewAs = searchParams\.get\('viewAs'\)/);
});

test('the shared ledger retains Active, Pending, Closed history, and year/status/address filters', () => {
  assert.match(pipelineRoute, /activeTransactions/);
  assert.match(pipelineRoute, /pendingTransactions/);
  assert.match(pipelineRoute, /allClosedTransactions/);
  assert.match(dashboardLedger, /yearFilter/);
  assert.match(dashboardLedger, /statusFilter/);
  assert.match(dashboardLedger, /addressSearch/);
});
