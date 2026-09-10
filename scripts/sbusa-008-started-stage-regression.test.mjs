import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const pipelineRoute = new URL('../src/app/api/broker/recruiting-pipeline/route.ts', import.meta.url);
const pipelinePanel = new URL('../src/components/dashboard/broker/RecruitingPipelinePanel.tsx', import.meta.url);

test('SBUSA-008 uses verified starts instead of auto-promoting a passed scheduled date', async () => {
  const route = await readFile(pipelineRoute, 'utf8');
  assert.match(route, /verifyRecruitingStart/);
  assert.match(route, /collection\('agentProfiles'\)/);
  assert.match(route, /actualStartDate/);
  assert.doesNotMatch(route, /autoStartedAt/);
  assert.doesNotMatch(route, /Scheduled Start → Started after the scheduled start date passed/);
});

test('SBUSA-008 keeps Started candidates visible and warns on unverified Scheduled Start records', async () => {
  const panel = await readFile(pipelinePanel, 'utf8');
  assert.match(panel, /BOARD_STATUSES = STATUSES\.filter\(s => s\.value !== 'declined'\)/);
  assert.match(panel, /Actual Start Date/);
  assert.match(panel, /Verification needed/);
  assert.match(panel, /candidate\.startVerification\?\.warning/);
});
