// GET    /api/admin/staff-queue/[itemId] — fetch a single staff queue item
// PATCH  /api/admin/staff-queue/[itemId] — update, approve, or dismiss a staff queue item
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) out[k] = serializeFirestore(v);
    return out;
  }
  return val;
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// Fields that staff can edit on the linked transaction when reviewing a queue item
const EDITABLE_TX_FIELDS = new Set([
  'status', 'address', 'clientName', 'clientEmail', 'clientPhone', 'clientType',
  'buyerName', 'buyerEmail', 'buyerPhone', 'buyer2Name', 'buyer2Email', 'buyer2Phone',
  'sellerName', 'sellerEmail', 'sellerPhone', 'seller2Name', 'seller2Email', 'seller2Phone',
  'otherAgentName', 'otherAgentEmail', 'otherAgentPhone', 'otherBrokerage',
  'listPrice', 'salePrice', 'dealValue', 'commissionPercent', 'gci', 'transactionFee',
  'contractDate', 'closedDate', 'listingDate', 'projectedCloseDate', 'inspectionDeadline',
  'optionExpiration', 'surveyDeadline',
  'mortgageCompany', 'loanOfficer', 'loanOfficerEmail', 'loanOfficerPhone',
  'titleCompany', 'titleOfficer', 'titleOfficerEmail', 'titleOfficerPhone',
  'notes', 'additionalComments', 'staffNotes',
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const doc = await adminDb.collection('staffQueue').doc(params.itemId).get();
    if (!doc.exists) return jsonError(404, 'Staff queue item not found');

    // Also fetch the linked transaction for full detail view
    const item = serializeFirestore(doc.data());
    let transaction = null;
    if (item.transactionId) {
      const txDoc = await adminDb.collection('transactions').doc(item.transactionId).get();
      if (txDoc.exists) {
        transaction = serializeFirestore(txDoc.data());
        transaction.id = txDoc.id;
      }
    }

    return NextResponse.json({ ok: true, item: { id: doc.id, ...item }, transaction });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const body = await req.json();
    const { action, txUpdates, staffNotes, queueStatus } = body;
    // action: 'update_tx' | 'complete' | 'dismiss' | 'start_review'

    const itemRef = adminDb.collection('staffQueue').doc(params.itemId);
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) return jsonError(404, 'Staff queue item not found');

    const item = itemDoc.data() as any;
    const now = new Date().toISOString();

    // Get reviewer display name
    const userRecord = await adminAuth.getUser(decoded.uid).catch(() => null);
    const reviewerName = userRecord?.displayName || userRecord?.email || decoded.uid;

    // ── Apply transaction field updates ─────────────────────────────────────
    if (txUpdates && item.transactionId) {
      const txRef = adminDb.collection('transactions').doc(item.transactionId);
      const allowed: Record<string, any> = {};
      for (const [k, v] of Object.entries(txUpdates)) {
        if (EDITABLE_TX_FIELDS.has(k)) allowed[k] = v;
      }
      if (Object.keys(allowed).length > 0) {
        allowed.updatedAt = now;
        await txRef.update(allowed);
      }
    }

    // ── Update the queue item itself ─────────────────────────────────────────
    const itemUpdates: Record<string, any> = { updatedAt: now };

    if (staffNotes !== undefined) itemUpdates.staffNotes = staffNotes;

    if (action === 'start_review') {
      itemUpdates.status = 'in_progress';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
    } else if (action === 'complete') {
      itemUpdates.status = 'completed';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
      itemUpdates.reviewedAt = now;
    } else if (action === 'dismiss') {
      itemUpdates.status = 'dismissed';
      itemUpdates.reviewedBy = decoded.uid;
      itemUpdates.reviewedByName = reviewerName;
      itemUpdates.reviewedAt = now;
    } else if (queueStatus) {
      itemUpdates.status = queueStatus;
    }

    await itemRef.update(itemUpdates);

    return NextResponse.json({ ok: true, updated: { id: params.itemId, ...itemUpdates } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
