import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredPlanNumber,
  resolveAnnualIncomeGoal,
  resolveYtdActivityGoal,
} from '../src/lib/agents/planGoalResolution';

test('annual income goal uses the canonical field and supports legacy yearlyIncome plans', () => {
  assert.equal(resolveAnnualIncomeGoal({ annualIncomeGoal: 120000, yearlyIncome: 90000 }), 120000);
  assert.equal(resolveAnnualIncomeGoal({ yearlyIncome: 90000 }), 90000);
  assert.equal(resolveAnnualIncomeGoal({}), null);
});

test('an explicit zero plan goal remains configured and does not fall through to a legacy value', () => {
  assert.equal(resolveAnnualIncomeGoal({ annualIncomeGoal: 0, yearlyIncome: 90000 }), 0);
  assert.equal(configuredPlanNumber(0), 0);
  assert.equal(configuredPlanNumber(''), null);
});

test('activity goals prefer a stable yearly target through the KPI clock', () => {
  assert.equal(resolveYtdActivityGoal({ yearly: 250, daily: 1.5 }, 50, 250), 50);
  assert.equal(resolveYtdActivityGoal({ yearly: 0, daily: 1.5 }, 50, 250), 0);
});

test('older daily-only activity targets remain supported and missing targets remain unset', () => {
  assert.equal(resolveYtdActivityGoal({ daily: 1.5 }, 50, 250), 75);
  assert.equal(resolveYtdActivityGoal({}, 50, 250), null);
});
