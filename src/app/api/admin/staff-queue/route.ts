// GET  /api/admin/staff-queue — fetch staff queue items
// POST /api/admin/staff-queue — create a new staff queue item (internal use)
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

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isStaff(decoded.uid))) return jsonError(403, 'Forbidden: Staff only');

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const activeOnly = url.searchParams.get('active') === 'true';

    let query: FirebaseFirestore.Query = adminDb.collection('staffQueue').limit(500);

    if (activeOnly) {
      query = adminDb
        .collection('staffQueue')
        .where('status', 'in', ['pending_review', 'in_progress'])
        .limit(500);
    } else if (statusFilter && statusFilter !== 'all') {
      query = adminDb
        .collection('staffQueue')
        .where('status', '==', statusFilter)
        .limit(500);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...serializeFirestore(d.data()),
    }));

    // Sort: pending_review first, then in_progress, then completed/dismissed
    const order: Record<string, number> = { pending_review: 0, in_progress: 1, completed: 2, dismissed: 3 };
    items.sort((a: any, b: any) => {
      const ao = order[a.status] ?? 99;
      const bo = order[b.status] ?? 99;
      if (ao !== bo) return ao - bo;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    // Allow any authenticated user to create a staff queue item (agents, TC, admin)
    await adminAuth.verifyIdToken(token);

    const body = await req.json();
    const {
      transactionId,
      transactionAddress,
      agentId,
      agentName,
      actionType,       // 'new_listing' | 'status_change' | 'update'
      previousStatus,
      newStatus,
      notes,
      submittedBy,      // uid of the user who triggered this
      submittedByName,
      tcWorking,        // boolean — whether agent is working with TC
    } = body;

    if (!transactionId || !actionType) {
      return jsonError(400, 'transactionId and actionType are required');
    }

    const now = new Date().toISOString();
    const item = {
      transactionId,
      transactionAddress: transactionAddress || '',
      agentId: agentId || '',
      agentName: agentName || '',
      actionType,
      previousStatus: previousStatus || null,
      newStatus: newStatus || null,
      notes: notes || '',
      submittedBy: submittedBy || '',
      submittedByName: submittedByName || '',
      tcWorking: tcWorking ?? false,
      status: 'pending_review',   // pending_review | in_progress | completed | dismissed
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      staffNotes: '',
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('staffQueue').add(item);
    return NextResponse.json({ ok: true, id: ref.id, item: { id: ref.id, ...item } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
