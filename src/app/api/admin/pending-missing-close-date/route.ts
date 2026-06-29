// GET /api/admin/pending-missing-close-date
// Temporary diagnostic route: returns all pending/under_contract transactions
// that have no projectedCloseDate set. Used to identify deals that need a
// projected close date before the pending-in-projected-month feature goes live.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all pending and under_contract transactions
    const [pendingSnap, ucSnap] = await Promise.all([
      adminDb.collection('transactions').where('status', '==', 'pending').get(),
      adminDb.collection('transactions').where('status', '==', 'under_contract').get(),
    ]);

    const allDocs = [...pendingSnap.docs, ...ucSnap.docs];

    const missing: {
      id: string;
      status: string;
      agentId: string;
      agentDisplayName: string;
      address: string;
      contractDate: string | null;
      salePrice: number | null;
      projectedCloseDate: string | null;
    }[] = [];

    for (const doc of allDocs) {
      const d = doc.data();
      const projected = toDateStr(d.projectedCloseDate) || toDateStr(d.projectedClosingDate) || toDateStr(d.projectedClose);
      if (!projected) {
        missing.push({
          id: doc.id,
          status: d.status || '',
          agentId: d.agentId || '',
          agentDisplayName: d.agentDisplayName || d.agentName || '',
          address: d.address || d.propertyAddress || '',
          contractDate: toDateStr(d.contractDate),
          salePrice: d.salePrice ? Number(d.salePrice) : (d.listPrice ? Number(d.listPrice) : null),
          projectedCloseDate: null,
        });
      }
    }

    // Sort by agent name then address
    missing.sort((a, b) => {
      const an = (a.agentDisplayName || a.agentId).toLowerCase();
      const bn = (b.agentDisplayName || b.agentId).toLowerCase();
      if (an !== bn) return an.localeCompare(bn);
      return (a.address || '').localeCompare(b.address || '');
    });

    return NextResponse.json({
      ok: true,
      count: missing.length,
      transactions: missing,
    });
  } catch (err: any) {
    console.error('[pending-missing-close-date]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
