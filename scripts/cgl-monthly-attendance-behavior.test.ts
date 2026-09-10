import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCglMonthlyAttendance } from '../src/lib/attendance/cglMonthlyAttendance';

const profile = {
  agentId: 'cgl-1',
  name: 'CGL Agent',
  status: 'active',
  teamGroup: 'cgl',
  primaryTeamId: 'cgl-team',
  startDate: '2026-01-01',
};

function metric(result: ReturnType<typeof calculateCglMonthlyAttendance>, type: 'training' | 'huddle' | 'role_play_ids') {
  const value = result.metrics.find(item => item.type === type);
  assert.ok(value, `expected ${type} metric`);
  return value;
}

test('CGL attendance excludes opportunities before team entry and deduplicates agent-recorded attendance', () => {
  const result = calculateCglMonthlyAttendance({
    month: '2026-09',
    asOfDate: '2026-09-10',
    profiles: [profile],
    memberships: [{ agentId: 'cgl-1', teamId: 'cgl-team', effectiveStart: '2026-09-08', effectiveEnd: null, activeFlag: true }],
    records: [
      { agentId: 'cgl-1', type: 'huddle', date: '2026-09-03' },
      { agentId: 'cgl-1', type: 'huddle', date: '2026-09-08' },
      { agentId: 'cgl-1', type: 'huddle', date: '2026-09-08' },
      { agentId: 'cgl-1', type: 'training', date: '2026-09-08' },
      { agentId: 'cgl-1', type: 'role_play_ids', date: '2026-09-09' },
    ],
  });

  const huddle = metric(result, 'huddle');
  assert.equal(huddle.denominator, 2);
  assert.equal(huddle.numerator, 1);
  assert.equal(huddle.percentage, 50);
  assert.equal(metric(result, 'training').numerator, 1);
  assert.equal(metric(result, 'role_play_ids').numerator, 1);
});

test('CGL attendance excludes opportunities after effective inactive or team-end dates', () => {
  const inactiveResult = calculateCglMonthlyAttendance({
    month: '2026-09',
    asOfDate: '2026-09-30',
    profiles: [{ ...profile, status: 'inactive', inactiveDate: '2026-09-10' }],
    memberships: [{ agentId: 'cgl-1', teamId: 'cgl-team', effectiveStart: '2026-09-01', effectiveEnd: null, activeFlag: true }],
    records: [{ agentId: 'cgl-1', type: 'huddle', date: '2026-09-10' }, { agentId: 'cgl-1', type: 'huddle', date: '2026-09-15' }],
  });
  assert.equal(metric(inactiveResult, 'huddle').denominator, 4);
  assert.equal(metric(inactiveResult, 'huddle').numerator, 1);

  const endedMembershipResult = calculateCglMonthlyAttendance({
    month: '2026-09',
    asOfDate: '2026-09-30',
    profiles: [profile],
    memberships: [{ agentId: 'cgl-1', teamId: 'cgl-team', effectiveStart: '2026-09-01', effectiveEnd: '2026-09-09', activeFlag: false }],
    records: [{ agentId: 'cgl-1', type: 'role_play_ids', date: '2026-09-09' }, { agentId: 'cgl-1', type: 'role_play_ids', date: '2026-09-16' }],
  });
  assert.equal(metric(endedMembershipResult, 'role_play_ids').denominator, 2);
  assert.equal(metric(endedMembershipResult, 'role_play_ids').numerator, 1);
});

test('CGL attendance treats missing effective dates as data-quality exclusions and does not invent thresholds', () => {
  const result = calculateCglMonthlyAttendance({
    month: '2026-09',
    asOfDate: '2026-09-10',
    profiles: [profile, { ...profile, agentId: 'non-cgl', teamGroup: 'sgl', primaryTeamId: 'sgl-team' }],
    memberships: [],
    records: [{ agentId: 'cgl-1', type: 'huddle', date: '2026-09-08' }],
  });

  assert.deepEqual(result.excludedAgents, [{ agentId: 'cgl-1', reason: 'missing_cgl_membership_effective_start' }]);
  for (const value of result.metrics) {
    assert.equal(value.denominator, 0);
    assert.equal(value.percentage, null);
    assert.equal(value.status, 'no_data');
  }
});
