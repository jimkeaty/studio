import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAgentTakeHome } from '../src/lib/transactions/agentTakeHome';

test('agent take home subtracts an agent-paid transaction fee from the recorded gross split', () => {
  assert.equal(getAgentTakeHome({
    agentDollar: 3832.5,
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 75,
    txComplianceFeePaidBy: 'agent',
  }), 3757.5);
});

test('agent take home does not subtract a fee paid by the buyer, seller, or closing', () => {
  assert.equal(getAgentTakeHome({
    agentDollar: 3832.5,
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 75,
    txComplianceFeePaidBy: 'buyer_closing_cost',
  }), 3832.5);
});

test('agent take home does not double-deduct a recorded fee from a legacy snapshot without a gross split', () => {
  assert.equal(getAgentTakeHome({
    splitSnapshot: { agentNetCommission: 3757.5, agentFeeDeduction: 75 },
    txComplianceFee: 'yes',
    txComplianceFeeAmount: 75,
    txComplianceFeePaidBy: 'agent',
  }), 3757.5);
});

test('Transaction Ledger displays and sorts the post-fee amount as Agent Take Home', () => {
  const ledgerSource = readFileSync(new URL('../src/app/dashboard/admin/transactions/page.tsx', import.meta.url), 'utf8');
  assert.match(ledgerSource, /Total Agent Take Home/);
  assert.match(ledgerSource, />Agent Take Home<SortIcon col="agentTakeHome"/);
  assert.match(ledgerSource, /case 'agentTakeHome': return getAgentTakeHome\(tx as any\);/);
  assert.match(ledgerSource, /getAgentTakeHome\(t as any, estimatedAgentSplit\)/);
});
