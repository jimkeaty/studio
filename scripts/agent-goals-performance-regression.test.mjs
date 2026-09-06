import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const rosterPath = new URL('../src/app/api/broker/agent-roster-metrics/route.ts', import.meta.url);
const planRoutePath = new URL('../src/app/api/plan/route.ts', import.meta.url);
const recruitingPagePath = new URL('../src/app/dashboard/admin/recruiting/page.tsx', import.meta.url);

test('agent roster uses the canonical per-profile business-plan document path and preserves legacy identifiers as fallbacks', async () => {
  const [roster, planRoute] = await Promise.all([readFile(rosterPath, 'utf8'), readFile(planRoutePath, 'utf8')]);
  assert.match(planRoute, /dashboards\/\{year\}\/agent\/\{profileDocId\}\/plans\/plan/);
  assert.match(roster, /planByAgent\.get\(agent\.id\) \|\| planByAgent\.get\(uid\)/);
  assert.match(roster, /if \(planData\.userId\) planByAgent\.set/);
  assert.match(roster, /if \(planData\.agentId\) planByAgent\.set/);
});

test('missing goals are represented as N/A and never promoted to an A grade', async () => {
  const roster = await readFile(rosterPath, 'utf8');
  assert.match(roster, /function configuredNumber\(value: unknown\): number \| null/);
  assert.match(roster, /if \(target === null\) return null/);
  assert.match(roster, /if \(perf === null\) return 'N\/A'/);
  assert.match(roster, /engagementsGrade: engPerf === null \? 'N\/A'/);
  assert.match(roster, /incomeGrade: incPerf === null \? 'N\/A'/);
  assert.match(roster, /incomePipelineGrade: pipePerf === null \? 'N\/A'/);
});

test('an explicitly saved numeric zero remains configured and distinct from Goal Not Set', async () => {
  const roster = await readFile(rosterPath, 'utf8');
  assert.match(roster, /if \(target === 0\) return 100/);
  assert.match(roster, /engagementsGoalConfigured: engTarget !== null/);
  assert.match(roster, /appointmentsHeldGoalConfigured: apptHeldTarget !== null/);
  assert.match(roster, /incomeGoalConfigured: expectedYTDIncome !== null/);
});

test('Recruiting roster displays Goal Not Set and an N/A grade instead of losing missing-goal context', async () => {
  const page = await readFile(recruitingPagePath, 'utf8');
  assert.match(page, /'N\/A': 'bg-slate-100/);
  assert.match(page, /Goal Not Set/);
  assert.match(page, /\['A', 'B', 'C', 'D', 'F', 'N\/A'\]/);
  assert.match(page, /N\/A \{summary\.gradeDistribution\['N\/A'\]/);
});
