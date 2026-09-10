import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const activeAgentsRoute = new URL('../src/app/api/broker/active-agents/route.ts', import.meta.url);
const agentSelectorRoute = new URL('../src/app/api/admin/agents/route.ts', import.meta.url);
const dadReportCardRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const oneOnOnesRoute = new URL('../src/app/api/agent/one-on-ones/route.ts', import.meta.url);
const attendanceRoute = new URL('../src/app/api/agent/attendance/route.ts', import.meta.url);
const attendanceRules = new URL('../src/lib/attendance/rules.ts', import.meta.url);
const recruitingPipelineRoute = new URL('../src/app/api/broker/recruiting-pipeline/route.ts', import.meta.url);
const recruitingMetricsRoute = new URL('../src/app/api/broker/recruiting-metrics/route.ts', import.meta.url);
const recruitingPage = new URL('../src/app/dashboard/admin/recruiting/page.tsx', import.meta.url);

test('SBUSA-001 baseline identifies the canonical lifecycle, activity, attendance, and recruiting collections', async () => {
  const [activeAgents, dad, attendance, pipeline, recruiting] = await Promise.all([
    readFile(activeAgentsRoute, 'utf8'),
    readFile(dadReportCardRoute, 'utf8'),
    readFile(attendanceRoute, 'utf8'),
    readFile(recruitingPipelineRoute, 'utf8'),
    readFile(recruitingMetricsRoute, 'utf8'),
  ]);

  assert.match(activeAgents, /collection\('agentProfiles'\)/);
  assert.match(dad, /collection\('oneOnOnes'\)/);
  assert.match(dad, /collection\('transactions'\)/);
  assert.match(dad, /collection\('directorDevelopmentActivities'\)/);
  assert.match(attendance, /collection\('agentAttendance'\)/);
  assert.match(pipeline, /collection\('recruitingPipeline'\)/);
  assert.match(pipeline, /collection\('recruitingPipelineActivity'\)/);
  assert.match(recruiting, /collection\('recruitingTracking'\)/);
  assert.match(recruiting, /collection\('recruitingPlans'\)/);
});

test('SBUSA-001 baseline preserves Central-time attendance schedules and secure floor-time controls before QR expansion', async () => {
  const [rules, attendance] = await Promise.all([
    readFile(attendanceRules, 'utf8'),
    readFile(attendanceRoute, 'utf8'),
  ]);

  assert.match(rules, /CENTRAL_TIME_ZONE = 'America\/Chicago'/);
  assert.match(rules, /weeklyShiftCount: 2/);
  assert.match(rules, /weeklyShiftMinutes: 180/);
  assert.match(rules, /monthlyWeekendShiftCount: 1/);
  assert.match(rules, /monthlyWeekendShiftMinutes: 240/);
  assert.match(attendance, /action === 'floorCheckIn'/);
  assert.match(attendance, /action === 'floorCheckOut'/);
  assert.match(attendance, /locationVerified: true/);
});

test('SBUSA-001 baseline captures the current sources that later queue tasks must centralize or revise', async () => {
  const [selector, dad, pipeline, page] = await Promise.all([
    readFile(agentSelectorRoute, 'utf8'),
    readFile(dadReportCardRoute, 'utf8'),
    readFile(recruitingPipelineRoute, 'utf8'),
    readFile(recruitingPage, 'utf8'),
  ]);

  // SBUSA-011: ordinary selectors currently append inactive and out profiles.
  assert.match(selector, /where\('status', 'in', \['inactive', 'out'\]\)/);
  // SBUSA-002: the report card now uses the canonical rolling 60-day eligibility service.
  assert.match(dad, /calculateOperationalMeetingEligibility/);
  assert.match(dad, /No Production or Pending in Last 60 Days — This Month/);
  assert.match(dad, /sixtyDayWindowStart/);
  // SBUSA-008: Started now requires canonical actual-start or active-profile verification.
  assert.match(pipeline, /verifyRecruitingStart/);
  assert.match(pipeline, /actualStartDate/);
  assert.doesNotMatch(pipeline, /autoStartedAt/);
  // SBUSA-009: recruiting-plan values currently have two write surfaces.
  assert.match(page, /fetch\('\/api\/admin\/broker-business-plan'/);
  assert.match(page, /fetch\('\/api\/broker\/recruiting-metrics'/);
});

test('SBUSA-001 baseline records one-on-one types and completion fields needed for a future canonical eligibility service', async () => {
  const oneOnOnes = await readFile(oneOnOnesRoute, 'utf8');

  assert.match(oneOnOnes, /weekly_90day/);
  assert.match(oneOnOnes, /monthly_cgl/);
  assert.match(oneOnOnes, /quarterly_strategy/);
  assert.match(oneOnOnes, /completedAt/);
  assert.match(oneOnOnes, /completionNotes/);
});
