import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dadRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const dadCard = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);

test('SBUSA-006 scores valid call nights by monthly count and preserves sub-threshold events for review', async () => {
  const route = await readFile(dadRoute, 'utf8');
  assert.match(route, /validCallNightsThisMonth/);
  assert.match(route, /shortCallNightsThisMonth/);
  assert.match(route, /durationHours, 0\) >= 3/);
  assert.match(route, /durationHours, 0\) < 3/);
  assert.match(route, /Meets Minimum/);
  assert.match(route, /Meets Target/);
  assert.match(route, /Call Night requires hours/);
  assert.match(route, /durationHours,/);
});

test('SBUSA-006 removes Call Night Hours from Director scoring and settings but retains duration history flags', async () => {
  const [route, card] = await Promise.all([readFile(dadRoute, 'utf8'), readFile(dadCard, 'utf8')]);
  assert.doesNotMatch(route, /makeMetric\('call_night_hours'/);
  assert.doesNotMatch(card, /Call Night Hours \/ Month/);
  assert.match(card, /Short event \(under 180 minutes\)/);
  assert.match(card, /Valid call night/);
  assert.match(card, /callNightHours/);
});
