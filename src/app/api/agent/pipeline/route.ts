// GET /api/agent/pipeline?year=YYYY
// Returns the logged-in agent's pending/closed transactions and opportunities.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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

/**
 * Resolve the agentId to use for Firestore queries.
 *
 * Transactions store `agentId` as the slug (e.g. "ashley-lombas") when entered
 * via the admin form (which uses agentProfiles doc IDs), but as the Firebase UID
 * when entered by the agent themselves.
 *
 * This function tries both the raw uid AND the slug from the agentProfile so we
 * always find the right transactions regardless of which path created them.
 */
async function resolveQueryIds(uid: string): Promise<string[]> {
  const ids = new Set<string>([uid]);
  try {
    // Strategy 1: uid IS the agentProfile doc ID (slug)
    const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byDocId.exists) {
      const data = byDocId.data() || {};
      if (data.agentId) ids.add(String(data.agentId));
    }
    // Strategy 2: agentProfile has a field agentId matching uid
    const byField = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid)
      .limit(1)
      .get();
    if (!byField.empty) {
      ids.add(byField.docs[0].id); // also add the doc ID (slug)
    }
  } catch (err: any) {
    console.warn('[api/agent/pipeline] resolveQueryIds failed:', err.message);
  }
  return Array.from(ids);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const isAdminCaller = await isAdminLike(decoded.uid);

    const { searchParams } = new URL(req.url);
    // Allow admin to view any agent's pipeline via ?viewAs=agentId
    const viewAs = searchParams.get('viewAs');
    const callerIsAdmin = await isAdminLike(decoded.uid);
    const uid = (viewAs && callerIsAdmin) ? viewAs : decoded.uid;
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);

    // Resolve all possible agentId values for this agent (slug + Firebase UID)
    const agentIds = await resolveQueryIds(uid);

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

    // Fetch transactions for all resolved IDs and merge results
    const allTxMap = new Map<string, any>();
    await Promise.all(
      agentIds.map(async (agentId) => {
        try {
          const snap = await adminDb
            .collection('transactions')
            .where('agentId', '==', agentId)
            .get();
          snap.docs.forEach(d => {
            if (!allTxMap.has(d.id)) {
              allTxMap.set(d.id, sanitizeForAgent({ id: d.id, ...serializeFirestore(d.data() || {}) }));
            }
          });
        } catch (err: any) {
          console.warn(`[api/agent/pipeline] Failed to fetch transactions for agentId=${agentId}:`, err.message);
        }
      })
    );

    const allTx = Array.from(allTxMap.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });

    const activeTransactions = allTx.filter((t: any) =>
      t.status === 'active' || t.status === 'temp_off_market'
    );

    const pendingTransactions = allTx.filter((t: any) =>
      t.status === 'pending' || t.status === 'under_contract'
    );

    // All closed transactions (all years) — client filters by year
    const allClosedTransactions = allTx.filter((t: any) => t.status === 'closed');

    const closedTransactions = allClosedTransactions.filter((t: any) => {
      if (t.year) return t.year === year;
      const dateStr: string = t.closedDate ?? t.closingDate ?? '';
      return dateStr.startsWith(String(year));
    });

    // Derive available closed years for the year selector
    const closedYears = Array.from(new Set(
      allClosedTransactions.map((t: any) => {
        if (t.year) return Number(t.year);
        const dateStr: string = t.closedDate ?? t.closingDate ?? '';
        const m = dateStr.match(/^(\d{4})/);
        return m ? Number(m[1]) : null;
      }).filter((y): y is number => y !== null)
    )).sort((a, b) => b - a);

    // Fetch active opportunities (single-field query + client filter to avoid composite index)
    let opportunities: any[] = [];
    try {
      const oppResults = await Promise.all(
        agentIds.map(agentId =>
          adminDb.collection('opportunities').where('agentId', '==', agentId).get()
        )
      );
      const oppMap = new Map<string, any>();
      oppResults.forEach(snap => {
        snap.docs.forEach(d => {
          if (!oppMap.has(d.id)) {
            oppMap.set(d.id, { id: d.id, ...serializeFirestore(d.data() || {}) });
          }
        });
      });
      opportunities = Array.from(oppMap.values()).filter((o: any) => o.isActive === true);
    } catch (oppErr: any) {
      console.warn('[api/agent/pipeline] Failed to fetch opportunities:', oppErr.message);
    }

    return NextResponse.json({
      ok: true,
      year,
      transactions: [...activeTransactions, ...pendingTransactions, ...closedTransactions],
      activeTransactions,
      pendingTransactions,
      closedTransactions,
      allClosedTransactions,
      closedYears,
      opportunities,
    });
  } catch (err: any) {
    console.error('[api/agent/pipeline]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
