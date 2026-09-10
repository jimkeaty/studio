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
    id: 'later-edgehill',
    data: {
      agentId: scott,
      status: 'closed',
      closedDate: '2026-08-26',
      splitSnapshot: { grossCommission: 14792.25, companyRetained: 3698.06 },
    },
  },
];

test('135 Radcliffe uses progression as of its August 17 close and excludes both itself and the later August 26 closing', () => {
  const priorProgression = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-17',
    excludeTransactionId: '135-radcliffe',
  });

  assert.equal(priorProgression.gci, 27552.75);
  assert.deepEqual(priorProgression.includedTransactionIds, ['prior-closed']);
  assert.equal(Number((priorProgression.gci + 3840).toFixed(2)), 31392.75);
  assert.ok(priorProgression.gci + 3840 < 42000, 'August 17 remains below Scott’s 70-to-75 threshold');
});

test('later progression can reach the next tier without retroactively changing the August 17 transaction', () => {
  const laterProgression = calculateTierProgressionAsOf({
    transactions,
    agentId: scott,
    anniversaryMonth: 4,
    anniversaryDay: 15,
    asOfDate: '2026-08-26',
  });

  assert.equal(laterProgression.gci, 46185);
  assert.ok(laterProgression.gci >= 42000, 'later close may legitimately use the next member tier');
});
