import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidActualStartDate, verifyRecruitingStart } from '../src/lib/recruiting/startVerification';

const asOfDate = '2026-09-10';

test('a passed scheduled date remains Scheduled Start with a verification warning', () => {
  const result = verifyRecruitingStart({
    candidate: { status: 'scheduled_start', name: 'Dylan Poncho', expectedStartDate: '2026-09-01' },
    profiles: [],
    asOfDate,
  });
  assert.equal(result.status, 'scheduled_start');
  assert.equal(result.reason, 'scheduled_start_requires_verification');
  assert.match(result.warning || '', /Confirm an actual start date/);
});

test('an actual start date or one unambiguous active profile verifies Started', () => {
  assert.equal(verifyRecruitingStart({
    candidate: { status: 'scheduled_start', name: 'Dylan Poncho', expectedStartDate: '2026-09-01', actualStartDate: '2026-09-05' },
    profiles: [],
    asOfDate,
  }).reason, 'actual_start_date');
  assert.equal(verifyRecruitingStart({
    candidate: { status: 'scheduled_start', name: 'Dylan Poncho', expectedStartDate: '2026-09-01' },
    profiles: [{ id: 'dylan', displayName: 'Dylan Poncho', status: 'active' }],
    asOfDate,
  }).reason, 'active_agent_profile');
});

test('ambiguous names do not verify a start and historical Started records remain visible', () => {
  const ambiguous = verifyRecruitingStart({
    candidate: { status: 'scheduled_start', name: 'Dylan Poncho', expectedStartDate: '2026-09-01' },
    profiles: [{ id: 'one', displayName: 'Dylan Poncho', status: 'active' }, { id: 'two', displayName: 'Dylan Poncho', status: 'active' }],
    asOfDate,
  });
  assert.equal(ambiguous.status, 'scheduled_start');
  assert.equal(verifyRecruitingStart({ candidate: { status: 'started', name: 'Historic Recruit' }, profiles: [], asOfDate }).reason, 'legacy_started');
});

test('actual start dates cannot be future-dated', () => {
  assert.equal(isValidActualStartDate('2026-09-10', asOfDate), true);
  assert.equal(isValidActualStartDate('2026-09-11', asOfDate), false);
});
