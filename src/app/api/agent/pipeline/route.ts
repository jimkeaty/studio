// GET /api/agent/pipeline?year=YYYY
// Returns the logged-in agent's pending/closed transactions and opportunities.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Recursively convert Firestore Timestamps to ISO strings */
function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
    const isAdminCaller = decoded.uid === ADMIN_UID;

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

    // Strip commission split fields for non-admin callers.
    // Agents only see their net income; all gross commission, broker retained,
    // and split percentage fields are removed at the API layer.
    const COMMISSION_FIELDS = [
      'splitSnapshot', 'commission', 'brokerProfit', 'gci',
      'agentPct', 'brokerPct', 'grossCommission', 'companyRetained',
      'agentSplitPercent', 'companySplitPercent',
    ];

    function sanitizeForAgent(tx: any): any {
      if (isAdminCaller) return tx;
      const safe: any = {};
      for (const [k, v] of Object.entries(tx)) {
        if (COMMISSION_FIELDS.includes(k)) continue;
        safe[k] = v;
      }
      // Re-attach only the agent's own net income (not the full splitSnapshot)
      const snap = tx.splitSnapshot as any;
      const netIncome = snap?.agentNetCommission ?? tx.netCommission ?? null;
      if (netIncome !== null) safe.netIncome = netIncome;
      return safe;
    }

    const allTx = txSnap.docs
      .map(d => sanitizeForAgent({ id: d.id, ...serializeFirestore(d.data() || {}) }))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime() || 0;
        const bTime = new Date(b.createdAt || 0).getTime() || 0;
        return bTime - aTime;
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

    // Fetch active opportunities (single-field query + client filter to avoid composite index)
    let opportunities: any[] = [];
    try {
      const oppSnap = await adminDb
        .collection('opportunities')
        .where('agentId', '==', uid)
        .get();

      opportunities = oppSnap.docs
        .map(d => ({ id: d.id, ...serializeFirestore(d.data() || {}) }))
        .filter((o: any) => o.isActive === true);
    } catch (oppErr: any) {
      console.warn('[api/agent/pipeline] Failed to fetch opportunities:', oppErr.message);
    }

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
