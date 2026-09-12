import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getStaffRole, isAccountingUser } from '@/lib/auth/staffAccess';
import { getAccountingUids, getTcUids } from '@/lib/notifications/getRecipientUids';
import { sendNotification } from '@/lib/notifications/sendNotification';
import {
  buildAccountingSnapshot,
  requiredAccountingFieldsMissing,
  writeProcessingHistory,
  type AccountingActor,
  type AccountingFieldState,
} from '@/lib/transactions/accountingCloseout';

function tokenFrom(req: NextRequest) {
  const value = req.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function workflowRecipientUids(transaction: Record<string, any>, closeout: Record<string, any>) {
  const candidates = [
    closeout.tcCompletedBy?.uid,
    closeout.handedOffBy?.uid,
    transaction.assignedTcUid,
    transaction.tcUid,
    ...(Array.isArray(transaction.assignedTcUids) ? transaction.assignedTcUids : []),
  ];
  return [...new Set(candidates.map((value) => String(value || '').trim()).filter(Boolean))];
}

function serialize(value: any): any {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

async function actorFrom(uid: string, email?: string | null): Promise<AccountingActor> {
  const user = await adminAuth.getUser(uid).catch(() => null);
  return { uid, name: user?.displayName || user?.email || email || uid, email: user?.email || email || uid };
}

async function assertAccounting(req: NextRequest) {
  const token = tokenFrom(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const decoded = await adminAuth.verifyIdToken(token);
  if (!(await isAccountingUser(decoded.uid))) throw new Error('FORBIDDEN');
  return { decoded, actor: await actorFrom(decoded.uid, decoded.email) };
}

async function accountingUsers() {
  const snap = await adminDb.collection('staffUsers').where('status', '==', 'active').get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...serialize(doc.data()) }))
    .filter((user: any) => ['accounting', 'office_admin'].includes(String(user.role)) && user.firebaseUid)
    .map((user: any) => ({ uid: String(user.firebaseUid), name: String(user.displayName || user.email || user.firebaseUid), role: user.role }));
}

/** Returns the distinct accounting workflow stored inside canonical closed transaction records. */
export async function GET(req: NextRequest) {
  try {
    await assertAccounting(req);
    const status = new URL(req.url).searchParams.get('status') || 'all';
    // Accounting handoff state is the queue's canonical index. Query it directly
    // instead of scanning an arbitrary limited subset of all Closed transactions;
    // otherwise newer handoffs can be omitted from the visible queue even though
    // their accountingCloseout record was successfully created.
    const ACCOUNTING_QUEUE_STATUSES = ['new', 'in_progress', 'needs_information', 'completed', 'archived'];
    const snap = await adminDb.collection('transactions')
      .where('accountingCloseout.status', 'in', ACCOUNTING_QUEUE_STATUSES)
      .get();
    const items = snap.docs
      .map((doc) => {
        const transaction = doc.data() as Record<string, any>;
        const accounting = transaction.accountingCloseout as Record<string, any> | undefined;
        // A handoff is created only for a Closed transaction. Keep that workflow
        // invariant in the response in case a legacy record was later reopened.
        if (String(transaction.status || '').toLowerCase() !== 'closed' || !accounting || !accounting.status) return null;
        const currentSnapshot = buildAccountingSnapshot(transaction, doc.id);
        const fieldOverrides = (accounting.fieldOverrides || {}) as Record<string, 'na'>;
        return {
          transactionId: doc.id,
          transaction: {
            propertyAddress: transaction.propertyAddress || transaction.address || '',
            mlsNumber: transaction.mlsNumber || '',
            status: transaction.status || '',
          },
          accounting: serialize({
            ...accounting,
            snapshot: currentSnapshot,
            requiredMissing: requiredAccountingFieldsMissing(currentSnapshot, fieldOverrides),
          }),
        };
      })
      .filter(Boolean)
      .filter((item: any) => status === 'all' || item.accounting.status === status)
      .sort((a: any, b: any) => String(b.accounting.handedOffAt || '').localeCompare(String(a.accounting.handedOffAt || '')));

    return NextResponse.json({ ok: true, items, accountingUsers: await accountingUsers() });
  } catch (cause: any) {
    if (cause?.message === 'UNAUTHORIZED') return error(401, 'Unauthorized');
    if (cause?.message === 'FORBIDDEN') return error(403, 'Accounting or Office Admin access required');
    console.error('[accounting-closeout GET]', cause);
    return error(500, cause?.message || 'Unable to load accounting closeout queue');
  }
}

