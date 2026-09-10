import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const route = read('src/app/api/broker/active-agents/route.ts');
const list = read('src/components/dashboard/broker/RecruitingOperationsListView.tsx');
const lifecycle = read('src/lib/agents/lifecycle.ts');

test('SBUSA-014 resolves Inactive Agent Review names from canonical profile displayName before legacy fallbacks', () => {
  assert.match(route, /const fullName =/);
  assert.match(route, /a\.displayName \|\| a\.name \|\| fullName/);
  assert.match(route, /name: ar\.name/);
  assert.doesNotMatch(route, /a\.displayName \|\| a\.name \|\| a\.firstName && a\.lastName \?/);
});

test('SBUSA-014 renders an agent name and effective lifecycle dates in the staff Inactive Agent Review list', () => {
  assert.match(list, /Inactive Agent Review List/);
  assert.match(list, /<TableHead>Agent<\/TableHead>/);
  assert.match(list, /\{agent\.name\}/);
  assert.match(list, /\{agent\.inactiveDate \|\| 'Not recorded'\}/);
  assert.match(list, /\{agent\.endDate \|\| 'Not recorded'\}/);
});

test('SBUSA-014 preserves shared effective-date lifecycle classification for Inactive review rows', () => {
  assert.match(route, /classifyAgentLifecycle\(ar, currentAsOfDate\)\.status === 'inactive'/);
  assert.match(lifecycle, /export function classifyAgentLifecycle/);
  assert.match(lifecycle, /status: 'inactive'/);
});
