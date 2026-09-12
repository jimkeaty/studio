import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTierProgressionAsOf } from '../src/lib/transactions/tierProgressionAsOf';

const scott = 'CyrantdshqmNohT2TwHT';
const transactions = [
  {
    id: 'prior-closed',
    data: {
      agentId: scott,
      status: 'closed',
      closedDate: '2026-08-10',
      splitSnapshot: { grossCommission: 27552.75, companyRetained: 6888.19 },
    },
  },
  {
    id: '135-radcliffe',
    data: {
      agentId: scott,
      status: 'closed',
      closedDate: '2026-08-17',
      splitSnapshot: { grossCommission: 3840, companyRetained: 960 },
    },
  },
  {
    id: '211-edgehill',
    data: {
      agentId: scott,
      status: 'closed',
      closedDate: '2026-08-26',
      splitSnapshot: { grossCommission: 14792.25, companyRetained: 3698.06 },
    },
  },
];

function memberPercentAt(priorGci: number): number {
  return priorGci < 42000 ? 70 : 75;
}

function joshMemberPercentAt(priorGci: number): number {
  return priorGci < 42000 ? 45 : 50;
}

test('a Charles Ditch Team transaction that crosses $42,000 remains at 70/5/25', () => {
  const beforeEdgehill = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-26',
    excludeTransactionId: '211-edgehill',
  });

  assert.equal(beforeEdgehill.gci, 31392.75);
  assert.equal(memberPercentAt(beforeEdgehill.gci), 70);
  assert.equal(75 - memberPercentAt(beforeEdgehill.gci), 5);
});

test('the next Charles Ditch Team transaction after $42,000 moves to 75/0/25', () => {
  const afterEdgehill = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-27',
  });

  assert.equal(afterEdgehill.gci, 46185);
  assert.equal(memberPercentAt(afterEdgehill.gci), 75);
  assert.equal(75 - memberPercentAt(afterEdgehill.gci), 0);
});

test('the same boundary rule protects Josh Boulanger’s 45/30/25 to 50/25/25 transition', () => {
  const beforeThreshold = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-26',
    excludeTransactionId: '211-edgehill',
  });
  const afterThreshold = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-27',
  });

  assert.equal(joshMemberPercentAt(beforeThreshold.gci), 45);
  assert.equal(75 - joshMemberPercentAt(beforeThreshold.gci), 30);
  assert.equal(joshMemberPercentAt(afterThreshold.gci), 50);
  assert.equal(75 - joshMemberPercentAt(afterThreshold.gci), 25);
});
