import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveCanonicalTransaction,
  isArchivedTransaction,
  restoreCanonicalTransaction,
} from '../src/lib/transactions/archiveTransaction';

test('archive visibility is explicit and never inferred from a closed lifecycle status', () => {
  assert.equal(isArchivedTransaction({ status: 'closed' }), false);
  assert.equal(isArchivedTransaction({ status: 'archived' }), false);
  assert.equal(isArchivedTransaction({ isArchived: true, status: 'closed' }), true);
  assert.equal(isArchivedTransaction({ archiveState: 'archived', status: 'pending' }), true);
  assert.equal(isArchivedTransaction({ archiveState: 'restored', isArchived: false }), false);
});

function createFirestoreMock() {
  const transactionData: Record<string, any> = {
    address: '109 Tacony Drive',
    agentId: 'agent-1',
    agentDisplayName: 'Test Agent',
    status: 'closed',
    closingType: 'listing',
    year: 2026,
    salePrice: 250000,
    splitSnapshot: { grossCommission: 7500 },
  };
  const auditEvents: Record<string, any>[] = [];
  const transactionRef = {
    id: 'tx-109-tacony',
    path: 'transactions/tx-109-tacony',
    collection: (name: string) => ({ doc: () => ({ id: `${name}-${auditEvents.length + 1}`, path: `transactions/tx-109-tacony/${name}/${auditEvents.length + 1}` }) }),
  };
  const emptyQuery: any = { where: () => emptyQuery, get: async () => ({ docs: [] }) };
  const db = {
    collection: (name: string) => name === 'transactions'
      ? { doc: () => transactionRef, where: () => emptyQuery }
      : emptyQuery,
    runTransaction: async (callback: (transaction: any) => Promise<any>) => callback({
      get: async () => ({ exists: true, data: () => transactionData }),
      update: (_ref: unknown, update: Record<string, any>) => Object.assign(transactionData, update),
      create: (_ref: unknown, event: Record<string, any>) => auditEvents.push(event),
    }),
    batch: () => ({ update: () => undefined, commit: async () => undefined }),
  };
  return { db, transactionData, auditEvents };
}

test('canonical archiving preserves financial data, records audit evidence, and restores visibility', async () => {
  const { db, transactionData, auditEvents } = createFirestoreMock();
  const actor = { uid: 'admin-1', email: 'admin@example.com' };

  const archived = await archiveCanonicalTransaction(db as any, 'tx-109-tacony', {
    actor,
    reason: 'Confirmed duplicate import',
    context: 'test',
  });

  assert.equal(archived.alreadyArchived, false);
  assert.equal(isArchivedTransaction(transactionData), true);
  assert.equal(transactionData.splitSnapshot.grossCommission, 7500);
  assert.equal(auditEvents[0].type, 'transaction_archived');
  assert.equal(auditEvents[0].snapshot.address, '109 Tacony Drive');

  await restoreCanonicalTransaction(db as any, 'tx-109-tacony', {
    actor,
    reason: 'Confirmed canonical record',
    context: 'test',
  });

  assert.equal(isArchivedTransaction(transactionData), false);
  assert.equal(transactionData.archiveState, 'restored');
  assert.equal(auditEvents[1].type, 'transaction_restored');
});

test('archive reason is mandatory and archival is idempotent', async () => {
  const { db, auditEvents } = createFirestoreMock();
  const actor = { uid: 'admin-1' };

  await assert.rejects(
    archiveCanonicalTransaction(db as any, 'tx-109-tacony', { actor, reason: 'x' }),
    /archive reason/i,
  );

  await archiveCanonicalTransaction(db as any, 'tx-109-tacony', { actor, reason: 'Valid archive reason' });
  const second = await archiveCanonicalTransaction(db as any, 'tx-109-tacony', { actor, reason: 'Valid archive reason' });
  assert.equal(second.alreadyArchived, true);
  assert.equal(auditEvents.filter((event) => event.type === 'transaction_archived').length, 1);
});
