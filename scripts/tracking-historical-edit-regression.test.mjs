import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const appointments = read('src/app/api/appointments/route.ts');
const appointmentById = read('src/app/api/appointments/[id]/route.ts');
const tracker = read('src/app/dashboard/tracker/page.tsx');

test('agents can create appointment tracking for any historical date', () => {
  assert.doesNotMatch(appointments, /EDIT_WINDOW_DAYS|isDateEditable|edit_window_expired|locked after 45 days/i);
  assert.match(appointments, /Missing required fields: date, contactName, category/);
  assert.match(appointments, /createdByUid: callerUid/);
});

test('agents can correct, move, or delete their own historical appointments while ownership controls remain', () => {
  assert.doesNotMatch(appointmentById, /EDIT_WINDOW_DAYS|isDateEditable|edit_window_expired|locked after 45 days/i);
  assert.match(appointmentById, /buildAgentIdSet\(callerUid\)/);
  assert.match(appointmentById, /You do not have permission to edit this appointment/);
  assert.match(appointmentById, /You do not have permission to delete this appointment/);
  assert.match(appointmentById, /await docRef\.delete\(\)/);
});

test('daily tracker no longer presents a 45-day lock message', () => {
  assert.doesNotMatch(tracker, /edit_window_expired|Edits are locked after 45 days|Edits locked after 45 days/i);
  assert.match(tracker, /You can add or correct tracking for any date\./);
});
