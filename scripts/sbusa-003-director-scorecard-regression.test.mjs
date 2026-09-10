import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const reportRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const reportCard = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);
const attendanceRoute = new URL('../src/app/api/agent/attendance/route.ts', import.meta.url);

test('SBUSA-003 removes routine meeting and director-entered attendance metrics from Director scoring and display', async () => {
  const [route, card] = await Promise.all([readFile(reportRoute, 'utf8'), readFile(reportCard, 'utf8')]);
  for (const excludedMetric of [
    "makeMetric('sales_meetings'",
    "makeMetric('huddles_led'",
    "makeMetric('role_play_ids_led'",
    "makeMetric('training_sessions'",
    "makeMetric('training_participants'",
    "makeMetric('huddle_attendance'",
    "makeMetric('role_play_attendance'",
    "makeMetric('sales_meeting_attendance'",
  ]) assert.doesNotMatch(route, new RegExp(excludedMetric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const removedGoalLabel of ['Sales Meetings / Month', 'Team Huddles / Month', 'Role Play / New Agent IDS / Month', 'Training Sessions Led / Month']) {
    assert.doesNotMatch(card, new RegExp(removedGoalLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('SBUSA-003 preserves underlying routine-event history and agent attendance storage', async () => {
  const [route, card, attendance] = await Promise.all([readFile(reportRoute, 'utf8'), readFile(reportCard, 'utf8'), readFile(attendanceRoute, 'utf8')]);
  for (const activityType of ['sales_meeting', 'huddle', 'role_play_ids', 'training_session']) {
    assert.match(route, new RegExp(`'${activityType}'`));
    assert.match(card, new RegExp(`${activityType}:`));
  }
  assert.match(route, /activitySnap\.docs/);
  assert.match(card, /Activity Log/);
  assert.match(attendance, /collection\('agentAttendance'\)/);
});
