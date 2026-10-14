import type { Firestore } from 'firebase-admin/firestore';

export type TransactionArchiveActor = {
  uid: string;
  email?: string | null;
  name?: string | null;
};

export type TransactionArchiveRequest = {
  actor: TransactionArchiveActor;
  reason: string;
  context?: string;
};

export type TransactionArchiveResult = {
  transactionId: string;
  alreadyArchived: boolean;
  affectedAgentIds: string[];
  year: number | null;
  archivedAt: string;
  queueWrappersUpdated: number;
};

function normalizedText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizedReason(value: unknown): string {
  const reason = normalizedText(value);
  if (reason.length < 3) throw new Error('An archive reason of at least 3 characters is required');
  return reason.slice(0, 1000);
}

function archiveActor(actor: TransactionArchiveActor) {
  return {
    uid: normalizedText(actor.uid),
    email: normalizedText(actor.email) || null,
    name: normalizedText(actor.name) || normalizedText(actor.email) || normalizedText(actor.uid),
  };
}

function auditSnapshot(transactionId: string, transaction: Record<string, any>) {
  return {
    transactionId,
    address: normalizedText(transaction.address || transaction.propertyAddress),
    agentId: normalizedText(transaction.agentId),
    agentDisplayName: normalizedText(transaction.agentDisplayName || transaction.agentName),
    status: normalizedText(transaction.status),
    closingType: normalizedText(transaction.closingType),
    year: Number(transaction.year) || null,
    salePrice: Number(transaction.salePrice) || 0,
    grossCommission: Number(transaction.splitSnapshot?.grossCommission ?? transaction.gci ?? transaction.commission) || 0,
    version: transaction.updatedAt ?? null,
  };
}

/** Archive state is separate from lifecycle status so a closed file remains historically closed. */
export function isArchivedTransaction(transaction: Record<string, any> | null | undefined): boolean {
  return transaction?.isArchived === true || String(transaction?.archiveState || '').toLowerCase() === 'archived';
}

/**
 * Archives one canonical transaction and records an immutable subcollection audit event.
 * It never deletes the transaction document, documents, financial snapshots, or history.
 */
export async function archiveCanonicalTransaction(
  db: Firestore,
  transactionId: string,
  request: TransactionArchiveRequest,
): Promise<TransactionArchiveResult> {
  const id = normalizedText(transactionId);
  if (!id) throw new Error('Transaction id is required');

  const reason = normalizedReason(request.reason);
  const actor = archiveActor(request.actor);
  if (!actor.uid) throw new Error('Archive actor is required');
  const now = new Date().toISOString();
  const transactionRef = db.collection('transactions').doc(id);

  const result = await db.runTransaction(async (firestoreTransaction) => {
    const snap = await firestoreTransaction.get(transactionRef);
    if (!snap.exists) throw new Error('Transaction not found');
    const transaction = (snap.data() || {}) as Record<string, any>;
    const agentIds = [transaction.agentId, transaction.coAgent?.agentId]
      .map((value) => normalizedText(value))
      .filter(Boolean);

    if (isArchivedTransaction(transaction)) {
      return {
        transactionId: id,
        alreadyArchived: true,
        affectedAgentIds: [...new Set(agentIds)],
        year: Number(transaction.year) || null,
        archivedAt: normalizedText(transaction.archivedAt) || now,
      };
    }

    const event = {
      type: 'transaction_archived',
      action: 'archive',
      createdAt: now,
      archivedAt: now,
      actor,
      reason,
      context: normalizedText(request.context) || null,
      snapshot: auditSnapshot(id, transaction),
    };

    firestoreTransaction.update(transactionRef, {
      isArchived: true,
      archiveState: 'archived',
      archivedAt: now,
      archivedBy: actor,
      archiveReason: reason,
      archiveContext: normalizedText(request.context) || null,
      updatedAt: now,
    });
    firestoreTransaction.create(transactionRef.collection('auditEvents').doc(), event);

    return {
      transactionId: id,
      alreadyArchived: false,
      affectedAgentIds: [...new Set(agentIds)],
      year: Number(transaction.year) || null,
      archivedAt: now,
    };
  });

  // Queue documents are indexes, not a competing source of truth. Mark matching
  // wrappers archived after the canonical archive succeeds; read paths independently
  // exclude archived canonical records as a second safeguard.
  let queueWrappersUpdated = 0;
  try {
    const [staffQueue, tcByTransaction, tcByApproved] = await Promise.all([
      db.collection('staffQueue').where('transactionId', '==', id).get(),
      db.collection('tcIntakes').where('transactionId', '==', id).get(),
      db.collection('tcIntakes').where('approvedTransactionId', '==', id).get(),
    ]);
    const wrappers = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...staffQueue.docs, ...tcByTransaction.docs, ...tcByApproved.docs]) {
      wrappers.set(doc.ref.path, doc);
    }
    if (wrappers.size > 0) {
      const batch = db.batch();
      for (const doc of wrappers.values()) {
        batch.update(doc.ref, {
          isArchived: true,
          archivedAt: result.archivedAt,
          archivedBy: actor,
          archiveReason: reason,
          updatedAt: result.archivedAt,
        });
      }
      await batch.commit();
      queueWrappersUpdated = wrappers.size;
    }
  } catch (error) {
    // The canonical record and its audit event are already preserved. A queue
    // wrapper failure must not make a transaction disappear without a trace.
    console.warn('[archiveCanonicalTransaction] Queue wrapper archive failed:', error);
  }

  return { ...result, queueWrappersUpdated };
}

