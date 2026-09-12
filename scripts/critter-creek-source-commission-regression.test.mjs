import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('custom member bands are source-aware and do not choose the first overlapping CGL exception', () => {
  const resolver = read('src/app/api/transactions/_lib/teamTransactionResolver.ts');
  const helper = read('src/lib/commissions/sourceSpecificMemberBands.ts');
  assert.match(resolver, /selectSourceSpecificMemberBands\(/);
  assert.match(resolver, /input\.dealSource/);
  assert.match(helper, /sphere/);
  assert.match(helper, /company_gen/);
  assert.match(helper, /return \[\];/);
});

test('commission preview and every operational CGL recalculation path carry the canonical deal source', () => {
  const preview = read('src/app/api/admin/agent-profiles/[agentId]/commission/route.ts');
  const editor = read('src/app/dashboard/transactions/new/page.tsx');
  const admin = read('src/app/api/admin/transactions/route.ts');
  const staff = read('src/app/api/admin/staff-queue/[itemId]/route.ts');
  const tc = read('src/app/api/admin/tc/[id]/route.ts');
  const create = read('src/app/api/transactions/route.ts');
  assert.match(preview, /searchParams\.get\('dealSource'\)/);
  assert.match(editor, /previewParams\.set\('dealSource'/);
  assert.match(admin, /dealSource: String\(effectiveTransaction\.dealSource/);
  assert.match(staff, /dealSource: String\(merged\.dealSource/);
  assert.match(tc, /dealSource: String\(mergedWithMethod\.dealSource/);
  assert.match(create, /dealSource: normalizeDealSource\(body\.dealSource\)/);
});

test('operational manual percentage edits synchronize the complementary split instead of submitting an invalid partial pair', () => {
  const editor = read('src/app/dashboard/transactions/new/page.tsx');
  assert.match(editor, /form\.setValue\('agentPct', Number\(\(100 - brokerPct\)/);
  assert.match(editor, /form\.setValue\('brokerPct', Number\(\(100 - agentPct\)/);
  assert.match(editor, /setManualDollarSplit\('brokerGci'/);
  assert.match(editor, /setManualDollarSplit\('agentDollar'/);
});
