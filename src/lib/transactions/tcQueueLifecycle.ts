import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { createTcIntakeWithChecklist, ensureTcChecklist } from '@/lib/transactions/tcChecklist';

type TcIntakeCandidate = {
  id: string;
  ref: DocumentReference;
  data: Record<string, any>;
};

type ReopenTcIntakeArgs = {
  transactionId: string;
  preferredIntakeId?: string | null;
  intake: Record<string, any>;
  actorUid: string;
  actorRole?: string;
  now?: Date;
};

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function isLinkedToTransaction(data: Record<string, any>, transactionId: string): boolean {
  return [data.transactionId, data.approvedTransactionId, data.originalTransactionId]
    .some((value) => toText(value) === transactionId);
}

function toMillis(value: unknown): number {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function workflowPriority(status: unknown): number {
  switch (toText(status).toLowerCase()) {
    case 'submitted':
      return 4;
    case 'in_review':
      return 3;
    case 'approved':
      return 2;
    case 'rejected':
      return 1;
    default:
      return 0;
  }
}

/**
 * Finds every queue wrapper tied to one canonical transaction. Historic records
 * can contain both `transactionId` and `approvedTransactionId`, so each field is
 * queried independently and then deduplicated by Firestore document ID.
 */
export async function findTcIntakesForTransaction(
  db: Firestore,
  transactionId: string,
  preferredIntakeId?: string | null,
): Promise<TcIntakeCandidate[]> {
  const candidates = new Map<string, TcIntakeCandidate>();
  const addCandidate = (id: string, ref: DocumentReference, data: Record<string, any>) => {
    if (isLinkedToTransaction(data, transactionId)) {
      candidates.set(id, { id, ref, data });
    }
  };

  const preferredId = toText(preferredIntakeId);
  if (preferredId) {
    const preferred = await db.collection('tcIntakes').doc(preferredId).get();
    if (preferred.exists) addCandidate(preferred.id, preferred.ref, preferred.data() || {});
  }

  const [byTransactionId, byApprovedTransactionId] = await Promise.all([
    db.collection('tcIntakes').where('transactionId', '==', transactionId).get(),
    db.collection('tcIntakes').where('approvedTransactionId', '==', transactionId).get(),
  ]);
  for (const document of [...byTransactionId.docs, ...byApprovedTransactionId.docs]) {
    addCandidate(document.id, document.ref, document.data() || {});
  }

  return Array.from(candidates.values());
}

/**
 * Chooses one durable workflow wrapper. The transaction's saved pointer wins;
 * otherwise an active workflow wins over historical terminal wrappers.
 */
export function selectCanonicalTcIntake(
  candidates: TcIntakeCandidate[],
  preferredIntakeId?: string | null,
): TcIntakeCandidate | null {
  const preferredId = toText(preferredIntakeId);
  return [...candidates]
    .sort((left, right) => {
      if (left.id === preferredId && right.id !== preferredId) return -1;
      if (right.id === preferredId && left.id !== preferredId) return 1;

      const statusDifference = workflowPriority(right.data.status) - workflowPriority(left.data.status);
      if (statusDifference !== 0) return statusDifference;

      const leftActivity = Math.max(
        toMillis(left.data.queueUpdatedAt),
        toMillis(left.data.lastChangedAt),
        toMillis(left.data.updatedAt),
        toMillis(left.data.submittedAt),
      );
      const rightActivity = Math.max(
        toMillis(right.data.queueUpdatedAt),
        toMillis(right.data.lastChangedAt),
        toMillis(right.data.updatedAt),
        toMillis(right.data.submittedAt),
      );
      return rightActivity - leftActivity;
    })[0] ?? null;
}

/**
 * Reopens the single TC workflow record for an edited canonical transaction.
 * Existing assignment and checklist state are deliberately retained. New files
 * use the transaction ID as the deterministic intake document ID, preventing
 * concurrent saves from creating separate queue wrappers.
 */
export async function reopenTcIntakeForTransaction(
  db: Firestore,
  args: ReopenTcIntakeArgs,
): Promise<{ id: string; created: boolean; reopened: boolean; duplicateCount: number }> {
  const now = args.now || new Date();
  const nowIso = now.toISOString();
  const transactionId = toText(args.transactionId);
  const candidates = await findTcIntakesForTransaction(db, transactionId, args.preferredIntakeId);
  const existing = selectCanonicalTcIntake(candidates, args.preferredIntakeId);

  if (!existing) {
    const intakeRef = await createTcIntakeWithChecklist(db, transactionId, {
      ...args.intake,
      transactionId,
      approvedTransactionId: transactionId,
      originalTransactionId: transactionId,
      status: 'submitted',
      tcStatus: 'submitted',
      submittedAt: nowIso,
      queueUpdatedAt: nowIso,
      lastChangedAt: nowIso,
      lastChangedBy: args.actorUid,
      lastChangedByRole: args.actorRole || 'agent',
      updatedAt: nowIso,
    });
    return { id: intakeRef.id, created: true, reopened: false, duplicateCount: 0 };
  }

  const priorStatus = toText(existing.data.status).toLowerCase();
  const reopened = ['approved', 'rejected', 'archived'].includes(priorStatus);
  const reopenCount = Number(existing.data.reopenCount || 0) + (reopened ? 1 : 0);

  await existing.ref.set({
    ...args.intake,
    transactionId,
    approvedTransactionId: transactionId,
    originalTransactionId: transactionId,
    status: 'submitted',
    tcStatus: 'submitted',
    // A re-review changes queue priority, not the history of when this file
    // first entered the TC workflow.
    submittedAt: existing.data.submittedAt || nowIso,
    queueUpdatedAt: nowIso,
    lastChangedAt: nowIso,
    lastChangedBy: args.actorUid,
    lastChangedByRole: args.actorRole || 'agent',
    updatedAt: nowIso,
    reviewedAt: null,
    reviewedBy: null,
    ...(reopened ? {
      reopenedAt: nowIso,
      reopenCount,
      lastReviewedAt: existing.data.reviewedAt || null,
      lastReviewedBy: existing.data.reviewedBy || null,
    } : {}),
  }, { merge: true });

  // Never recreate or reset a current checklist; only repair legacy wrappers
  // that never received their initial checklist.
  await ensureTcChecklist(db, existing.id);

  return {
    id: existing.id,
    created: false,
    reopened,
    duplicateCount: Math.max(0, candidates.length - 1),
  };
}
