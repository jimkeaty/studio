import assert from 'node:assert/strict';
import test from 'node:test';
import { reopenTcIntakeForTransaction } from '@/lib/transactions/tcQueueLifecycle';

type Store = Map<string, Record<string, any>>;

function createFakeFirestore(seed: Record<string, Record<string, any>>) {
  const documents: Store = new Map(Object.entries(seed).map(([id, data]) => [id, structuredClone(data)]));
  const checklistRows = new Map<string, Record<string, any>>([
    ['legacy-queue', { item_01: { completed: true, label: 'Contract received & verified' } }],
  ]);

  const getSnapshot = (id: string) => {
    const data = documents.get(id);
    return {
      id,
      exists: Boolean(data),
      data: () => data ? structuredClone(data) : undefined,
      ref: documentReference(id),
    };
  };

  const checklistReference = (intakeId: string) => ({
    limit: () => ({
      get: async () => ({
        empty: Object.keys(checklistRows.get(intakeId) || {}).length === 0,
        docs: [],
      }),
    }),
    doc: (itemId: string) => ({ id: itemId }),
  });

  const documentReference = (id: string) => ({
    id,
    get: async () => getSnapshot(id),
    set: async (updates: Record<string, any>, options?: { merge?: boolean }) => {
      const existing = documents.get(id) || {};
      documents.set(id, structuredClone(options?.merge ? { ...existing, ...updates } : updates));
    },
    collection: (name: string) => {
      assert.equal(name, 'checklist');
      return checklistReference(id);
    },
  });

  const collection = (name: string) => {
    assert.equal(name, 'tcIntakes');
    return {
      doc: documentReference,
      where: (field: string, _operator: string, value: string) => ({
        get: async () => ({
          docs: Array.from(documents.entries())
            .filter(([, data]) => data[field] === value)
            .map(([id]) => getSnapshot(id)),
        }),
      }),
    };
  };

  return {
    db: { collection } as any,
    documents,
    checklistRows,
  };
}

test('reopening an approved TC intake preserves one wrapper, assignment, submission time, and checklist progress', async () => {
  const { db, documents, checklistRows } = createFakeFirestore({
    'legacy-queue': {
      approvedTransactionId: 'tx-123',
      transactionId: 'tx-123',
      status: 'approved',
      submittedAt: '2026-08-01T09:00:00.000Z',
      assignedTcProfileId: 'tc-laine',
      reviewedAt: '2026-08-04T12:00:00.000Z',
      reviewedBy: 'tc@example.com',
    },
  });
  const now = new Date('2026-09-28T22:00:00.000Z');

  const result = await reopenTcIntakeForTransaction(db, {
    transactionId: 'tx-123',
    preferredIntakeId: 'legacy-queue',
    actorUid: 'agent-123',
    actorRole: 'agent',
    now,
    intake: {
      address: '123 Banana Street',
      clientName: 'Updated Client',
      documents: [{ storagePath: 'new-contract.pdf' }],
    },
  });

  const saved = documents.get('legacy-queue')!;
  assert.deepEqual(result, { id: 'legacy-queue', created: false, reopened: true, duplicateCount: 0 });
  assert.equal(saved.status, 'submitted');
  assert.equal(saved.tcStatus, 'submitted');
  assert.equal(saved.submittedAt, '2026-08-01T09:00:00.000Z');
  assert.equal(saved.assignedTcProfileId, 'tc-laine');
  assert.equal(saved.reopenedAt, now.toISOString());
  assert.equal(saved.reviewedAt, null);
  assert.equal(saved.address, '123 Banana Street');
  assert.equal(checklistRows.get('legacy-queue')?.item_01.completed, true);
});
