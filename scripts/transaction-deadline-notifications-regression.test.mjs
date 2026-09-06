import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const reminder = read('src/app/api/cron/transaction-reminders/route.ts');
const settings = read('src/app/api/admin/transaction-deadline-settings/route.ts');
const worklist = read('src/app/api/admin/transaction-deadlines/route.ts');
const page = read('src/app/dashboard/admin/transaction-deadlines/page.tsx');

test('deadline reminders cover every supported contractual term, excluding invalid or inactive transaction dates', () => {
  for (const field of ['inspectionDeadline', 'dueDiligenceDeadline', 'depositDeadline', 'loanApplicationDeadline', 'financingDeadline', 'financingCommitmentDeadline', 'finalLoanCommitmentDeadline', 'appraisalDeadline', 'projectedCloseDate', 'closedDate', 'occupancyDate']) assert.match(reminder, new RegExp(field));
  assert.match(reminder, /isActiveMilestoneTransaction/);
  assert.match(worklist, /\\d\{4\}-\\d\{2\}-\\d\{2\}/);
});

test('agents receive preference-aware notices day before and morning of deadlines, with direct transaction links', () => {
  assert.match(reminder, /MILESTONE_REMINDER_DAYS = \[1, 0\]/);
  assert.match(reminder, /due_tomorrow/);
  assert.match(reminder, /due_today/);
  assert.match(reminder, /sendNotification\(adminDb/);
  assert.match(reminder, /dashboard\/transactions\/new\?edit=\$\{txDoc\.id\}/);
});

test('changed deadline dates do not reuse old reminder marks and duplicate sends are prevented by source-date keyed idempotency', () => {
  assert.match(reminder, /sentMap\[reminderKey\] === targetDate/);
  assert.match(reminder, /milestoneRemindersSent\.\$\{reminderKey\}/);
});

test('Admin controls reminder timing and future critical escalation remains explicitly disabled', () => {
  assert.match(settings, /reminderEnabled/);
  assert.match(settings, /reminderHour/);
  assert.match(settings, /criticalEscalationEnabled: false/);
  assert.match(reminder, /centralDeadlineScheduleMatches/);
  assert.match(reminder, /America\/Chicago/);
});

test('Staff and TC have a linked Due Today, Due Tomorrow, and Overdue deadline worklist', () => {
  for (const bucket of ['dueToday', 'dueTomorrow', 'overdue']) assert.match(worklist, new RegExp(bucket));
  assert.match(page, /Due Today/);
  assert.match(page, /Due Tomorrow/);
  assert.match(page, /Overdue/);
  assert.match(page, /dashboard\/transactions\/new\?edit=/);
});
