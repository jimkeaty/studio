import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const route = read('src/app/api/broker/dad-report-card/route.ts');
const component = read('src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx');
const recruitingPage = read('src/app/dashboard/admin/recruiting/page.tsx');

test('SBUSA-012 keeps Director metric taxonomy in the canonical scorecard payload', () => {
  assert.match(route, /DIRECTOR_METRIC_PRESENTATION/);
  for (const key of [
    'weekly_new_agent_one_on_ones',
    'valid_call_nights_monthly',
    'buyer_seller_workshops',
    'team_appointments_monthly',
    'recruiting_workshops',
    'ypn_events',
    'qualifying_events',
    'new_agent_welcome_calls',
    'recruiting_follow_ups_daily',
    'recruiting_follow_ups_weekly',
    'recruiting_follow_ups_monthly',
  ]) assert.match(route, new RegExp(`${key}: \\{ section:`));
  assert.match(route, /buyer_seller_workshops: \{ section: 'agent_development'/);
  assert.match(route, /new_agent_welcome_calls: \{ section: 'recruiting_activity'/);
  assert.match(route, /recruiting_follow_ups_monthly: \{ section: 'recruiting_activity'/);
});

test('SBUSA-012 preserves one metric and one score contribution per record', () => {
  assert.match(route, /\.\.\.directorMetricPresentation\(metric\.key\)/);
  assert.match(route, /const scoredMetrics = enrichedMetrics\.filter/);
  assert.match(route, /scoredMetrics\.reduce/);
  assert.doesNotMatch(route, /agentDevelopmentMetrics.*scoredMetrics|recruitingActivityMetrics.*scoredMetrics/);
});

test('Director cards use the established shared information and goal-card presentation in two responsive Production sections', () => {
  assert.match(component, /MetricInformationButton/);
  assert.match(component, /data-testid="director-agent-development"/);
  assert.match(component, /data-testid="director-recruiting-activity"/);
  assert.match(component, /Agent Development/);
  assert.match(component, /Recruiting Activity/);
  assert.match(component, /groupedMetrics\.agentDevelopment\.map\(metric => <GoalCard/);
  assert.match(component, /groupedMetrics\.recruitingActivity\.map\(metric => <GoalCard/);
  assert.doesNotMatch(component, /scorecard\.metrics\.slice\(0, 4\)/);
  assert.doesNotMatch(component, /scorecard\.metrics\.slice\(4\)/);
});

test('the single Director component renders after the established unified Production report cards', () => {
  assert.equal((recruitingPage.match(/<DirectorDevelopmentReportCard year=\{year\} \/>/g) || []).length, 1);
  assert.ok(recruitingPage.indexOf('<UnifiedRecruitingReportCard year={year} />') < recruitingPage.indexOf('<DirectorDevelopmentReportCard year={year} />'));
});