/** Updates only the separate accounting closeout state. The transaction remains Closed throughout. */
export async function POST(req: NextRequest) {
  try {
    const { decoded, actor } = await assertAccounting(req);
    const body = await req.json();
    const transactionId = String(body.transactionId || '').trim();
    const action = String(body.action || '').trim();
    if (!transactionId || !action) return error(400, 'transactionId and action are required');

    const txRef = adminDb.collection('transactions').doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) return error(404, 'Transaction not found');
    const transaction = txDoc.data() as Record<string, any>;
    if (String(transaction.status || '').toLowerCase() !== 'closed') return error(400, 'Only closed transactions can be processed by Accounting');
    const current = (transaction.accountingCloseout || {}) as Record<string, any>;
    if (!current.status) return error(400, 'TC/Staff closeout has not handed this transaction to Accounting yet');

    const now = new Date().toISOString();
    const closeout: Record<string, any> = { ...current, updatedAt: now };
    let historyAction = '';
    let historyDetail = '';
    let notification: {
      type: 'accounting_closeout_attention' | 'accounting_closeout_completed';
      recipientUids: string[];
      title: string;
      body: string;
    } | null = null;
    if (action === 'take') {
      closeout.status = 'in_progress';
      closeout.assignedToUid = decoded.uid;
      closeout.assignedToName = actor.name;
      closeout.assignedAt = now;
      historyAction = 'Accounting case taken';
      historyDetail = `${actor.name} took this accounting closeout case.`;
    } else if (action === 'assign') {
      const assignedToUid = String(body.assignedToUid || '').trim();
      const assignees = await accountingUsers();
      const assignee = assignees.find((entry) => entry.uid === assignedToUid);
      if (!assignee) return error(400, 'Select an active Accounting or Office Admin user');
      closeout.status = 'in_progress';
      closeout.assignedToUid = assignee.uid;
      closeout.assignedToName = assignee.name;
      closeout.assignedAt = now;
      historyAction = 'Accounting case assigned';
      historyDetail = `${actor.name} assigned this accounting closeout case to ${assignee.name}.`;
    } else if (action === 'needs_information') {
      const request = String(body.requestDetail || '').trim();
      if (!request) return error(400, 'Describe the information Accounting needs');
      closeout.status = 'needs_information';
      closeout.needsInformation = { detail: request, requestedAt: now, requestedBy: actor };
      historyAction = 'Accounting requested information';
      historyDetail = request;
      // Notify the person who completed the Staff/TC closeout and any TC
      // explicitly assigned to the file. Older files may not have an assignee,
      // so retain the TC-team fallback rather than silently leaving a request
      // unanswered.
      const assignedRecipients = workflowRecipientUids(transaction, current);
      const recipientUids = assignedRecipients.length > 0 ? assignedRecipients : await getTcUids(adminDb);
      notification = {
        type: 'accounting_closeout_attention',
        recipientUids,
        title: 'Accounting Needs Information',
        body: `${transaction.propertyAddress || transaction.address || 'A closed transaction'} needs: ${request}`,
      };
    } else if (action === 'set_field_state') {
      const fieldId = String(body.fieldId || '').trim();
      const state = String(body.state || '') as AccountingFieldState;
      if (!fieldId || !['value', 'zero', 'missing', 'na'].includes(state)) return error(400, 'Invalid accounting field state');
      const fieldOverrides = { ...(closeout.fieldOverrides || {}) } as Record<string, 'na'>;
      if (state === 'na') fieldOverrides[fieldId] = 'na';
      else delete fieldOverrides[fieldId];
      closeout.fieldOverrides = fieldOverrides;
      historyAction = 'Accounting field state updated';
      historyDetail = `${fieldId} was marked ${state === 'na' ? 'N/A' : state}.`;
    } else if (action === 'complete') {
      const snapshot = buildAccountingSnapshot(transaction, transactionId);
      const missing = requiredAccountingFieldsMissing(snapshot, closeout.fieldOverrides || {});
      if (missing.length > 0) return NextResponse.json({ ok: false, error: 'Required accounting fields are incomplete', missing }, { status: 400 });
      closeout.status = 'completed';
      closeout.completedAt = now;
      closeout.completedBy = actor;
      historyAction = 'Accounting closeout completed';
      historyDetail = `${actor.name} completed accounting closeout. Transaction status remains Closed.`;
      const recipientUids = workflowRecipientUids(transaction, current);
      if (recipientUids.length > 0) {
        notification = {
          type: 'accounting_closeout_completed',
          recipientUids,
          title: 'Accounting Closeout Complete',
          body: `${transaction.propertyAddress || transaction.address || 'A closed transaction'} has completed Accounting closeout.`,
        };
      }
    } else if (action === 'reopen') {
      closeout.status = 'in_progress';
      closeout.completedAt = null;
      closeout.completedBy = null;
      historyAction = 'Accounting closeout reopened';
      historyDetail = `${actor.name} reopened accounting closeout.`;
    } else if (action === 'save_notes') {
      closeout.notes = String(body.notes || '').trim();
      historyAction = 'Accounting notes updated';
      historyDetail = 'Accounting notes were updated.';
    } else {
      return error(400, 'Unsupported accounting action');
    }

    closeout.snapshot = buildAccountingSnapshot(transaction, transactionId);
    await txRef.set({
      accountingCloseout: closeout,
      departmentalProcessing: {
        ...(transaction.departmentalProcessing || {}),
        accounting: { status: closeout.status, assignedToUid: closeout.assignedToUid || null, updatedAt: now },
      },
      updatedAt: now,
    }, { merge: true });
    await writeProcessingHistory(adminDb, transactionId, { action: historyAction, detail: historyDetail, actor });

    // Delivery follows each recipient's global and per-event settings. A
    // channel being disabled, missing a phone, or lacking an email provider
    // never changes the saved accounting workflow state.
    if (notification && notification.recipientUids.length > 0) {
      await sendNotification(adminDb, {
        ...notification,
        url: `/dashboard/admin/accounting?transactionId=${transactionId}`,
        data: { transactionId },
      });
    }

    return NextResponse.json({ ok: true, accounting: serialize(closeout) });
  } catch (cause: any) {
    if (cause?.message === 'UNAUTHORIZED') return error(401, 'Unauthorized');
    if (cause?.message === 'FORBIDDEN') return error(403, 'Accounting or Office Admin access required');
    console.error('[accounting-closeout POST]', cause);
    return error(500, cause?.message || 'Unable to update accounting closeout');
  }
}
