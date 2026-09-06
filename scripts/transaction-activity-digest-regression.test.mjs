import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const dispatcher = read('src/lib/notifications/sendNotification.ts');
const activity = read('src/lib/notifications/transactionActivity.ts');
const digestRoute = read('src/app/api/cron/transaction-activity-digest/route.ts');
const staffQueue = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
const tcRoute = read('src/app/api/admin/tc/[id]/route.ts');
const settings = read('src/app/dashboard/settings/notifications/page.tsx');

test('routine Staff and TC checklist changes are retained on the linked canonical transaction, including corrections', () => {
  assert.match(activity, /eventType: 'routine_checklist_changed'/);
  assert.match(activity, /previousCompleted/);
  assert.match(activity, /digestStatus: 'pending'/);
  for (const source of [staffQueue, tcRoute]) {
    assert.match(source, /buildChecklistTransactionActivity/);
    assert.match(source, /previousCompleted !== completed/);
    assert.match(source, /collection\('activityEvents'\)\.doc\(\)/);
  }
});

test('daily digest groups only routine activity, honors preferences, and never marks an email sent without a verified delivery result', () => {
  assert.match(digestRoute, /collectionGroup\('activityEvents'\)\.where\('activityDate', '==', digestDate\)/);
  assert.match(digestRoute, /event\.eventType !== 'routine_checklist_changed'/);
  assert.match(digestRoute, /const byTransaction = new Map/);
  assert.match(digestRoute, /if \(!body\.trim\(\)\)/);
  assert.match(digestRoute, /if \(delivery\.delivered\)/);
  assert.match(digestRoute, /digestStatus: 'pending'/);
  assert.match(dispatcher, /sendDailyTransactionActivityDigest/);
  assert.match(dispatcher, /preference_disabled/);
  assert.match(dispatcher, /email_unconfigured/);
  assert.match(dispatcher, /result\.error/);
});

test('important workflow status events keep their immediate notification path while routine checklist notices are not duplicated', () => {
  assert.match(tcRoute, /if \(body\.status && body\.status !== intake\.status\)/);
  assert.doesNotMatch(tcRoute, /title: 'TC Checklist Updated'/);
  assert.match(settings, /transaction_activity_digest/);
  assert.match(settings, /Daily Routine Activity Digest/);
});

test('digest endpoint requires its scheduled-job secret and protects retries with an explicit processing state', () => {
  assert.match(digestRoute, /x-cron-secret/);
  assert.match(digestRoute, /digestStatus: 'processing'/);
  assert.match(digestRoute, /adminDb\.runTransaction/);
  assert.match(digestRoute, /digestAttempts/);
});
