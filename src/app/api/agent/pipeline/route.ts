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
async function resolveQueryIds(uid: string, email?: string): Promise<string[]> {
  const ids = new Set<string>([uid]);
  try {
    // Strategy 1: uid IS the agentProfile doc ID
    // Always add both the doc ID AND the agentId field value.
    const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byDocId.exists) {
      const data = byDocId.data() || {};
      ids.add(uid); // doc ID itself (already in set, but explicit)
      if (data.agentId) ids.add(String(data.agentId));
      // Also stamp firebaseUid if missing so Strategy 4 works on next call
      if (!data.firebaseUid) {
        try { await adminDb.collection('agentProfiles').doc(uid).update({ firebaseUid: uid }); } catch { /* non-fatal */ }
      }
    }
    // Strategy 2: agentProfile has a field agentId matching uid
    const byField = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid)
      .limit(1)
      .get();
    if (!byField.empty) {
      const profileDoc = byField.docs[0];
      ids.add(profileDoc.id); // also add the doc ID (slug)
      // ── Write-back: stamp firebaseUid on the agentProfile so notification lookups work ──
      // This is idempotent — only writes if the field is missing or empty.
      const existingUid = profileDoc.data()?.firebaseUid;
      if (!existingUid) {
        try {
          await adminDb.collection('agentProfiles').doc(profileDoc.id).update({ firebaseUid: uid });
        } catch { /* non-fatal */ }
      }
    }
    // Strategy 3: users/{uid} has an agentId field (set by the admin link-agent route)
    // This is the primary link for agents who log in with their own Firebase account.
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        const linkedAgentId = userData.agentId ? String(userData.agentId) : null;
        if (linkedAgentId) {
          ids.add(linkedAgentId);
          // Also add the agentProfile doc ID (slug) if it differs from linkedAgentId
          const profileSnap = await adminDb.collection('agentProfiles').doc(linkedAgentId).get();
          if (profileSnap.exists) {
            ids.add(linkedAgentId); // already added, but also stamp firebaseUid
            const existingUid = profileSnap.data()?.firebaseUid;
            if (!existingUid) {
              try {
                await adminDb.collection('agentProfiles').doc(linkedAgentId).update({ firebaseUid: uid });
              } catch { /* non-fatal */ }
            }
          }
        }
      }
    } catch { /* non-fatal */ }
    // Strategy 4: agentProfile has firebaseUid field matching uid
    try {
      const byFirebaseUid = await adminDb.collection('agentProfiles')
        .where('firebaseUid', '==', uid)
        .limit(1)
        .get();
      if (!byFirebaseUid.empty) {
        const profileDoc = byFirebaseUid.docs[0];
        ids.add(profileDoc.id); // slug
        const data = profileDoc.data() || {};
        if (data.agentId) ids.add(String(data.agentId));
        // Stamp firebaseUid if missing
        if (!data.firebaseUid) {
          try { await adminDb.collection('agentProfiles').doc(profileDoc.id).update({ firebaseUid: uid }); } catch { /* non-fatal */ }
        }
      }
    } catch { /* non-fatal */ }
    // Strategy 5: look up agentProfile by email — the most reliable cross-reference
    // when the Firebase Auth UID doesn't match the agentProfiles doc ID.
    if (email) {
      try {
        const byEmail = await adminDb.collection('agentProfiles')
          .where('email', '==', email)
          .limit(1)
          .get();
        if (!byEmail.empty) {
          const profileDoc = byEmail.docs[0];
          ids.add(profileDoc.id); // profile doc ID (may be old UID or slug)
          const data = profileDoc.data() || {};
          if (data.agentId) ids.add(String(data.agentId));
          // Stamp firebaseUid on the profile so future logins use Strategy 4 (faster)
          if (!data.firebaseUid || data.firebaseUid !== uid) {
            try { await adminDb.collection('agentProfiles').doc(profileDoc.id).update({ firebaseUid: uid }); } catch { /* non-fatal */ }
          }
          console.log(`[api/agent/pipeline] Strategy 5 matched profile ${profileDoc.id} via email ${email}`);
        }
      } catch { /* non-fatal */ }
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

    // Resolve all possible agentId values for this agent (slug + Firebase UID + email).
    // IMPORTANT: when viewAs is active, do NOT pass the caller's email — that would cause
    // Strategy 5 to match the broker's own agentProfile and add the broker's transactions.
    // Only pass the email when the caller is viewing their own pipeline.
    const resolveEmail = (viewAs && callerIsAdmin) ? undefined : decoded.email;
    const agentIds = await resolveQueryIds(uid, resolveEmail);

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
      // For active listings: expose commission fields needed to estimate net to agent
      // (sellerPayingListingAgent = listing side %, agentSplitPercent = agent's take-home %)
      if (tx.status === 'active') {
        if (tx.sellerPayingListingAgent != null) safe.sellerPayingListingAgent = tx.sellerPayingListingAgent;
        if (tx.sellerPayingBuyerAgent != null) safe.sellerPayingBuyerAgent = tx.sellerPayingBuyerAgent;
        if (tx.commissionPercent != null) safe.commissionPercent = tx.commissionPercent;
        // Prefer split % stored on the transaction; fall back to agent's current plan split %
        const agentSplitPct = snap?.agentSplitPercent ?? tx.agentPct ?? agentCurrentSplitPct ?? null;
        if (agentSplitPct != null) safe.agentSplitPercent = agentSplitPct;

      }
      return safe;
    }

    // Fetch the agent's current split % from their profile (for active listing estimates)
    // We look up the first agentId that has a profile with tiers or flat plan.
    let agentCurrentSplitPct: number | null = null;
    if (!isAdminCaller) {
      try {
        // Helper: extract split % from a profile data object
        // Checks all known nesting paths for commission plan data.
        function extractSplitPct(pd: any): number | null {
          if (!pd) return null;
          // Unwrap nested commission plan if present
          const plan = pd.commissionPlan || pd.commission || pd.commissionStructure || null;
          const planType = (plan?.planType || plan?.type || pd.commissionMode || '').toLowerCase();
          if (planType === 'flat') {
            return Number(
              plan?.flatAgentPercent ?? plan?.agentPercent ?? plan?.agentSplitPercent ??
              pd.flatAgentPercent ?? pd.agentPercent ?? 0
            ) || null;
          }
          // Tiered — try nested plan first, then top-level
          const tiers: any[] = plan?.tiers || plan?.commissionTiers || pd.tiers || pd.commissionTiers || [];
          if (Array.isArray(tiers) && tiers.length > 0) {
            return Number(tiers[0].agentSplitPercent ?? tiers[0].agentPercent ?? 0) || null;
          }
          // Last resort: direct agentSplitPercent on profile
          return Number(pd.agentSplitPercent ?? pd.agentPercent ?? 0) || null;
        }

        // Strategy 1: direct doc lookup by each resolved agentId
        for (const agentId of agentIds) {
          const profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
          if (profileSnap.exists) {
            const pct = extractSplitPct(profileSnap.data());
            if (pct) { agentCurrentSplitPct = pct; break; }
          }
        }

        // Strategy 2: query by firebaseUid field (for agents whose profile doc ID is a slug)
        if (!agentCurrentSplitPct) {
          for (const agentId of agentIds) {
            const byUid = await adminDb.collection('agentProfiles')
              .where('firebaseUid', '==', agentId)
              .limit(1).get();
            if (!byUid.empty) {
              const pct = extractSplitPct(byUid.docs[0].data());
              if (pct) { agentCurrentSplitPct = pct; break; }
            }
          }
        }

        // Strategy 3: query by agentId field
        if (!agentCurrentSplitPct) {
          for (const agentId of agentIds) {
            const byAgentId = await adminDb.collection('agentProfiles')
              .where('agentId', '==', agentId)
              .limit(1).get();
            if (!byAgentId.empty) {
              const pct = extractSplitPct(byAgentId.docs[0].data());
              if (pct) { agentCurrentSplitPct = pct; break; }
            }
          }
        }
      } catch { /* non-fatal */ }
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

    // Also fetch transactions where this agent is the co-agent (pre-close shared view)
    // These are read-only for the co-agent — they see the same document as the primary agent.
    // At close the split creates separate transactions per agent, so source === 'co_agent_split'
    // transactions are already picked up by the primary agentId query above.
    try {
      await Promise.all(
        agentIds.map(async (agentId) => {
          try {
            const coSnap = await adminDb
              .collection('transactions')
              .where('coAgent.agentId', '==', agentId)
              .get();
            coSnap.docs.forEach(d => {
              if (!allTxMap.has(d.id)) {
                // Mark as co-agent view so the UI can render read-only badge
                const tx = sanitizeForAgent({ id: d.id, ...serializeFirestore(d.data() || {}) });
                tx._isCoAgentView = true;
                // For the co-agent, expose their own net income from coAgent.splitSnapshot
                if (!isAdminCaller) {
                  const coSnap2 = (d.data() as any)?.coAgent?.splitSnapshot;
                  tx.netIncome = coSnap2?.agentNetCommission ?? null;
                }
                allTxMap.set(d.id, tx);
              }
            });
          } catch (err: any) {
            console.warn(`[api/agent/pipeline] Failed to fetch co-agent transactions for agentId=${agentId}:`, err.message);
          }
        })
      );
    } catch {
      // Non-fatal: composite index may not exist yet
    }

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