/** Restores visibility without deleting the original archive audit event. */
export async function restoreCanonicalTransaction(
  db: Firestore,
  transactionId: string,
  request: TransactionArchiveRequest,
): Promise<{ transactionId: string; restoredAt: string }> {
  const id = normalizedText(transactionId);
  if (!id) throw new Error('Transaction id is required');
  const reason = normalizedReason(request.reason);
  const actor = archiveActor(request.actor);
  if (!actor.uid) throw new Error('Restore actor is required');
  const now = new Date().toISOString();
  const transactionRef = db.collection('transactions').doc(id);

  await db.runTransaction(async (firestoreTransaction) => {
    const snap = await firestoreTransaction.get(transactionRef);
    if (!snap.exists) throw new Error('Transaction not found');
    const transaction = (snap.data() || {}) as Record<string, any>;
    if (!isArchivedTransaction(transaction)) throw new Error('Transaction is not archived');

    firestoreTransaction.update(transactionRef, {
      isArchived: false,
      archiveState: 'restored',
      restoredAt: now,
      restoredBy: actor,
      restorationReason: reason,
      updatedAt: now,
    });
    firestoreTransaction.create(transactionRef.collection('auditEvents').doc(), {
      type: 'transaction_restored',
      action: 'restore',
      createdAt: now,
      restoredAt: now,
      actor,
      reason,
      snapshot: auditSnapshot(id, transaction),
    });
  });

  // Restore queue indexes after the canonical record is visible again. The
  // original queue state is retained; this removes only the archive overlay.
  const [staffQueue, tcByTransaction, tcByApproved] = await Promise.all([
    db.collection('staffQueue').where('transactionId', '==', id).get(),
    db.collection('tcIntakes').where('transactionId', '==', id).get(),
    db.collection('tcIntakes').where('approvedTransactionId', '==', id).get(),
  ]);
  const wrappers = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...staffQueue.docs, ...tcByTransaction.docs, ...tcByApproved.docs]) {
    wrappers.set(doc.ref.path, doc);
  }
  if (wrappers.size > 0) {
    const batch = db.batch();
    for (const doc of wrappers.values()) {
      batch.update(doc.ref, {
        isArchived: false,
        archiveState: 'restored',
        restoredAt: now,
        restoredBy: actor,
        restorationReason: reason,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  return { transactionId: id, restoredAt: now };
}
