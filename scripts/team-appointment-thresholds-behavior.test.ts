import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTeamAppointmentThreshold, TEAM_APPOINTMENT_THRESHOLDS } from '../src/lib/agent-development/teamAppointmentThresholds';

test('team appointment thresholds classify approved monthly boundaries', () => {
  assert.deepEqual(TEAM_APPOINTMENT_THRESHOLDS, { minimum: 100, target: 120 });
  assert.deepEqual(assessTeamAppointmentThreshold(99), { actual: 99, goal: 120, status: 'Below Minimum', pct: 0 });
  assert.deepEqual(assessTeamAppointmentThreshold(100), { actual: 100, goal: 120, status: 'Meets Minimum', pct: 50 });
  assert.deepEqual(assessTeamAppointmentThreshold(119), { actual: 119, goal: 120, status: 'Meets Minimum', pct: 50 });
  assert.deepEqual(assessTeamAppointmentThreshold(120), { actual: 120, goal: 120, status: 'Meets Target', pct: 100 });
});

test('team appointment thresholds never create negative appointment counts', () => {
  assert.deepEqual(assessTeamAppointmentThreshold(-10), { actual: 0, goal: 120, status: 'Below Minimum', pct: 0 });
});
