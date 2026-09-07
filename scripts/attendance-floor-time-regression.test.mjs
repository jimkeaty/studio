import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const rulesPath = new URL('../src/lib/attendance/rules.ts', import.meta.url);
const routePath = new URL('../src/app/api/agent/attendance/route.ts', import.meta.url);
const agentPanelPath = new URL('../src/components/dashboard/agent/AttendanceAndFloorTimePanel.tsx', import.meta.url);
const managerPanelPath = new URL('../src/components/dashboard/broker/AttendanceManagementPanel.tsx', import.meta.url);
const attendancePagePath = new URL('../src/app/dashboard/attendance/page.tsx', import.meta.url);
const navigationPath = new URL('../src/components/dashboard/sidebar-nav.tsx', import.meta.url);

test('attendance rules preserve the required huddle, role-play, and floor-time standards', async () => {
  const rules = await readFile(rulesPath, 'utf8');
  assert.match(rules, /huddle:[\s\S]*days: \['Tue', 'Thu'\]/);
  assert.match(rules, /startLabel: '8:30 AM'/);
  assert.match(rules, /role_play_ids:[\s\S]*days: \['Wed'\]/);
  assert.match(rules, /startLabel: '10:00 AM'/);
  assert.match(rules, /weeklyShiftCount: 2/);
  assert.match(rules, /weeklyShiftMinutes: 180/);
  assert.match(rules, /monthlyWeekendShiftCount: 1/);
  assert.match(rules, /monthlyWeekendShiftMinutes: 240/);
});

test('floor-time check-in and check-out require a signed-in active agent and verified office location', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /adminAuth\.verifyIdToken/);
  assert.match(route, /resolveAgent/);
  assert.match(route, /action === 'floorCheckIn'/);
  assert.match(route, /action === 'floorCheckOut'/);
  assert.match(route, /Office location access is required for floor-time check-in/);
  assert.match(route, /Office location access is required for floor-time check-out/);
  assert.match(route, /distanceMeters\(office, body\.location\)/);
  assert.match(route, /You already have an open floor-time shift/);
  assert.match(route, /durationMinutes = Math\.max/);
  assert.match(route, /locationVerified: true/);
  assert.match(route, /checkOutLocationVerified: true/);
});

test('QR attendance is restricted to scheduled event windows and cannot be duplicated for an agent', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /action === 'checkInEvent'/);
  assert.match(route, /scheduledEventWindow\(eventType, now\)/);
  assert.match(route, /check-in is only available during its scheduled check-in window/);
  assert.match(route, /already checked in/);
  assert.match(route, /source: 'qr'/);
});

test('View as Agent loads the selected active agent attendance history but never permits proxy check-ins', async () => {
  const [route, agentPanel] = await Promise.all([readFile(routePath, 'utf8'), readFile(agentPanelPath, 'utf8')]);
  assert.match(route, /requestedAgentId/);
  assert.match(route, /auth\.isAdmin && requestedAgentId \? await resolveAgent\(requestedAgentId\) : self/);
  assert.match(route, /where\('firebaseUid', '==', identity\)/);
  assert.match(route, /where\('agentId', '==', identity\)/);
  assert.match(route, /linkedUser\.data\(\)\?\.agentId/);
  assert.match(route, /You can only view your own attendance/);
  assert.match(agentPanel, /useEffectiveUser/);
  assert.match(agentPanel, /\?agentId=\$\{encodeURIComponent\(effectiveUid\)\}/);
  assert.match(agentPanel, /impersonationReady/);
  assert.match(agentPanel, /Attendance is view-only/);
  assert.match(agentPanel, /disabled=\{submitting !== null \|\| viewOnly\}/);
  assert.match(agentPanel, /disabled=\{submitting !== null \|\| !data\.officeLocationConfigured \|\| viewOnly\}/);
});

test('administrators can set and verify the official office address without relying on their current device location', async () => {
  const [route, managerPanel] = await Promise.all([readFile(routePath, 'utf8'), readFile(managerPanelPath, 'utf8')]);
  assert.match(route, /address: string \| null/);
  assert.match(route, /const address = String\(body\.address \|\| ''\)/);
  assert.match(route, /officeLocation,\n        updatedAt/);
  assert.match(route, /officeLocationConfigured: Boolean\(officeLocation\)/);
  assert.match(route, /officeLocation,\n        records/);
  assert.match(managerPanel, /Office Address/);
  assert.match(managerPanel, /Find Address/);
  assert.match(managerPanel, /nominatim\.openstreetmap\.org\/search/);
  assert.match(managerPanel, /Use This Device Location/);
  assert.match(managerPanel, /Review on Map/);
  assert.match(managerPanel, /Save Official Office Location/);
  assert.match(managerPanel, /Edit Office Location/);
});

test('agent and staff interfaces retain QR, secure floor-time, and training-roster controls', async () => {
  const [agentPanel, managerPanel, attendancePage, navigation] = await Promise.all([
    readFile(agentPanelPath, 'utf8'),
    readFile(managerPanelPath, 'utf8'),
    readFile(attendancePagePath, 'utf8'),
    readFile(navigationPath, 'utf8'),
  ]);
  assert.match(agentPanel, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(agentPanel, /Check In to Floor Time/);
  assert.match(agentPanel, /Check Out of Floor Time/);
  assert.match(agentPanel, /Record Attendance/);
  assert.match(managerPanel, /QRCodeSVG/);
  assert.match(managerPanel, /recordTrainingSession/);
  assert.match(managerPanel, /Recent Agent Attendance & Floor Time/);
  assert.match(managerPanel, /scope=all/);
  assert.match(managerPanel, /Set Office Location/);
  assert.match(attendancePage, /useIsAdminLike/);
  assert.match(attendancePage, /AttendanceManagementPanel/);
  assert.match(attendancePage, /!loading && isAdmin/);
  assert.match(navigation, /Attendance & Floor Time/);
});

test('Director reporting retains attendance, training, and new-agent follow-up tracking', async () => {
  const route = await readFile(new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url), 'utf8');
  assert.match(route, /'sales_meeting'/);
  assert.match(route, /'huddle'/);
  assert.match(route, /'role_play_ids'/);
  assert.match(route, /'training_session'/);
  assert.match(route, /'new_agent_follow_up'/);
  assert.match(route, /Huddle Attendance — This Month/);
  assert.match(route, /Role Play \/ IDS Attendance — This Month/);
  assert.match(route, /Training Attendance — This Month/);
});
