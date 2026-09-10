import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dadRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const dadCard = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);
const informationControl = new URL('../src/components/dashboard/broker/MetricInformationButton.tsx', import.meta.url);

test('SBUSA-009 centralizes effective-start-adjusted pacing and preserves the full activity history separately', async () => {
  const route = await readFile(dadRoute, 'utf8');
  assert.match(route, /calculateStartDatePacing/);
  assert.match(route, /resolveReportCardEffectiveStart/);
  assert.match(route, /const pacedActivities = activities\.filter/);
  assert.match(route, /date && date >= effectiveStartDate/);
  assert.match(route, /const adjustedStart = start > effectiveStartDate \? start : effectiveStartDate/);
  assert.match(route, /const activityTotal = \(type: string, field = 'count'\) => pacedActivities/);
  assert.match(route, /within\(isoDate\(activity\.createdAt\), effectiveStartDate, reportEnd\)/);
  assert.match(route, /effectiveStartHistory/);
  assert.match(route, /isValidReportCardEffectiveStart/);
  assert.match(route, /changedByUid: caller\.uid/);
});

test('SBUSA-009 returns reconciled metric information and a reusable keyboard- and touch-accessible control', async () => {
  const [route, card, control] = await Promise.all([readFile(dadRoute, 'utf8'), readFile(dadCard, 'utf8'), readFile(informationControl, 'utf8')]);
  assert.match(route, /information: \{/);
  assert.match(route, /metricName: metric\.label/);
  assert.match(route, /catchUpNeeded: pacing\.catchUpNeeded/);
  assert.match(route, /aheadBy: pacing\.aheadBy/);
  assert.match(card, /MetricInformationButton/);
  assert.match(card, /Report-Card Effective Start Date/);
  assert.match(control, /aria-label=\{`More information about \$\{information\.metricName\}`\}/);
  assert.match(control, /DialogTrigger asChild/);
  assert.match(control, /Goal Not Configured/);
});
