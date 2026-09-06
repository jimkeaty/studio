import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/active-agents/route.ts', import.meta.url);
const profileFormPath = new URL('../src/components/admin/agents/AgentProfileForm.tsx', import.meta.url);
const profileUpdateRoutePath = new URL('../src/app/api/admin/agent-profiles/[agentId]/route.ts', import.meta.url);

test('all inactive profiles are excluded from active-agent reporting regardless of end date', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /excludeFromActiveCount: boolean/);
  assert.match(route, /const excludeFromActiveCount = INACTIVE_STATUSES\.has\(profileStatus\)/);
  assert.match(route, /if \(ar\.excludeFromActiveCount\) continue;/);
  assert.match(route, /if \(ar\.excludeFromActiveCount\) return false;/);
  assert.match(route, /even when the person remains licensed with the brokerage/);
});

test('only confirmed departure statuses with an end date count as departures', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /const DEPARTURE_STATUSES = new Set\(\['out', 'terminated', 'churned'\]\)/);
  assert.match(route, /if \(!DEPARTURE_STATUSES\.has\(ar\.status\)\) return false/);
  assert.match(route, /if \(endDate\) \{/);
  assert.match(route, /endMonth = toYearMonth\(addMonths\(ed, 1\)\)/);
  assert.match(route, /hasExplicitEndDate = true/);
});

test('inactive-agent review list and inactive-date capture remain distinct from departure dates', async () => {
  const [route, form, updateRoute] = await Promise.all([
    readFile(routePath, 'utf8'),
    readFile(profileFormPath, 'utf8'),
    readFile(profileUpdateRoutePath, 'utf8'),
  ]);

  assert.match(route, /const inactiveAgents = agentRecords/);
  assert.match(route, /\.filter\(ar => ar\.status === 'inactive'\)/);
  assert.match(route, /inactiveDate: ar\.inactiveDate/);
  assert.match(form, /Inactive Date/);
  assert.match(form, /This does not count as a departure/);
  assert.match(form, /Departure \/ End Date/);
  assert.match(updateRoute, /inactiveDate: body\.inactiveDate\?\.trim\(\) \|\| null/);
  assert.match(updateRoute, /inactiveDate: normalized\.inactiveDate/);
});
