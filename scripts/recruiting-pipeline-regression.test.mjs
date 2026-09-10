import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/recruiting-pipeline/route.ts', import.meta.url);
const panelPath = new URL('../src/components/dashboard/broker/RecruitingPipelinePanel.tsx', import.meta.url);

test('a passed Scheduled Start requires verified actual-start or active-profile evidence before Started', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /verifyRecruitingStart/);
  assert.match(route, /actualStartDate/);
  assert.match(route, /collection\('agentProfiles'\)/);
  assert.doesNotMatch(route, /function isPastScheduledStart/);
  assert.doesNotMatch(route, /autoStartedAt/);
  assert.doesNotMatch(route, /Scheduled Start → Started after the scheduled start date passed/);
});

test('Started recruits remain visible in the recruiting board until a later archive rule', async () => {
  const panel = await readFile(panelPath, 'utf8');

  assert.match(panel, /value: 'started',\s+label: 'Started'/);
  assert.match(panel, /const BOARD_STATUSES = STATUSES\.filter\(s => s\.value !== 'declined'\)/);
  assert.match(panel, /\{BOARD_STATUSES\.map\(stage =>/);
  assert.match(panel, /\{STATUSES\.map\(s => <SelectItem/);
});
