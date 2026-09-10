import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStartDatePacing, isValidReportCardEffectiveStart, resolveReportCardEffectiveStart } from '../src/lib/report-cards/startDatePacing';

test('report-card pacing starts on the later of January 1 and the configured start date', () => {
  assert.equal(resolveReportCardEffectiveStart(2026, '2025-11-01', '2026-09-10'), '2026-01-01');
  assert.equal(resolveReportCardEffectiveStart(2026, '2026-07-15', '2026-09-10'), '2026-07-15');
});

test('monthly cumulative goals prorate precisely from a midyear start and retain nonnegative deltas', () => {
  const behind = calculateStartDatePacing({
    year: 2026, configuredStartDate: '2026-07-01', asOfDate: '2026-09-30', actual: 1, nativeGoal: 1, nativeCadence: 'monthly', cumulative: true,
  });
  assert.equal(behind.effectiveStartDate, '2026-07-01');
  assert.ok((behind.ytdGoal || 0) > 3 && (behind.ytdGoal || 0) < 3.1);
  assert.ok((behind.catchUpNeeded || 0) > 2);
  assert.equal(behind.aheadBy, 0);
  assert.ok(Math.abs((behind.weeklyPace || 0) - 12 / 52) < 0.000001);

  const ahead = calculateStartDatePacing({
    year: 2026, configuredStartDate: '2026-07-01', asOfDate: '2026-09-30', actual: 5, nativeGoal: 1, nativeCadence: 'monthly', cumulative: true,
  });
  assert.equal(ahead.catchUpNeeded, 0);
  assert.ok((ahead.aheadBy || 0) > 1.9);
});

test('pacing handles leap years, activity on the effective boundary, and missing goals without false deltas', () => {
  const leap = calculateStartDatePacing({
    year: 2024, configuredStartDate: '2024-02-29', asOfDate: '2024-02-29', actual: 1, nativeGoal: 12, nativeCadence: 'annual', cumulative: true,
  });
  assert.equal(leap.ytdActual, 1);
  assert.ok((leap.ytdGoal || 0) > 0);
  const missing = calculateStartDatePacing({
    year: 2026, configuredStartDate: '2026-01-01', asOfDate: '2026-09-10', actual: 50, nativeGoal: 0, nativeCadence: 'monthly', cumulative: true,
  });
  assert.equal(missing.nativeGoal, null);
  assert.equal(missing.ytdGoal, null);
  assert.equal(missing.catchUpNeeded, null);
  assert.equal(missing.aheadBy, null);
});

test('effective start dates reject future and malformed values while allowing a prior-year date to resolve at January 1', () => {
  assert.equal(isValidReportCardEffectiveStart('2026-09-10', 2026, '2026-09-10'), true);
  assert.equal(isValidReportCardEffectiveStart('2026-09-11', 2026, '2026-09-10'), false);
  assert.equal(isValidReportCardEffectiveStart('2026-02-30', 2026, '2026-09-10'), false);
  assert.equal(isValidReportCardEffectiveStart('2025-11-01', 2026, '2026-09-10'), true);
});
