import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/app/dashboard/admin/recruiting/page.tsx');
const route = read('src/app/api/broker/agent-roster-metrics/route.ts');

test('SBUSA-015 limits the new-agent roster tracker to the active 90-day grace cohort', () => {
  assert.match(page, /const gracePeriodAgents = agents/);
  assert.match(page, /\.filter\(\(a: any\) => a\.isGracePeriod === true\)/);
  assert.match(page, /New Agent 90-Day Grace Period/);
  assert.match(page, /Only active agents in their current 90-day grace period appear here/);
  assert.doesNotMatch(page, /New Agent 90-Day \+ First-Year Tracker/);
  assert.doesNotMatch(page, /firstYearTrackerAgents\.map/);
});

test('SBUSA-015 keeps canonical grace milestones and performance data while removing first-year-only presentation', () => {
  assert.match(page, /warn60DayNoPending/);
  assert.match(page, /warn90DayNoClose/);
  assert.match(page, /Grace: Day \{days\} \/ 90/);
  assert.match(route, /isFirstYearAgent/);
  assert.match(route, /trackerPriority/);
  assert.match(route, /isGracePeriod/);
  assert.match(route, /gracePeriodDaysRemaining/);
});

test('SBUSA-015 continues to retain the established performance roster outside the grace-only tracker', () => {
  assert.match(page, /\{\/\* ── Block 2: Active — No Deals Yet/);
  assert.match(page, /const noDealsYetAgents = agents\.filter/);
  assert.match(page, /filterGrace === 'established'/);
});
