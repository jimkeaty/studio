import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const pagePath = new URL('../src/app/dashboard/admin/recruiting/page.tsx', import.meta.url);
const listViewPath = new URL('../src/components/dashboard/broker/RecruitingOperationsListView.tsx', import.meta.url);
const pipelinePath = new URL('../src/components/dashboard/broker/RecruitingPipelinePanel.tsx', import.meta.url);

test('Recruiting and Development exposes the Staff List View tab with existing authorized data', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ RecruitingOperationsListView \}/);
  assert.match(page, /TabsTrigger value="operations">Staff List View<\/TabsTrigger>/);
  assert.match(page, /<RecruitingOperationsListView/);
  assert.match(page, /activeAgents=\{realActiveAgents\}/);
  assert.match(page, /metricMonths=\{months\}/);
  assert.match(page, /<RecruitingPipelinePanel initialViewMode="table" compact \/>/);
});

test('Staff List View provides concise operational summaries and a month-by-month table', async () => {
  const view = await readFile(listViewPath, 'utf8');

  assert.match(view, /Staff &amp; Admin List View/);
  assert.match(view, /without charts, chats, or progress rings/);
  assert.match(view, /Monthly Agent &amp; Recruiting Summary/);
  assert.match(view, /Active-agent counts exclude profiles marked Inactive/);
  assert.match(view, /<TableHead className="text-right">Interviews Held<\/TableHead>/);
});

test('Recruiting pipeline supports a compact table-only presentation for the staff view', async () => {
  const pipeline = await readFile(pipelinePath, 'utf8');

  assert.match(pipeline, /initialViewMode = 'kanban'/);
  assert.match(pipeline, /compact = false/);
  assert.match(pipeline, /useState<'kanban' \| 'table'>\(initialViewMode\)/);
  assert.match(pipeline, /\{compact \? 'Current Recruiting List' : 'Recruiting Pipeline'\}/);
});
