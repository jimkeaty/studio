import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const profiles = read('src/app/api/admin/agent-profiles/route.ts');
const ordinaryPicker = read('src/app/api/agent/agents-list/route.ts');
const adminPicker = read('src/app/api/admin/agents/route.ts');
const agentsPage = read('src/components/admin/agents/AgentsList.tsx');
const ledger = read('src/app/dashboard/admin/transactions/page.tsx');
const activeReporting = read('src/app/api/broker/active-agents/route.ts');

test('SBUSA-011 centralizes effective lifecycle classification for archive and active scopes', () => {
  assert.match(profiles, /classifyAgentLifecycle/);
  assert.match(profiles, /scope.*archive/);
  assert.match(profiles, /departedLost/);
  assert.match(activeReporting, /monthEndYmd/);
  assert.match(activeReporting, /currentAsOfDate/);
});

test('ordinary pickers exclude archived profiles while the Transaction Ledger explicitly retains historical lookup', () => {
  assert.match(ordinaryPicker, /isLifecycleActive/);
  assert.match(adminPicker, /includeArchived/);
  assert.match(ledger, /api\/admin\/agents\?includeArchived=true/);
});

test('the main Agents page defaults to active profiles and provides a deliberate archived view with non-destructive archived cards', () => {
  assert.match(agentsPage, /useState<'active' \| 'archive'>\('active'\)/);
  assert.match(agentsPage, /View Departed\/Lost Agents/);
  assert.match(agentsPage, /lifecycleStatus === 'out'/);
  assert.match(agentsPage, /isActive &&/);
});
