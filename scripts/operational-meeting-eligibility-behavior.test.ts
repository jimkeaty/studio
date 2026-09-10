import assert from 'node:assert/strict';
import test from 'node:test';
import { centralParts } from '../src/lib/attendance/rules';
import { calculateOperationalMeetingEligibility } from '../src/lib/agent-development/operationalMeetingEligibility';

const asOfDate = '2026-09-10';

function agent(agentId: string, startDate: string, teamGroup = 'cgl', status = 'active') {
  return { agentId, name: agentId, startDate, teamGroup, status };
}

test('SBUSA-002 assigns every operationally eligible agent to exactly one locked-precedence category', () => {
  const result = calculateOperationalMeetingEligibility({
    asOfDate,
    agents: [
      agent('day-90', '2026-06-13'),
      agent('day-91-no-activity', '2026-06-12'),
      agent('day-91-with-closed', '2026-06-12', 'charles_ditch_team'),
      agent('under-year-with-pending', '2026-01-01'),
      agent('established-no-activity', '2025-01-01'),
      agent('sgl-new', '2026-06-13', 'sgl'),
      agent('inactive-cgl', '2026-01-01', 'cgl', 'inactive'),
    ],
    transactions: [
      { id: 'closed-at-inclusive-boundary', agentId: 'day-91-with-closed', status: 'closed', closedDate: '2026-07-13' },
      { id: 'pending-in-window', agentId: 'under-year-with-pending', status: 'pending', contractDate: '2026-09-01' },
    ],
  });

  assert.equal(result.sixtyDayWindowStart, '2026-07-13');
  assert.deepEqual(result.operational.new_agent_90_day.map(item => item.agentId), ['day-90']);
  assert.deepEqual(result.operational.no_production_or_pending_last_60_days.map(item => item.agentId).sort(), ['day-91-no-activity', 'established-no-activity']);
  assert.deepEqual(result.operational.under_one_year.map(item => item.agentId).sort(), ['day-91-with-closed', 'under-year-with-pending']);

  const assigned = Object.values(result.operational).flat().map(item => item.agentId);
  assert.equal(new Set(assigned).size, assigned.length, 'operational agents cannot be assigned to duplicate categories');
  assert.ok(result.quarterlyStrategyAgents.some(item => item.agentId === 'sgl-new'), 'all active agents remain eligible for quarterly strategy');
  assert.ok(!assigned.includes('sgl-new'), 'SGL is excluded from operational categories');
  assert.ok(!result.quarterlyStrategyAgents.some(item => item.agentId === 'inactive-cgl'), 'inactive agents are excluded from all meeting eligibility');
});

test('SBUSA-002 recognizes co-agent activity and ignores closed or pending activity outside the inclusive 60-day window', () => {
  const result = calculateOperationalMeetingEligibility({
    asOfDate,
    agents: [agent('co-agent', '2026-01-01'), agent('outside-window', '2026-01-01')],
    transactions: [
      { id: 'coagent-pending', agentId: 'another-agent', coAgent: { agentId: 'co-agent' }, status: 'under_contract', underContractDate: '2026-08-01' },
      { id: 'too-old', agentId: 'outside-window', status: 'closed', closedDate: '2026-07-12' },
    ],
  });

  assert.deepEqual(result.operational.under_one_year.map(item => item.agentId), ['co-agent']);
  assert.deepEqual(result.operational.no_production_or_pending_last_60_days.map(item => item.agentId), ['outside-window']);
});

test('SBUSA-002 uses the Central business date at the UTC midnight boundary', () => {
  const centralBusinessDate = centralParts(new Date('2026-09-11T04:30:00.000Z')).date;
  assert.equal(centralBusinessDate, '2026-09-10');

  const result = calculateOperationalMeetingEligibility({
    asOfDate: centralBusinessDate,
    agents: [agent('central-boundary-agent', '2026-01-01')],
    transactions: [{ id: 'inclusive-central-window', agentId: 'central-boundary-agent', status: 'closed', closedDate: '2026-07-13' }],
  });

  assert.equal(result.sixtyDayWindowStart, '2026-07-13');
  assert.deepEqual(result.operational.under_one_year.map(item => item.agentId), ['central-boundary-agent']);
});
