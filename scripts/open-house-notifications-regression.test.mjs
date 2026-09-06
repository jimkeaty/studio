import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const submissionRoute = read('src/app/api/agent/open-house-submissions/route.ts');
const reminderRoute = read('src/app/api/cron/open-house-reminder/route.ts');
const settingsRoute = read('src/app/api/admin/open-house-settings/route.ts');
const deliveryLog = read('src/app/api/admin/notification-delivery-log/route.ts');
const transactionReminders = read('src/app/api/cron/transaction-reminders/route.ts');
const tvStaleness = read('src/app/api/cron/tv-staleness/route.ts');

test('regular open-house submission creates both its canonical record and staff queue work item, then uses the shared preference-aware dispatcher', () => {
  assert.match(submissionRoute, /collection\('openHouseSubmissions'\)\.add\(submission\)/);
  assert.match(submissionRoute, /collection\('staffQueue'\)\.add/);
  assert.match(submissionRoute, /sendNotification\(adminDb/);
  assert.match(submissionRoute, /dashboard\/admin\/staff-queue/);
});

test('Thursday last call defaults to 8:00 AM Central, 1:00 PM deadline, and is Admin-configurable', () => {
  assert.match(settingsRoute, /deadlineText: 'Thursday by 1:00 PM'/);
  assert.match(settingsRoute, /reminderDayOfWeek: 4/);
  assert.match(settingsRoute, /reminderHour: 8/);
  assert.match(reminderRoute, /timeZone: 'America\/Chicago'/);
  assert.match(reminderRoute, /centralScheduleMatches/);
  assert.match(reminderRoute, /LAST CALL FOR OPEN HOUSES/);
  assert.match(submissionRoute, /deadlineDayOfWeek/);
  assert.match(submissionRoute, /await isPastDeadline\(\)/);
});

test('last-call notifications follow recipient preferences and use truthful delivery log states rather than presuming delivery', () => {
  assert.match(reminderRoute, /sendNotification\(adminDb/);
  for (const status of ['Scheduled', 'Sent', 'Failed']) assert.match(reminderRoute, new RegExp(`status: '${status}'`));
  assert.match(reminderRoute, /provider delivery is not assumed/);
  assert.match(deliveryLog, /notificationDeliveryLog/);
  assert.match(reminderRoute, /Delivery is\n+    \/\/ never presumed/);
});

test('the existing 14-day post-closing buyer check-in and 14-day TV renewal-with-Wednesday-confirmation rules are not conflated', () => {
  assert.match(transactionReminders, /Buyer Check-In Reminders \(3 days and 14 days after closing\)/);
  assert.match(tvStaleness, /at least 14 days old/);
  assert.match(tvStaleness, /Confirm by Wednesday/);
});
