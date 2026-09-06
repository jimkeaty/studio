import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../src/app/api/broker/active-agents/route.ts', import.meta.url);

test('all inactive profiles are excluded from active-agent reporting regardless of end date', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /excludeFromActiveCount: boolean/);
  assert.match(route, /const excludeFromActiveCount = INACTIVE_STATUSES\.has\(profileStatus\)/);
  assert.match(route, /if \(ar\.excludeFromActiveCount\) continue;/);
  assert.match(route, /if \(ar\.excludeFromActiveCount\) return false;/);
  assert.match(route, /even when the person remains licensed with the brokerage/);
});

test('end dates remain available for dated departure reporting without overriding inactive status', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /if \(endDate\) \{/);
  assert.match(route, /endMonth = toYearMonth\(addMonths\(ed, 1\)\)/);
  assert.match(route, /hasExplicitEndDate = true/);
});
