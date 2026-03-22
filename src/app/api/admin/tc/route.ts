// GET /api/admin/tc — admin fetches all TC intakes
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

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
    if (decoded.email !== ADMIN_EMAIL) return jsonError(403, 'Forbidden: Admin only');

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status'); // optional

    let query: FirebaseFirestore.Query = adminDb
      .collection('transactionIntakes')
      .orderBy('submittedAt', 'desc')
      .limit(500);

    if (statusFilter && statusFilter !== 'all') {
      query = adminDb
        .collection('transactionIntakes')
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
      };
    });

    return NextResponse.json({ ok: true, intakes });
  } catch (err: any) {
    console.error('[GET /api/admin/tc]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
