import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handoffClosedTransactionToAccounting,
  type AccountingActor,
} from '../src/lib/transactions/accountingCloseout';

type Store = Map<string, Record<string, any>>;

type FakeFirestoreOptions = {
  failCommit?: boolean;
};

function createFakeFirestore(seed: Record<string, Record<string, any>>, options: FakeFirestoreOptions = {}) {
  const documents: Store = new Map(
    Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]),
  );
  let autoId = 0;

  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${path}/${name}/${id || `generated-${++autoId}`}`),
    }),
  });

  const getAtPath = (path: string) => {
    const value = documents.get(path);
    return {
      exists: Boolean(value),
      data: () => value ? structuredClone(value) : undefined,
    };
  };

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
    }),
    runTransaction: async (callback: (transaction: any) => Promise<any>) => {
      const operations: Array<{ kind: 'set' | 'update'; path: string; value: Record<string, any>; merge?: boolean }> = [];
      const transaction = {
        get: async (documentRef: any) => getAtPath(documentRef.path),
        set: (documentRef: any, value: Record<string, any>, config?: { merge?: boolean }) => {
          operations.push({ kind: 'set', path: documentRef.path, value: structuredClone(value), merge: config?.merge });
        },
        update: (documentRef: any, value: Record<string, any>) => {
          if (!documents.has(documentRef.path)) throw new Error(`Missing document ${documentRef.path}`);
          operations.push({ kind: 'update', path: documentRef.path, value: structuredClone(value) });
        },
      };
      const result = await callback(transaction);
      if (options.failCommit) throw new Error('Simulated Firestore commit failure');
      for (const operation of operations) {
        const existing = documents.get(operation.path) || {};
        documents.set(
          operation.path,
          operation.kind === 'set' && !operation.merge
            ? operation.value
            : { ...existing, ...operation.value },
        );
      }
      return result;
    },
  };

  return { db, documents };
}

const actor: AccountingActor = {
  uid: 'staff-001',
  name: 'Staff Reviewer',
  email: 'staff@example.test',
};

const transactionSeed = {
  status: 'closed',
  propertyAddress: '123 Example Street',
  agentDisplayName: 'Primary Agent',
  salePrice: 300000,
  gci: 9000,
  transactionFee: 395,
  brokerGci: 2250,
  agentDollar: 6750,
  isInHouse: false,
  closingType: 'listing',
};

test('closed Staff approval and Accounting handoff persist in one workflow transaction', async () => {
  const { db, documents } = createFakeFirestore({
    'transactions/tx-001': transactionSeed,
    'staffQueue/queue-001': { status: 'pending_review' },
  });

  const result = await handoffClosedTransactionToAccounting(db as any, 'tx-001', actor, {
    queueItemRef: db.collection('staffQueue').doc('queue-001'),
    queueItemUpdates: { status: 'approved', reviewedBy: actor.uid },
    activityLog: { action: 'Approved', detail: 'Closed-file release verified.', by: actor.email },
  });

  assert.equal(result.newlyCreated, true);
  assert.equal(result.accountingCloseout.status, 'new');
  assert.equal(documents.get('transactions/tx-001')?.accountingCloseout?.status, 'new');
  assert.equal(documents.get('transactions/tx-001')?.departmentalProcessing?.accounting?.status, 'new');
  assert.equal(documents.get('staffQueue/queue-001')?.status, 'approved');
  assert.equal(documents.get('staffQueue/queue-001')?.reviewedBy, actor.uid);
  assert.ok([...documents.keys()].some((path) => path.startsWith('transactions/tx-001/processingHistory/')));
  assert.ok([...documents.keys()].some((path) => path.startsWith('staffQueue/queue-001/activityLog/')));
});

test('a failed handoff commit leaves both the Staff Queue and Accounting state unchanged', async () => {
  const { db, documents } = createFakeFirestore({
    'transactions/tx-001': transactionSeed,
    'staffQueue/queue-001': { status: 'pending_review' },
  }, { failCommit: true });

  await assert.rejects(
    handoffClosedTransactionToAccounting(db as any, 'tx-001', actor, {
      queueItemRef: db.collection('staffQueue').doc('queue-001'),
      queueItemUpdates: { status: 'approved', reviewedBy: actor.uid },
    }),
    /Simulated Firestore commit failure/,
  );

  assert.equal(documents.get('transactions/tx-001')?.accountingCloseout, undefined);
  assert.equal(documents.get('staffQueue/queue-001')?.status, 'pending_review');
  assert.equal([...documents.keys()].some((path) => path.includes('/processingHistory/')), false);
});
