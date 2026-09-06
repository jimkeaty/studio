export type ChecklistTransactionActivityInput = {
  transactionId: string;
  agentId?: string | null;
  submittedByUid?: string | null;
  tenantId?: string | null;
  propertyAddress?: string | null;
  checklistItemId: string;
  checklistLabel?: string | null;
  completed: boolean;
  previousCompleted: boolean;
  actor: { uid: string; name?: string | null; role: string };
  occurredAt: Date | string;
};

export function centralDateKey(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

/**
 * Routine checklist changes are held on the canonical transaction, never only
 * on a Staff Queue or TC intake wrapper. Both completion and correction events
 * are retained so a later uncheck cannot erase the underlying history.
 */
export function buildChecklistTransactionActivity(input: ChecklistTransactionActivityInput) {
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt;
  return {
    eventType: 'routine_checklist_changed',
    category: 'routine',
    activityDate: centralDateKey(new Date(occurredAt)),
    occurredAt,
    transactionId: input.transactionId,
    agentId: input.agentId || null,
    submittedByUid: input.submittedByUid || null,
    tenantId: input.tenantId || null,
    propertyAddress: input.propertyAddress || null,
    checklist: {
      itemId: input.checklistItemId,
      label: input.checklistLabel || 'Checklist item',
      previousCompleted: input.previousCompleted,
      completed: input.completed,
    },
    actor: {
      uid: input.actor.uid,
      name: input.actor.name || null,
      role: input.actor.role,
    },
    digestStatus: 'pending',
    digestAttempts: 0,
  };
}
