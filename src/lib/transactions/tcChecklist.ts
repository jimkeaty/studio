import type { Firestore } from 'firebase-admin/firestore';

export const DEFAULT_TC_CHECKLIST = [
  'Contract received & verified',
  'Earnest money deposit confirmed',
  'Title company ordered',
  'Home inspection scheduled',
  'Home inspection completed',
  'Appraisal ordered',
  'Appraisal received',
  'Loan approval received',
  'Title commitment reviewed',
  'Survey ordered/received',
  'HOA docs requested (if applicable)',
  'Final walkthrough scheduled',
  'Closing disclosure reviewed',
  'Closing documents prepared',
  'Commission disbursement verified',
  'File closed & archived',
] as const;

/**
 * Ensure the standard checklist exists for a TC intake. The transaction remains
 * the only source of transaction data; this is workflow-only state for the TC.
 */
export async function ensureTcChecklist(db: Firestore, intakeId: string) {
  const checklistRef = db.collection('tcIntakes').doc(intakeId).collection('checklist');
  const existing = await checklistRef.limit(1).get();
  if (!existing.empty) return;

  const batch = db.batch();
  DEFAULT_TC_CHECKLIST.forEach((label, index) => {
    const order = index + 1;
    batch.set(checklistRef.doc(`item_${String(order).padStart(2, '0')}`), {
      order,
      label,
      completed: false,
      completedBy: null,
      completedAt: null,
    });
  });
  await batch.commit();
}

/**
 * Create one TC workflow intake and its default checklist in the same Firestore
 * batch. Callers provide a deterministic intake ID (the canonical transaction
 * ID) so concurrent agent/admin saves cannot create parallel active intakes.
 */
export async function createTcIntakeWithChecklist(
  db: Firestore,
  intakeId: string,
  intake: Record<string, any>,
) {
  const intakeRef = db.collection('tcIntakes').doc(intakeId);
  const checklistRef = intakeRef.collection('checklist');
  const batch = db.batch();

  batch.set(intakeRef, intake);
  DEFAULT_TC_CHECKLIST.forEach((label, index) => {
    const order = index + 1;
    batch.set(checklistRef.doc(`item_${String(order).padStart(2, '0')}`), {
      order,
      label,
      completed: false,
      completedBy: null,
      completedAt: null,
    });
  });

  await batch.commit();
  return intakeRef;
}
