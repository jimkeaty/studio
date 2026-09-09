import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/dashboard/admin/transactions/page.tsx', import.meta.url), 'utf8');

test('Transaction Ledger labels the post-fee payout as Agent Take Home and uses the canonical helper', () => {
  assert.match(source, /import \{ getAgentTakeHome \} from '@\/lib\/transactions\/agentTakeHome';/);
  assert.match(source, /Total Agent Take Home/);
  assert.match(source, />Agent Take Home<SortIcon col="agentTakeHome"/);
  assert.match(source, /const agentTakeHome = getAgentTakeHome\(t as any\);/);
  assert.match(source, /case 'agentTakeHome': return getAgentTakeHome\(tx as any\);/);
});

test('Transaction Ledger applies agent-paid fees to estimates without double-deducting saved snapshots', () => {
  assert.match(source, /getAgentTakeHome\(t as any, estimatedAgentSplit\)/);
  assert.match(source, /Agent split less any agent-paid transaction fee/);
});
