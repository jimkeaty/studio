import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dadRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const dadCard = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);

test('SBUSA-007 uses the centralized approved threshold assessment for monthly team appointments', async () => {
  const route = await readFile(dadRoute, 'utf8');
  assert.match(route, /assessTeamAppointmentThreshold/);
  assert.match(route, /currentMonthActivityTotal\('team_appointments'\)/);
  assert.match(route, /team_appointments_monthly/);
  assert.match(route, /TEAM_APPOINTMENT_THRESHOLDS\.minimum/);
  assert.match(route, /TEAM_APPOINTMENT_THRESHOLDS\.target/);
  assert.doesNotMatch(route, /makeMetric\('team_appointments'/);
});

test('SBUSA-007 removes the editable team-appointment target without removing appointment activity logging', async () => {
  const [route, card] = await Promise.all([readFile(dadRoute, 'utf8'), readFile(dadCard, 'utf8')]);
  assert.match(route, /'team_appointments'/);
  assert.doesNotMatch(card, /Team Appointments \/ Month/);
  assert.match(card, /team_appointments: 'Team Appointments'/);
});
