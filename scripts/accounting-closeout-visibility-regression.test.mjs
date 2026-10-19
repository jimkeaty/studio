import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routePath = new URL('../src/app/api/admin/accounting-closeout/route.ts', import.meta.url);

test('Accounting Queue uses the canonical accounting handoff status as its listing index', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /ACCOUNTING_CLOSEOUT_QUERY_STATUSES/,
    'all valid and legacy-cased accounting workflow states must be queryable');
  assert.match(
    source,
    /\.where\('accountingCloseout\.status', 'in', ACCOUNTING_CLOSEOUT_QUERY_STATUSES\)/,
    'the Accounting Queue must query the saved handoff state directly',
  );
  assert.doesNotMatch(
    source,
    /\.where\('status', '==', 'closed'\)\.limit\(1000\)/,
    'an arbitrary closed-transaction cap must not hide completed accounting handoffs',
  );
  assert.match(
    source,
    /!isClosedTransactionStatus\(transaction\.status\)/,
    'the response must retain the closed-transaction invariant after the direct handoff query',
  );
});
