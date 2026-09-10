import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/active-agents/route.ts', import.meta.url);
const profileFormPath = new URL('../src/components/admin/agents/AgentProfileForm.tsx', import.meta.url);
const profileUpdateRoutePath = new URL('../src/app/api/admin/agent-profiles/[agentId]/route.ts', import.meta.url);
const activeChartPath = new URL('../src/components/dashboard/broker/ActiveAgentsChart.tsx', import.meta.url);
const recruitingMetricsPath = new URL('../src/app/api/broker/recruiting-metrics/route.ts', import.meta.url);

test('active-agent reporting uses effective lifecycle dates instead of the later profile-status timestamp', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /excludeFromActiveCount: boolean/);
  assert.match(route, /classifyAgentLifecycle/);
  assert.match(route, /monthEndYmd/);
  assert.match(route, /currentAsOfDate/);
});

test('only effective departure dates classify agents as Out and count as departures', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /lifecycle\.status !== 'out'/);
  assert.match(route, /lifecycle\.departureDate/);
  assert.match(route, /departureYM\.startsWith/);
});

test('inactive-agent review list and inactive-date capture remain distinct from departure dates', async () => {
  const [route, form, updateRoute] = await Promise.all([
    readFile(routePath, 'utf8'),
    readFile(profileFormPath, 'utf8'),
    readFile(profileUpdateRoutePath, 'utf8'),
  ]);

  assert.match(route, /const inactiveAgents = agentRecords/);
  assert.match(route, /classifyAgentLifecycle\(ar, currentAsOfDate\)\.status === 'inactive'/);
  assert.match(route, /inactiveDate: ar\.inactiveDate/);
  assert.match(form, /Inactive Date/);
  assert.match(form, /this does not count as a departure unless an effective Departure/);
  assert.match(form, /Departure \/ End Date/);
  assert.match(updateRoute, /const inactiveDate = body\.inactiveDate\?\.trim\(\) \|\| null/);
  assert.match(updateRoute, /const status = effectiveDeparture/);
  assert.match(updateRoute, /inactiveDate: normalized\.inactiveDate/);
});

test('qualifying new agents remain in a separate three-month grace roster and named graduation forecast', async () => {
  const [route, chart] = await Promise.all([
    readFile(routePath, 'utf8'),
    readFile(activeChartPath, 'utf8'),
  ]);

  assert.match(route, /const gracePeriodEnabled = a\.gracePeriodEnabled === true \|\| profileStatus === 'grace_period'/);
  assert.match(route, /toYearMonth\(addMonths\(start, 3\)\)/);
  assert.match(route, /if \(ar\.graceEndMonth && ar\.graceEndMonth > ym\) \{/);
  assert.match(route, /inGrace\+\+;/);
  assert.match(route, /const currentGraceAgents = agentRecords/);
  assert.match(route, /currentGraceAgents,/);
  assert.match(route, /agents: graduating\.map/);
  assert.match(chart, /Currently in Grace Period/);
  assert.match(chart, /graduates \{agent\.graceEndMonth\}/);
});

test('Recruiting metrics keeps inactive profiles out of departures and only tracks enabled grace periods', async () => {
  const route = await readFile(recruitingMetricsPath, 'utf8');

  assert.match(route, /const DEPARTURE_STATUSES_RM = new Set\(\['out', 'terminated', 'churned'\]\)/);
  assert.match(route, /if \(DEPARTURE_STATUSES_RM\.has\(profileStatus\) && endDate && endDate\.getFullYear\(\) === year\)/);
  assert.doesNotMatch(route, /No endDate but marked inactive/);
  assert.match(route, /const graceEnabled = a\.gracePeriodEnabled === true \|\| profileStatus === 'grace_period'/);
  assert.match(route, /if \(startDate && graceEnabled && !inactive\)/);
});
