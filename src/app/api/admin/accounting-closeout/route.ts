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
    const snap = await adminDb.collection('transactions').where('status', '==', 'closed').limit(1000).get();
    const items = snap.docs
      .map((doc) => {
        const transaction = doc.data() as Record<string, any>;
        const accounting = transaction.accountingCloseout as Record<string, any> | undefined;
        if (!accounting || !accounting.status) return null;
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
      const tcUids = await getTcUids(adminDb);
      if (tcUids.length > 0) {
        await sendNotification(adminDb, {
          type: 'accounting_closeout_attention',
          recipientUids: tcUids,
          title: 'Accounting Needs Information',
          body: `${transaction.propertyAddress || transaction.address || 'A closed transaction'} needs: ${request}`,
          url: `/dashboard/admin/accounting?transactionId=${transactionId}`,
          data: { transactionId },
        });
      }
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

    return NextResponse.json({ ok: true, accounting: serialize(closeout) });
  } catch (cause: any) {
    if (cause?.message === 'UNAUTHORIZED') return error(401, 'Unauthorized');
    if (cause?.message === 'FORBIDDEN') return error(403, 'Accounting or Office Admin access required');
    console.error('[accounting-closeout POST]', cause);
    return error(500, cause?.message || 'Unable to update accounting closeout');
  }
}
