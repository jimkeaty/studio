/**
 * GET /api/admin/import-batches
 *
 * Returns all transaction bulk import batches grouped by importBatchId.
 * Each batch entry includes: importBatchId, importedAt, count, year range,
 * and a sample of agent names / addresses for identification.
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function formatDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  // Firestore Timestamp
  if (typeof (v as any)?.toDate === 'function') return (v as any).toDate().toISOString();
  return String(v);
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // Query all imported transactions that have an importBatchId
    const snap = await adminDb
      .collection('transactions')
      .where('source', '==', 'import')
      .where('importBatchId', '!=', null)
      .orderBy('importBatchId')
      .orderBy('importedAt', 'desc')
      .get();

    // Group by importBatchId
    const batchMap = new Map<string, {
      importBatchId: string;
      importedAt: string;
      count: number;
      years: Set<number>;
      sampleAgents: string[];
      sampleAddresses: string[];
    }>();

    for (const doc of snap.docs) {
      const d = doc.data();
      const batchId: string = d.importBatchId;
      const importedAt: string = formatDate(d.importedAt);
      const agentName: string = d.agentName ?? d.agentDisplayName ?? '';
      const address: string = d.address ?? d.propertyAddress ?? '';
      const year: number = Number(d.year ?? 0);

      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, {
          importBatchId: batchId,
          importedAt,
          count: 0,
          years: new Set(),
          sampleAgents: [],
          sampleAddresses: [],
        });
      }
      const entry = batchMap.get(batchId)!;
      entry.count += 1;
      if (year > 0) entry.years.add(year);
      if (entry.sampleAgents.length < 3 && agentName && !entry.sampleAgents.includes(agentName)) {
        entry.sampleAgents.push(agentName);
      }
      if (entry.sampleAddresses.length < 2 && address) {
        entry.sampleAddresses.push(address);
      }
    }

    // Serialize and sort by importedAt descending
    const batches = Array.from(batchMap.values())
      .map(b => ({
        importBatchId: b.importBatchId,
        importedAt: b.importedAt,
        count: b.count,
        years: Array.from(b.years).sort((a, z) => a - z),
        sampleAgents: b.sampleAgents,
        sampleAddresses: b.sampleAddresses,
      }))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));

    return NextResponse.json({ ok: true, batches });
  } catch (err: any) {
    console.error('[API/admin/import-batches] GET failed:', err);
    return jsonError(500, err.message ?? 'Failed to load import batches');
  }
}
