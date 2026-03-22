// src/app/api/admin/debug-transactions/route.ts
// GET /api/admin/debug-transactions?year=2026 — diagnostic endpoint
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');

    // Query with year filter
    let query: FirebaseFirestore.Query = adminDb.collection('transactions');
    if (year) {
      query = query.where('year', '==', Number(year));
    }

    const snap = await query.limit(20).get();

    const docs = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        agentId: d.agentId,
        agentDisplayName: d.agentDisplayName,
        status: d.status,
        year: d.year,
        yearType: typeof d.year,
        closedDate: d.closedDate,
        closedDateType: typeof d.closedDate,
        contractDate: d.contractDate,
        dealValue: d.dealValue,
        brokerProfit: d.brokerProfit,
        brokerProfitExists: 'brokerProfit' in d,
        transactionType: d.transactionType,
        source: d.source,
        splitSnapshot: d.splitSnapshot
          ? {
              grossCommission: d.splitSnapshot.grossCommission,
              companyRetained: d.splitSnapshot.companyRetained,
              agentNetCommission: d.splitSnapshot.agentNetCommission,
            }
          : null,
      };
    });

    // Also check: how many total with this year?
    let totalCount = 0;
    if (year) {
      const countSnap = await adminDb.collection('transactions').where('year', '==', Number(year)).get();
      totalCount = countSnap.size;
    }

    // Also try querying without year filter to see all years
    const allSnap = await adminDb.collection('transactions').limit(5000).get();
    const yearCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    allSnap.docs.forEach((doc) => {
      const d = doc.data();
      const y = String(d.year ?? 'undefined');
      yearCounts[y] = (yearCounts[y] || 0) + 1;
      const s = String(d.status ?? 'undefined');
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    return NextResponse.json({
      query: { year, yearAsNumber: year ? Number(year) : null },
      totalForYear: totalCount,
      totalInCollection: allSnap.size,
      yearDistribution: yearCounts,
      statusDistribution: statusCounts,
      sampleDocs: docs,
    });
  } catch (err: any) {
    console.error('[debug-transactions]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
