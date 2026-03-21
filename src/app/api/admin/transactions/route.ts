// GET /api/admin/transactions — returns all transactions for admin ledger
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);

    if (decoded.email !== ADMIN_EMAIL) {
      return jsonError(403, 'Forbidden: Admin only');
    }

    const snap = await adminDb
      .collection('transactions')
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, transactions });
  } catch (err: any) {
    console.error('[api/admin/transactions GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
