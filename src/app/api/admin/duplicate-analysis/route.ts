/**
 * GET /api/admin/duplicate-analysis
 *
 * Scans all transactions, builds duplicate groups (same agent + normalized address),
 * and categorizes each group by what differs between the transactions:
 *
 * Categories:
 *   - TRUE_DUPLICATE:    same close date AND same contract date AND same sale price → real dup
 *   - DIFF_DATE:         different close date or contract date → likely separate sales
 *   - DIFF_PRICE:        different sale price (dates may match) → likely separate sales
 *   - DIFF_AGENT:        different agent on same address → co-list or separate agent
 *   - MISSING_DATES:     one or more transactions have no close date → can't determine
 *   - ALREADY_ACCEPTED:  key is already in acceptedDuplicates collection
 *
 * Query params:
 *   yearFrom  (default 2004)
 *   yearTo    (default current year)
 *   category  filter by category (optional)
 *   limit     max groups to return (default 500)
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  if (val?.toDate) return val.toDate().toISOString().slice(0, 10);
  return null;
}

function extractPrice(val: any): number | null {
  if (!val) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ── Params ────────────────────────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const yearFrom = Number(searchParams.get('yearFrom') ?? 2004);
    const yearTo = Number(searchParams.get('yearTo') ?? new Date().getFullYear());
    const categoryFilter = searchParams.get('category') ?? 'all';
    const limit = Math.min(Number(searchParams.get('limit') ?? 500), 2000);

    // ── Load transactions in year range ───────────────────────────────────
    const CHUNK = 10;
    const yearList: number[] = [];
    for (let y = yearFrom; y <= yearTo; y++) yearList.push(y);

    let allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let i = 0; i < yearList.length; i += CHUNK) {
      const chunk = yearList.slice(i, i + CHUNK);
      const snap = await adminDb.collection('transactions').where('year', 'in', chunk).get();
      allDocs.push(...snap.docs);
    }
    // Also include active/pending (no year set) if yearTo >= current year
    if (yearTo >= new Date().getFullYear()) {
      const openSnap = await adminDb
        .collection('transactions')
        .where('status', 'in', ['active', 'pending', 'temp_off_market'])
        .get();
      const existingIds = new Set(allDocs.map(d => d.id));
      openSnap.docs.forEach(d => { if (!existingIds.has(d.id)) allDocs.push(d); });
    }

    // ── Load already-accepted keys ─────────────────────────────────────────
    const acceptedSnap = await adminDb.collection('acceptedDuplicates').get();
    const acceptedKeys = new Set(
      acceptedSnap.docs.map(d => {
        const data = d.data();
        if (data.key && typeof data.key === 'string') return data.key as string;
        try { return Buffer.from(d.id, 'base64url').toString('utf8'); } catch { return d.id; }
      })
    );

    // ── Build duplicate groups ─────────────────────────────────────────────
    type TxRow = {
      id: string;
      agent: string;
      agentRaw: string;
      address: string;
      addressRaw: string;
      status: string;
      closeDate: string | null;
      contractDate: string | null;
      salePrice: number | null;
      listPrice: number | null;
      listingDate: string | null;
      year: number | null;
      source: string | null;
      mlsListNumber: string | null;
    };

    const groupMap = new Map<string, TxRow[]>();

    for (const doc of allDocs) {
      const d = doc.data();
      const agentRaw = String(d.agentDisplayName || d.agentName || d.agentId || '').trim();
      const addrRaw = String(d.address || d.propertyAddress || '').trim();
      const agent = normalize(agentRaw);
      const addr = normalize(addrRaw);
      if (!agent || !addr) continue;

      const key = `${agent}|||${addr}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push({
        id: doc.id,
        agent,
        agentRaw,
        address: addr,
        addressRaw: addrRaw,
        status: String(d.status ?? ''),
        closeDate: extractDate(d.closedDate ?? d.closeDate ?? d.soldDate),
        contractDate: extractDate(d.contractDate),
        salePrice: extractPrice(d.salePrice ?? d.dealValue),
        listPrice: extractPrice(d.listPrice),
        listingDate: extractDate(d.listingDate),
        year: d.year ? Number(d.year) : null,
        source: d.source ?? null,
        mlsListNumber: d.mlsListNumber ?? null,
      });
    }

    // ── Categorize each group ─────────────────────────────────────────────
    type GroupCategory = 'TRUE_DUPLICATE' | 'DIFF_DATE' | 'DIFF_PRICE' | 'DIFF_AGENT' | 'MISSING_DATES' | 'ALREADY_ACCEPTED';

    type GroupResult = {
      key: string;
      category: GroupCategory;
      reason: string;
      addressRaw: string;
      agentRaw: string;
      txCount: number;
      transactions: {
        id: string;
        status: string;
        closeDate: string | null;
        contractDate: string | null;
        salePrice: number | null;
        listPrice: number | null;
        listingDate: string | null;
        year: number | null;
        source: string | null;
        mlsListNumber: string | null;
        agentRaw: string;
      }[];
    };

    const groups: GroupResult[] = [];

    for (const [key, txs] of groupMap.entries()) {
      if (txs.length < 2) continue;

      const addressRaw = txs[0].addressRaw;
      const agentRaw = txs[0].agentRaw;

      // Already accepted?
      if (acceptedKeys.has(key)) {
        groups.push({
          key, category: 'ALREADY_ACCEPTED',
          reason: 'Already marked as legitimate in acceptedDuplicates',
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Different agents on same address?
      const uniqueAgents = new Set(txs.map(t => t.agent));
      if (uniqueAgents.size > 1) {
        groups.push({
          key, category: 'DIFF_AGENT',
          reason: `${uniqueAgents.size} different agents on same address`,
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Check dates
      const closeDates = txs.map(t => t.closeDate);
      const contractDates = txs.map(t => t.contractDate);
      const salePrices = txs.map(t => t.salePrice);

      const hasAnyMissingCloseDate = closeDates.some(d => !d);
      const uniqueCloseDates = new Set(closeDates.filter(Boolean));
      const uniqueContractDates = new Set(contractDates.filter(Boolean));
      const uniqueSalePrices = new Set(salePrices.filter(p => p !== null).map(p => String(p)));

      // Different close dates → separate sales
      if (uniqueCloseDates.size > 1) {
        const dateList = Array.from(uniqueCloseDates).sort().join(', ');
        groups.push({
          key, category: 'DIFF_DATE',
          reason: `Different close dates: ${dateList}`,
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Different contract dates → separate sales
      if (uniqueContractDates.size > 1) {
        const dateList = Array.from(uniqueContractDates).sort().join(', ');
        groups.push({
          key, category: 'DIFF_DATE',
          reason: `Different contract dates: ${dateList}`,
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Different sale prices → separate sales
      if (uniqueSalePrices.size > 1) {
        const priceList = Array.from(uniqueSalePrices).map(p => `$${Number(p).toLocaleString()}`).join(', ');
        groups.push({
          key, category: 'DIFF_PRICE',
          reason: `Different sale prices: ${priceList}`,
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Missing close dates — can't determine
      if (hasAnyMissingCloseDate) {
        groups.push({
          key, category: 'MISSING_DATES',
          reason: `One or more transactions missing close date — cannot auto-determine`,
          addressRaw, agentRaw, txCount: txs.length,
          transactions: txs.map(t => ({
            id: t.id, status: t.status, closeDate: t.closeDate,
            contractDate: t.contractDate, salePrice: t.salePrice,
            listPrice: t.listPrice, listingDate: t.listingDate,
            year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
            agentRaw: t.agentRaw,
          })),
        });
        continue;
      }

      // Everything matches → true duplicate
      const closeDate = closeDates[0] ?? 'unknown';
      const salePrice = salePrices[0] ? `$${salePrices[0].toLocaleString()}` : 'unknown price';
      groups.push({
        key, category: 'TRUE_DUPLICATE',
        reason: `Same close date (${closeDate}), same sale price (${salePrice}), same agent`,
        addressRaw, agentRaw, txCount: txs.length,
        transactions: txs.map(t => ({
          id: t.id, status: t.status, closeDate: t.closeDate,
          contractDate: t.contractDate, salePrice: t.salePrice,
          listPrice: t.listPrice, listingDate: t.listingDate,
          year: t.year, source: t.source, mlsListNumber: t.mlsListNumber,
          agentRaw: t.agentRaw,
        })),
      });
    }

    // ── Summary counts ────────────────────────────────────────────────────
    const summary = {
      totalGroups: groups.length,
      TRUE_DUPLICATE: groups.filter(g => g.category === 'TRUE_DUPLICATE').length,
      DIFF_DATE: groups.filter(g => g.category === 'DIFF_DATE').length,
      DIFF_PRICE: groups.filter(g => g.category === 'DIFF_PRICE').length,
      DIFF_AGENT: groups.filter(g => g.category === 'DIFF_AGENT').length,
      MISSING_DATES: groups.filter(g => g.category === 'MISSING_DATES').length,
      ALREADY_ACCEPTED: groups.filter(g => g.category === 'ALREADY_ACCEPTED').length,
    };

    // ── Filter and limit ──────────────────────────────────────────────────
    const filtered = categoryFilter === 'all'
      ? groups
      : groups.filter(g => g.category === categoryFilter);

    const paginated = filtered.slice(0, limit);

    return NextResponse.json({
      ok: true,
      yearFrom,
      yearTo,
      totalTransactionsScanned: allDocs.length,
      summary,
      groups: paginated,
      truncated: filtered.length > limit,
      totalFiltered: filtered.length,
    });
  } catch (err: any) {
    console.error('[duplicate-analysis]', err);
    return jsonError(500, err.message ?? 'Internal Server Error');
  }
}
