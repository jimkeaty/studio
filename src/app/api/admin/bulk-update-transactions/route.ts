// POST /api/admin/bulk-update-transactions
// Accepts a JSON array of rows from a spreadsheet, fuzzy-matches against
// existing transactions in Firestore, and either returns a preview of matches
// or applies the updates.
//
// Body: { rows: SpreadsheetRow[], mode: 'preview' | 'apply', year?: number }
// SpreadsheetRow: { address, agent, closeDate, type, dealType, salePrice, listPrice }

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ── Fuzzy matching helpers ─────────────────────────────────────────────

/** Normalize an address for comparison: lowercase, strip punctuation, collapse spaces */
function normalizeAddr(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[.,#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity score 0–1 (1 = identical) */
function similarity(a: string, b: string): number {
  const na = normalizeAddr(a), nb = normalizeAddr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

/** Normalize agent name: lowercase, trim */
function normalizeAgent(s: string): string {
  return (s || '').toLowerCase().trim();
}

/** Parse a close date value (ISO string, timestamp, or date string) to YYYY-MM-DD */
function parseCloseDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (typeof val === 'number') return new Date(val).toISOString().slice(0, 10);
  return '';
}

interface SpreadsheetRow {
  address: string;
  agent: string;
  closeDate: string;
  type: string;
  dealType: string;
  salePrice: number | null;
  listPrice: number | null;
}

interface TxDoc {
  id: string;
  address: string;
  agentDisplayName: string;
  closeDate: string;
  closingType: string;
  transactionType: string;
  salePrice: number | null;
  listPrice: number | null;
}

interface MatchResult {
  row: SpreadsheetRow;
  match: TxDoc | null;
  score: number;
  status: 'exact' | 'fuzzy' | 'no_match';
  changes: Record<string, { old: any; new: any }>;
}

export async function POST(req: NextRequest) {
  const decoded = await verifyAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  let body: { rows: SpreadsheetRow[]; mode: 'preview' | 'apply'; year?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { rows, mode, year = 2025 } = body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return jsonError(400, 'rows must be a non-empty array');
  }
  if (mode !== 'preview' && mode !== 'apply') {
    return jsonError(400, 'mode must be "preview" or "apply"');
  }

  // ── Load all transactions for the given year ──────────────────────────
  const snap = await adminDb.collection('transactions')
    .where('year', '==', year)
    .get();

  const txDocs: TxDoc[] = snap.docs.map(doc => {
    const d = doc.data();
    const rawDate = d.closeDate || d.closedDate || d.closingDate || '';
    return {
      id: doc.id,
      address: d.address || '',
      agentDisplayName: d.agentDisplayName || d.agent || '',
      closeDate: parseCloseDate(
        typeof rawDate?.toDate === 'function' ? rawDate.toDate().toISOString() : rawDate
      ),
      closingType: d.closingType || d.type || '',
      transactionType: d.transactionType || d.dealType || '',
      salePrice: d.salePrice ?? d.listPrice ?? null,
      listPrice: d.listPrice ?? null,
    };
  });

  // ── Match each spreadsheet row to a transaction ───────────────────────
  const results: MatchResult[] = [];

  for (const row of rows) {
    const rowAddrNorm = normalizeAddr(row.address);
    const rowAgentNorm = normalizeAgent(row.agent);
    const rowDate = parseCloseDate(row.closeDate);

    let bestMatch: TxDoc | null = null;
    let bestScore = 0;

    for (const tx of txDocs) {
      const addrScore = similarity(row.address, tx.address);
      if (addrScore < 0.5) continue; // address must be at least 50% similar

      const agentScore = normalizeAgent(tx.agentDisplayName).includes(rowAgentNorm.split(' ')[0]) ||
        rowAgentNorm.includes(normalizeAgent(tx.agentDisplayName).split(' ')[0]) ? 1 : 0.3;

      const dateScore = tx.closeDate && rowDate && tx.closeDate === rowDate ? 1 :
        tx.closeDate && rowDate && tx.closeDate.slice(0, 7) === rowDate.slice(0, 7) ? 0.7 : 0.3;

      const combined = addrScore * 0.6 + agentScore * 0.25 + dateScore * 0.15;

      if (combined > bestScore) {
        bestScore = combined;
        bestMatch = tx;
      }
    }

    const status: MatchResult['status'] =
      bestScore >= 0.9 ? 'exact' :
      bestScore >= 0.65 ? 'fuzzy' :
      'no_match';

    // Compute what would change
    const changes: Record<string, { old: any; new: any }> = {};
    if (bestMatch && status !== 'no_match') {
      if (row.salePrice != null && row.salePrice !== bestMatch.salePrice) {
        changes.salePrice = { old: bestMatch.salePrice, new: row.salePrice };
      }
      if (row.listPrice != null && row.listPrice !== bestMatch.listPrice) {
        changes.listPrice = { old: bestMatch.listPrice, new: row.listPrice };
      }
    }

    results.push({ row, match: bestMatch, score: bestScore, status, changes });
  }

  // ── Apply mode: write updates to Firestore ────────────────────────────
  if (mode === 'apply') {
    const batch = adminDb.batch();
    let updateCount = 0;

    for (const r of results) {
      if (!r.match || r.status === 'no_match' || Object.keys(r.changes).length === 0) continue;
      const ref = adminDb.collection('transactions').doc(r.match.id);
      batch.update(ref, r.changes.salePrice !== undefined || r.changes.listPrice !== undefined ? {
        ...(r.changes.salePrice !== undefined ? { salePrice: r.changes.salePrice.new } : {}),
        ...(r.changes.listPrice !== undefined ? { listPrice: r.changes.listPrice.new } : {}),
        updatedAt: new Date().toISOString(),
        bulkUpdatedAt: new Date().toISOString(),
      } : {});
      updateCount++;
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      mode: 'apply',
      updated: updateCount,
      results,
    });
  }

  // ── Preview mode: return matches without writing ──────────────────────
  return NextResponse.json({
    ok: true,
    mode: 'preview',
    totalRows: rows.length,
    exactMatches: results.filter(r => r.status === 'exact').length,
    fuzzyMatches: results.filter(r => r.status === 'fuzzy').length,
    noMatches: results.filter(r => r.status === 'no_match').length,
    withChanges: results.filter(r => Object.keys(r.changes).length > 0).length,
    results,
  });
}
