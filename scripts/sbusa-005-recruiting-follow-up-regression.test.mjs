import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dadRoute = new URL('../src/app/api/broker/dad-report-card/route.ts', import.meta.url);
const dadCard = new URL('../src/components/dashboard/broker/DirectorDevelopmentReportCard.tsx', import.meta.url);
const pipelineActivityRoute = new URL('../src/app/api/broker/recruiting-pipeline/activity/route.ts', import.meta.url);

test('SBUSA-005 derives recruiting prospect follow-ups from the canonical pipeline history rather than new-agent activities', async () => {
  const [dad, pipeline] = await Promise.all([readFile(dadRoute, 'utf8'), readFile(pipelineActivityRoute, 'utf8')]);
  assert.match(dad, /collection\('recruitingPipelineActivity'\)/);
  assert.match(dad, /\['call', 'email', 'text', 'meeting'\]/);
  assert.match(dad, /recruitingFollowUpsFor/);
  assert.match(dad, /new_agent_follow_up/);
  assert.match(pipeline, /collection\('recruitingPipelineActivity'\)/);
  assert.match(pipeline, /lastContactedAt/);
  assert.doesNotMatch(dad, /candidate\.status/);
});

test('SBUSA-005 keeps welcome and onboarding activity distinct while exposing configurable prospect follow-up goals', async () => {
  const [dad, card] = await Promise.all([readFile(dadRoute, 'utf8'), readFile(dadCard, 'utf8')]);
  for (const goal of ['recruitingFollowUpsDaily', 'recruitingFollowUpsWeekly', 'recruitingFollowUpsMonthly']) {
    assert.match(dad, new RegExp(`${goal}: 0`));
    assert.match(dad, new RegExp(`monthlyGoals\\.${goal}`));
    assert.match(card, new RegExp(goal));
  }
  assert.match(dad, /New-Agent Onboarding Follow-Ups — This Month/);
  assert.match(dad, /New Agent Welcome Calls/);
  assert.match(card, /New-Agent Onboarding Follow-Up/);
  assert.match(card, /New Agent Welcome Call/);
});
