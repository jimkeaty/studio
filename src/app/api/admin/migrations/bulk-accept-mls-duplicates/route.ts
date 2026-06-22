/**
 * POST /api/admin/migrations/bulk-accept-mls-duplicates
 *
 * Scans all transactions (optionally filtered by source and year range),
 * finds every duplicate group (same agent + normalized address, 2+ transactions),
 * and bulk-accepts them as legitimate in the `acceptedDuplicates` Firestore collection.
 *
 * Body:
 *   {
 *     yearFrom?: number,        // default 2004
 *     yearTo?:   number,        // default 2020
 *     sourceFilter?: string,    // 'mls_import' | 'import' | 'all' (default: 'all')
 *     dryRun?: boolean,         // default false — if true, returns what WOULD be accepted without writing
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     mode: 'DRY_RUN' | 'EXECUTE',
 *     totalTransactionsScanned: number,
 *     dupGroupsFound: number,
 *     alreadyAccepted: number,
 *     newlyAccepted: number,
 *     groups: { key, address, agent, txCount, years }[]
 *   }
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Mirror the exact normalization used by the Transaction Ledger duplicate finder */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ── Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const yearFrom: number = Number(body.yearFrom ?? 2004);
    const yearTo: number = Number(body.yearTo ?? 2020);
    const sourceFilter: string = body.sourceFilter ?? 'all'; // 'mls_import' | 'import' | 'all'
    const dryRun: boolean = body.dryRun === true;

    if (yearFrom > yearTo) {
      return jsonError(400, 'yearFrom must be <= yearTo');
    }

    // ── Load transactions in the year range ───────────────────────────────
    // We query each year separately because Firestore doesn't support range queries
    // on the same field as equality queries when combined with 'in'.
    // For large ranges we fetch all and filter client-side.
    let allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    if (sourceFilter === 'mls_import' || sourceFilter === 'import') {
      // Source-filtered query — fetch all with that source, then filter by year
      const snap = await adminDb
        .collection('transactions')
        .where('source', '==', sourceFilter)
        .get();
      allDocs = snap.docs.filter(d => {
        const y = Number(d.data().year ?? 0);
        return y >= yearFrom && y <= yearTo;
      });
    } else {
      // All sources — fetch by year range in chunks (Firestore doesn't support range on 'year')
      // We'll do it year-by-year for accuracy
      const yearList: number[] = [];
      for (let y = yearFrom; y <= yearTo; y++) yearList.push(y);

      // Batch into groups of 10 (Firestore 'in' limit)
      const CHUNK = 10;
      for (let i = 0; i < yearList.length; i += CHUNK) {
        const chunk = yearList.slice(i, i + CHUNK);
        const snap = await adminDb
          .collection('transactions')
          .where('year', 'in', chunk)
          .get();
        allDocs.push(...snap.docs);
      }
    }

    // ── Build duplicate groups ─────────────────────────────────────────────
    const groupMap = new Map<string, {
      key: string;
      address: string;
      agent: string;
      txIds: string[];
      years: Set<number>;
    }>();

    for (const doc of allDocs) {
      const d = doc.data();
      const agentRaw = String(d.agentDisplayName || d.agentName || d.agentId || '').trim();
      const addrRaw = String(d.address || d.propertyAddress || '').trim();
      const agent = normalize(agentRaw);
      const addr = normalize(addrRaw);
      if (!agent || !addr) continue;

      const key = `${agent}|||${addr}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          address: addrRaw,
          agent: agentRaw,
          txIds: [],
          years: new Set(),
        });
      }
      const g = groupMap.get(key)!;
      g.txIds.push(doc.id);
      if (d.year) g.years.add(Number(d.year));
    }

    // Keep only groups with 2+ transactions (actual duplicates)
    const dupGroups = Array.from(groupMap.values()).filter(g => g.txIds.length > 1);

    // ── Check which keys are already accepted ─────────────────────────────
    const existingSnap = await adminDb.collection('acceptedDuplicates').get();
    const existingKeys = new Set(
      existingSnap.docs.map(d => {
        const data = d.data();
        if (data.key && typeof data.key === 'string') return data.key;
        try { return Buffer.from(d.id, 'base64url').toString('utf8'); } catch { return d.id; }
      })
    );

    const newGroups = dupGroups.filter(g => !existingKeys.has(g.key));
    const alreadyAccepted = dupGroups.length - newGroups.length;

    // ── Persist new accepted keys (unless dry run) ────────────────────────
    if (!dryRun && newGroups.length > 0) {
      const BATCH_SIZE = 400;
      for (let i = 0; i < newGroups.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = newGroups.slice(i, i + BATCH_SIZE);
        for (const g of chunk) {
          const docId = Buffer.from(g.key).toString('base64url');
          batch.set(
            adminDb.collection('acceptedDuplicates').doc(docId),
            {
              key: g.key,
              acceptedBy: `bulk-mls-accept-${yearFrom}-${yearTo}`,
              acceptedAt: new Date().toISOString(),
              source: 'bulk_mls_accept',
              yearFrom,
              yearTo,
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
    }

    // ── Return summary ────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
      yearFrom,
      yearTo,
      sourceFilter,
      totalTransactionsScanned: allDocs.length,
      dupGroupsFound: dupGroups.length,
      alreadyAccepted,
      newlyAccepted: dryRun ? 0 : newGroups.length,
      wouldAccept: dryRun ? newGroups.length : undefined,
      groups: dupGroups.map(g => ({
        key: g.key,
        address: g.address,
        agent: g.agent,
        txCount: g.txIds.length,
        years: Array.from(g.years).sort((a, b) => a - b),
        alreadyAccepted: existingKeys.has(g.key),
      })),
    });
  } catch (err: any) {
    console.error('[bulk-accept-mls-duplicates]', err);
    return jsonError(500, err.message ?? 'Internal Server Error');
  }
}
