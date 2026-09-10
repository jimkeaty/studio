import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('src/app/dashboard/page.tsx');
const goals = read('src/components/dashboard/agent/TodaysGoals.tsx');
const activityRange = read('src/app/api/daily-activity/range/route.ts');
const dailyLog = read('src/components/dashboard/log-activities/DailyLogPanel.tsx');

test('SBUSA-017 places Today’s Goals ahead of secondary dashboard analytics', () => {
  assert.match(dashboard, /import \{ TodaysGoals \} from '@\/components\/dashboard\/agent\/TodaysGoals'/);
  assert.match(dashboard, /SBUSA-017: immediate canonical goals precede secondary dashboard analytics/);
  assert.match(dashboard, /<TodaysGoals \/>/);
  assert.doesNotMatch(dashboard, /<TodaysFocusCard dashboard=\{dashboard\} \/>/);
});

test('SBUSA-017 uses Central business-day and week boundaries with canonical saved plan and activity APIs', () => {
  assert.match(goals, /centralParts\(\)/);
  assert.match(goals, /mondayFor\(business\.date\)/);
  assert.match(goals, /\/api\/plan\?year=/);
  assert.match(goals, /\/api\/daily-activity\/range\?start=/);
  assert.match(activityRange, /appointmentsHeldCount/);
  assert.match(activityRange, /pipelineStatus === 'held'/);
});

test('SBUSA-017 renders exactly the four approved cards with canonical goals and nonnegative remaining or ahead states', () => {
  assert.match(goals, /Calls to Make Today/);
  assert.match(goals, /Engagements for Today/);
  assert.match(goals, /Appointments to Set Today/);
  assert.match(goals, /Appointments Held This Week/);
  assert.match(goals, /Math\.max\(0, goal - completed\)/);
  assert.match(goals, /Ahead By/);
  assert.match(goals, /Goal Met/);
  assert.match(goals, /Goal Not Set/);
});

test('SBUSA-017 refreshes safely after canonical daily activity is saved', () => {
  assert.match(goals, /window\.addEventListener\('daily-activity-saved', refresh\)/);
  assert.match(dailyLog, /window\.dispatchEvent\(new Event\('daily-activity-saved'\)\)/);
});
