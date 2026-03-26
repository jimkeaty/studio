// GET /api/agent/pipeline?year=YYYY
// Returns the logged-in agent's pending/closed transactions and opportunities.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

    const { searchParams } = new URL(req.url);
    // Allow admin to view any agent's pipeline via ?viewAs=agentId
    const viewAs = searchParams.get('viewAs');
    const uid = (viewAs && decoded.uid === ADMIN_UID) ? viewAs : decoded.uid;
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);

    // Fetch all agent transactions
    // Note: no orderBy to avoid requiring a composite index
    const txSnap = await adminDb
      .collection('transactions')
      .where('agentId', '==', uid)
      .get();

    const allTx = txSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => {
        const aDate = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
        const bDate = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
        return bDate.getTime() - aDate.getTime();
      });

    const pendingTransactions = allTx.filter((t: any) =>
      t.status === 'pending' || t.status === 'under_contract'
    );

    const closedTransactions = allTx.filter((t: any) => {
      if (t.status !== 'closed') return false;
      if (t.year) return t.year === year;
      const dateStr: string = t.closedDate ?? t.closingDate ?? '';
      return dateStr.startsWith(String(year));
    });

    // Fetch active opportunities
    const oppSnap = await adminDb
      .collection('opportunities')
      .where('agentId', '==', uid)
      .where('isActive', '==', true)
      .get();

    const opportunities = oppSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      ok: true,
      year,
      transactions: [...pendingTransactions, ...closedTransactions],
      pendingTransactions,
      closedTransactions,
      opportunities,
    });
  } catch (err: any) {
    console.error('[api/agent/pipeline]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
