import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const attendanceRoute = new URL('../src/app/api/broker/cgl-attendance/route.ts', import.meta.url);
const attendancePanel = new URL('../src/components/dashboard/broker/AttendanceManagementPanel.tsx', import.meta.url);
const directorRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);

test('SBUSA-004 serves CGL attendance from canonical profile, membership, and attendance collections', async () => {
  const route = await readFile(attendanceRoute, 'utf8');
  assert.match(route, /calculateCglMonthlyAttendance/);
  assert.match(route, /collection\('agentProfiles'\)/);
  assert.match(route, /collection\('teamMemberships'\)/);
  assert.match(route, /collection\('agentAttendance'\)/);
  assert.match(route, /centralParts\(\)\.date/);
});

test('SBUSA-004 displays numerator, denominator, percentage, and No Data without invented thresholds', async () => {
  const panel = await readFile(attendancePanel, 'utf8');
  assert.match(panel, /Monthly CGL Attendance/);
  assert.match(panel, /Threshold not configured/);
  assert.match(panel, /No Data/);
  assert.match(panel, /eligible opportunities/);
  assert.match(panel, /cgl-attendance/);
  assert.doesNotMatch(panel, /Credit this session to Ethan’s Director scorecard/);
});

test('SBUSA-004 does not reintroduce routine attendance metrics into Director scoring', async () => {
  const director = await readFile(directorRoute, 'utf8');
  for (const excludedMetric of ['training_participants', 'huddle_attendance', 'role_play_attendance', 'sales_meeting_attendance']) {
    assert.doesNotMatch(director, new RegExp(`makeMetric\\('${excludedMetric}'`));
  }
});
