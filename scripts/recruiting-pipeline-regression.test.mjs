import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/recruiting-pipeline/route.ts', import.meta.url);
const panelPath = new URL('../src/components/dashboard/broker/RecruitingPipelinePanel.tsx', import.meta.url);

test('past Scheduled Start candidates automatically become Started with an audit activity', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /function isPastScheduledStart/);
  assert.match(route, /data\.status !== 'scheduled_start'/);
  assert.match(route, /startYmd < todayYmd/);
  assert.match(route, /status: 'started'/);
  assert.match(route, /autoStartedAt: transitionedAt/);
  assert.match(route, /Scheduled Start → Started after the scheduled start date passed/);
});

test('Started recruits remain selectable in records but are excluded from the active Kanban', async () => {
  const panel = await readFile(panelPath, 'utf8');

  assert.match(panel, /value: 'started',\s+label: 'Started'/);
  assert.match(panel, /const BOARD_STATUSES = STATUSES\.filter\(s => !\['declined', 'started'\]\.includes\(s\.value\)\)/);
  assert.match(panel, /\{BOARD_STATUSES\.map\(stage =>/);
  assert.match(panel, /\{STATUSES\.map\(s => <SelectItem/);
});
