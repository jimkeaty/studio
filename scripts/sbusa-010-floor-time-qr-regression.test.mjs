import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/agent/attendance/route.ts', import.meta.url);
const managerPath = new URL('../src/components/dashboard/broker/AttendanceManagementPanel.tsx', import.meta.url);
const agentPath = new URL('../src/components/dashboard/agent/AttendanceAndFloorTimePanel.tsx', import.meta.url);
const rulesPath = new URL('../src/lib/attendance/rules.ts', import.meta.url);
const notificationsPath = new URL('../src/lib/notifications/sendNotification.ts', import.meta.url);

test('SBUSA-010 validates enabled current Floor Time QR scans before creating a presence record', async () => {
  const [route, rules] = await Promise.all([readFile(routePath, 'utf8'), readFile(rulesPath, 'utf8')]);
  assert.match(route, /action === 'checkInFloorTimeQr'/);
  assert.match(route, /An active agent profile is required for Floor Time QR check-in/);
  assert.match(route, /This Floor Time QR code is disabled, expired, or invalid/);
  assert.match(route, /hasRecentFloorTimeQrCheckIn/);
  assert.match(route, /businessTimeZone: CENTRAL_TIME_ZONE/);
  assert.match(route, /source: 'floor_time_qr'/);
  assert.match(route, /qrPresenceOnly: true/);
  assert.match(rules, /FLOOR_TIME_QR_DEDUPLICATION_MINUTES = 15/);
});

test('SBUSA-010 keeps attendance durable and audits notification delivery separately without hard-coded recipient numbers or lead routing', async () => {
  const [route, notifications] = await Promise.all([readFile(routePath, 'utf8'), readFile(notificationsPath, 'utf8')]);
  assert.match(route, /attendanceNotificationAttempts/);
  assert.match(route, /recipientRole: 'director_of_agent_development'/);
  assert.match(route, /sendTransactionalSmsWithResult/);
  assert.match(route, /notificationState: 'failed'/);
  assert.match(route, /Floor Time check-in: \$\{self\.agentName\}/);
  assert.doesNotMatch(route, /activateLead|leadRouting|assignLead/);
  assert.match(notifications, /export async function sendTransactionalSmsWithResult/);
  assert.match(notifications, /providerMessageId/);
  assert.doesNotMatch(route, /\+1\d{10}/);
});

test('SBUSA-010 provides authorized QR management and preserves existing event QR controls and secure shifts', async () => {
  const [route, manager, agent] = await Promise.all([readFile(routePath, 'utf8'), readFile(managerPath, 'utf8'), readFile(agentPath, 'utf8')]);
  assert.match(route, /action === 'configureFloorTimeQr'/);
  assert.match(route, /Administrator access is required/);
  assert.match(route, /rotateCode === true/);
  assert.match(manager, /Floor Time QR Code/);
  assert.match(manager, /Configure Floor Time QR Code/);
  assert.match(manager, /Director SMS recipient/);
  assert.match(manager, /Team Huddle/);
  assert.match(manager, /Optional Training/);
  assert.match(manager, /Optional Sales Meeting/);
  assert.match(manager, /Role Play \/ New Agent IDS/);
  assert.match(agent, /checkInFloorTimeQr/);
  assert.match(agent, /floorCheckIn/);
  assert.match(agent, /floorCheckOut/);
  assert.match(agent, /floorTimeQrEnabled/);
});
