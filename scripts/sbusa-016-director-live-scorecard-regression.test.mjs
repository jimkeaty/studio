import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/app/dashboard/admin/recruiting/page.tsx');
const route = read('src/app/api/broker/agent-roster-metrics/route.ts');

test('SBUSA-016 orders the Live Scorecard by canonical start date, with missing starts last', () => {
  assert.match(route, /SBUSA-016: newest canonical starts first/);
  assert.match(route, /if \(!a\.startDate\) return 1/);
  assert.match(route, /return b\.startDate\.localeCompare\(a\.startDate\)/);
  assert.match(page, /useState<SortField>\('startDate'\)/);
  assert.match(page, /useState<SortDir>\('desc'\)/);
  assert.match(page, /Missing — correct profile/);
});

test('SBUSA-016 excludes effective Inactive and Out profiles using the shared lifecycle classifier', () => {
  assert.match(route, /import \{ classifyAgentLifecycle \} from '@\/lib\/agents\/lifecycle'/);
  assert.match(route, /candidateAgents\.filter\(agent => classifyAgentLifecycle\(agent, asOfDate\)\.status === 'active'\)/);
});

test('SBUSA-016 reuses agent plan targets for calls, engagements, and appointments-held YTD goals', () => {
  assert.match(route, /dailyCallsTarget = configuredNumber\(plan\.calculatedTargets\?\.calls\?\.daily\)/);
  assert.match(route, /callsGoal: callsTarget/);
  assert.match(route, /callsDelta: callsTarget/);
  assert.match(page, /\{a\.callsActual\} \/ \{a\.callsGoalConfigured/);
  assert.match(page, /\{a\.engagementsActual\} \/ \{a\.engagementsGoalConfigured/);
  assert.match(page, /\{a\.appointmentsHeldActual\} \/ \{a\.appointmentsHeldGoalConfigured/);
});

test('SBUSA-016 labels delta states unambiguously and retains Goal Not Set', () => {
  assert.match(page, /Goal Not Set/);
  assert.match(page, /On Goal/);
  assert.match(page, /Ahead By/);
  assert.match(page, /Behind By/);
});
