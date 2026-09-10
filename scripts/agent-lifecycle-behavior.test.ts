import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAgentLifecycle, lifecyclePopulation } from '../src/lib/agents/lifecycle';

test('inactive and departure dates apply on their actual effective date, not status-entry time', () => {
  assert.equal(classifyAgentLifecycle({ status: 'active', inactiveDate: '2026-06-15' }, '2026-06-14').status, 'active');
  assert.equal(classifyAgentLifecycle({ status: 'active', inactiveDate: '2026-06-15' }, '2026-06-15').status, 'inactive');
  assert.equal(classifyAgentLifecycle({ status: 'inactive', inactiveDate: '2026-06-16' }, '2026-06-15').status, 'active');
  assert.equal(classifyAgentLifecycle({ status: 'active', endDate: '2026-07-01' }, '2026-07-01').status, 'out');
  assert.equal(classifyAgentLifecycle({ status: 'active', endDate: '2026-07-02' }, '2026-07-01').status, 'active');
});

test('Out takes precedence once effective while historical dates remain Inactive before departure', () => {
  const profile = { status: 'active', inactiveDate: '2026-06-15', endDate: '2026-07-01' };
  assert.equal(classifyAgentLifecycle(profile, '2026-06-30').status, 'inactive');
  assert.equal(classifyAgentLifecycle(profile, '2026-07-01').status, 'out');
});

test('conflicting legacy departure dates are surfaced and conservatively archived', () => {
  const result = classifyAgentLifecycle({ status: 'active', endDate: '2026-07-03', departureDate: '2026-07-01' }, '2026-07-02');
  assert.equal(result.status, 'out');
  assert.equal(result.departureDate, '2026-07-01');
  assert.equal(result.dateConflict, true);
  assert.match(result.conflictMessage || '', /correct/i);
});

test('legacy archived statuses without a date remain archived for correction but are never misreported as Out', () => {
  const result = classifyAgentLifecycle({ status: 'out' }, '2026-07-01');
  assert.equal(result.status, 'inactive');
  assert.equal(result.missingEffectiveDate, true);
});

test('Active, Inactive, and Out remain mutually exclusive and reconcile to total population', () => {
  const totals = lifecyclePopulation([
    { status: 'active' },
    { status: 'active', inactiveDate: '2026-06-30' },
    { status: 'active', endDate: '2026-06-30' },
    { status: 'inactive', inactiveDate: '2026-07-02' },
  ], '2026-07-01');
  assert.deepEqual(totals, { active: 2, inactive: 1, out: 1 });
  assert.equal(totals.active + totals.inactive + totals.out, 4);
});
