// GET /api/admin/tc — admin fetches all TC intakes
// POST /api/admin/tc — create a new TC intake (agent submits to TC queue)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

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
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden: Admin only');

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status'); // optional

    let query: FirebaseFirestore.Query = adminDb
      .collection('tcIntakes')
      .orderBy('submittedAt', 'desc')
      .limit(500);

    if (statusFilter && statusFilter !== 'all') {
      query = adminDb
        .collection('tcIntakes')
        .where('status', '==', statusFilter)
        .orderBy('submittedAt', 'desc')
        .limit(500);
    }

    const snap = await query.get();
    const intakes = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() ?? data.submittedAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() ?? data.reviewedAt,
        contractDate: data.contractDate?.toDate?.()?.toISOString() ?? data.contractDate,
        projectedCloseDate: data.projectedCloseDate?.toDate?.()?.toISOString() ?? data.projectedCloseDate,
      };
    });

    return NextResponse.json({ ok: true, intakes });
  } catch (err: any) {
    console.error('[GET /api/admin/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();

    const {
      agentId,
      agentDisplayName,
      address,
      clientName,
      closingType,
      dealType,
      salePrice,
      gci,
      contractDate,
      projectedCloseDate,
      transactionId,
    } = body;

    if (!agentId || !address) {
      return jsonError(400, 'Missing required fields: agentId and address');
    }

    const now = new Date();

    const intakeData: Record<string, any> = {
      agentId: agentId.trim(),
      agentDisplayName: (agentDisplayName || '').trim(),
      address: address.trim(),
      clientName: (clientName || '').trim(),
      closingType: closingType || null,
      dealType: dealType || null,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
      salePrice: salePrice != null ? Number(salePrice) : null,
      gci: gci != null ? Number(gci) : null,
      contractDate: contractDate || null,
      projectedCloseDate: projectedCloseDate || null,
      transactionId: transactionId || null,
      assignedTcProfileId: null,
    };

    const docRef = await adminDb.collection('tcIntakes').add(intakeData);

    // Create default checklist items as a subcollection
    const defaultChecklist = [
      { order: 1, label: 'Contract received & verified' },
      { order: 2, label: 'Earnest money deposit confirmed' },
      { order: 3, label: 'Title company ordered' },
      { order: 4, label: 'Home inspection scheduled' },
      { order: 5, label: 'Home inspection completed' },
      { order: 6, label: 'Appraisal ordered' },
      { order: 7, label: 'Appraisal received' },
      { order: 8, label: 'Loan approval received' },
      { order: 9, label: 'Title commitment reviewed' },
      { order: 10, label: 'Survey ordered/received' },
      { order: 11, label: 'HOA docs requested (if applicable)' },
      { order: 12, label: 'Final walkthrough scheduled' },
      { order: 13, label: 'Closing disclosure reviewed' },
      { order: 14, label: 'Closing documents prepared' },
      { order: 15, label: 'Commission disbursement verified' },
      { order: 16, label: 'File closed & archived' },
    ];

    const batch = adminDb.batch();
    for (const item of defaultChecklist) {
      const itemRef = adminDb
        .collection('tcIntakes')
        .doc(docRef.id)
        .collection('checklist')
        .doc(`item_${String(item.order).padStart(2, '0')}`);
      batch.set(itemRef, {
        order: item.order,
        label: item.label,
        completed: false,
        completedBy: null,
        completedAt: null,
      });
    }
    await batch.commit();

    return NextResponse.json({ ok: true, intakeId: docRef.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
