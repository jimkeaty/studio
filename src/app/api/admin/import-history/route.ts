/**
 * GET  /api/admin/import-history
 *   Returns all import batches across every import type:
 *     - "transaction"  — CSV bulk transaction imports (source: 'import')
 *     - "mls"          — MLS listing imports (source: 'mls_import')
 *     - "activity"     — Bulk activity tracking imports (source: 'import' in activityTracking)
 *
 *   Each batch entry:
 *     { batchId, type, importedAt, count, years, sampleAgents, sampleAddresses, notes }
 *
 * DELETE /api/admin/import-history?batchId=xxx&type=transaction|mls|activity
 *   Reverses (deletes) all records belonging to that batch.
 *   For transaction/mls batches: also rebuilds agent rollups.
 *   For activity batches: deletes from activityTracking + daily_activity.
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';

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
  if (typeof (v as any)?.toDate === 'function') return (v as any).toDate().toISOString();
  return String(v);
}

// ── Shared batch accumulator ───────────────────────────────────────────────

interface BatchEntry {
  batchId: string;
  type: 'transaction' | 'mls' | 'activity';
  importedAt: string;
  count: number;
  years: Set<number>;
  sampleAgents: string[];
  sampleAddresses: string[];
}

function addToMap(
  map: Map<string, BatchEntry>,
  batchId: string,
  type: BatchEntry['type'],
  importedAt: string,
  year: number | null,
  agentName: string,
  address: string,
) {
  if (!map.has(batchId)) {
    map.set(batchId, {
      batchId,
      type,
      importedAt,
      count: 0,
      years: new Set(),
      sampleAgents: [],
      sampleAddresses: [],
    });
  }
  const e = map.get(batchId)!;
  e.count += 1;
  if (year && year > 0) e.years.add(year);
  if (agentName && e.sampleAgents.length < 4 && !e.sampleAgents.includes(agentName)) {
    e.sampleAgents.push(agentName);
  }
  if (address && e.sampleAddresses.length < 3) {
    e.sampleAddresses.push(address);
  }
  // Keep earliest importedAt per batch (most accurate for display)
  if (!e.importedAt || importedAt < e.importedAt) e.importedAt = importedAt;
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const batchMap = new Map<string, BatchEntry>();

    // ── 1. Transaction imports (source: 'import') ──────────────────────────
    const txSnap = await adminDb
      .collection('transactions')
      .where('source', '==', 'import')
      .get();
    for (const doc of txSnap.docs) {
      const d = doc.data();
      const batchId: string = d.importBatchId || `legacy_tx_${formatDate(d.importedAt).slice(0, 10)}`;
      addToMap(
        batchMap,
        batchId,
        'transaction',
        formatDate(d.importedAt || d.createdAt),
        Number(d.year ?? 0),
        String(d.agentDisplayName || d.agentName || ''),
        String(d.address || d.propertyAddress || ''),
      );
    }

    // ── 2. MLS listing imports (source: 'mls_import') ─────────────────────
    const mlsSnap = await adminDb
      .collection('transactions')
      .where('source', '==', 'mls_import')
      .get();
    for (const doc of mlsSnap.docs) {
      const d = doc.data();
      const batchId: string = d.importBatchId || `legacy_mls_${formatDate(d.importedAt).slice(0, 10)}`;
      addToMap(
        batchMap,
        batchId,
        'mls',
        formatDate(d.importedAt || d.createdAt),
        Number(d.year ?? 0),
        String(d.agentDisplayName || d.agentName || ''),
        String(d.address || d.propertyAddress || ''),
      );
    }

    // ── 3. Activity tracking imports ───────────────────────────────────────
    const actSnap = await adminDb
      .collection('activityTracking')
      .where('source', '==', 'import')
      .get();
    for (const doc of actSnap.docs) {
      const d = doc.data();
      const batchId: string = d.importBatchId || `legacy_act_${formatDate(d.importedAt || d.createdAt).slice(0, 10)}`;
      const dateStr: string = d.date ? String(d.date) : '';
      const year = dateStr ? new Date(dateStr).getFullYear() : 0;
      addToMap(
        batchMap,
        batchId,
        'activity',
        formatDate(d.importedAt || d.createdAt),
        year,
        String(d.agentDisplayName || d.agentName || ''),
        '',
      );
    }

    // ── Serialize ──────────────────────────────────────────────────────────
    const batches = Array.from(batchMap.values())
      .map(b => ({
        batchId: b.batchId,
        type: b.type,
        importedAt: b.importedAt,
        count: b.count,
        years: Array.from(b.years).sort((a, z) => a - z),
        sampleAgents: b.sampleAgents,
        sampleAddresses: b.sampleAddresses,
      }))
      .sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));

    return NextResponse.json({ ok: true, batches });
  } catch (err: any) {
    console.error('[api/admin/import-history GET]', err);
    return jsonError(500, err.message ?? 'Failed to load import history');
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const type = searchParams.get('type') as 'transaction' | 'mls' | 'activity' | null;

    if (!batchId) return jsonError(400, 'Missing batchId');
    if (!type || !['transaction', 'mls', 'activity'].includes(type)) {
      return jsonError(400, 'Missing or invalid type (transaction | mls | activity)');
    }

    let deleted = 0;
    const affectedAgentIds = new Set<string>();
    const affectedYears = new Set<number>();

    if (type === 'transaction' || type === 'mls') {
      // ── Delete from transactions collection ──────────────────────────────
      const source = type === 'mls' ? 'mls_import' : 'import';
      const snap = await adminDb
        .collection('transactions')
        .where('importBatchId', '==', batchId)
        .where('source', '==', source)
        .get();

      if (snap.empty) {
        // Fallback: query without source filter (handles legacy batches)
        const snap2 = await adminDb
          .collection('transactions')
          .where('importBatchId', '==', batchId)
          .get();
        for (const doc of snap2.docs) {
          const d = doc.data();
          if (d.agentId) affectedAgentIds.add(String(d.agentId));
          if (d.year) affectedYears.add(Number(d.year));
        }
        // Delete in Firestore batches
        let fb = adminDb.batch();
        let fc = 0;
        for (const doc of snap2.docs) {
          fb.delete(doc.ref);
          deleted++;
          fc++;
          if (fc >= 499) { await fb.commit(); fb = adminDb.batch(); fc = 0; }
        }
        if (fc > 0) await fb.commit();
      } else {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (d.agentId) affectedAgentIds.add(String(d.agentId));
          if (d.year) affectedYears.add(Number(d.year));
        }
        let fb = adminDb.batch();
        let fc = 0;
        for (const doc of snap.docs) {
          fb.delete(doc.ref);
          deleted++;
          fc++;
          if (fc >= 499) { await fb.commit(); fb = adminDb.batch(); fc = 0; }
        }
        if (fc > 0) await fb.commit();
      }

      // Rebuild rollups for affected agents (non-fatal)
      const years = Array.from(affectedYears);
      if (affectedAgentIds.size > 0 && years.length > 0) {
        await Promise.allSettled(
          Array.from(affectedAgentIds).flatMap(agentId =>
            years.map(year => rebuildAgentRollup(adminDb, agentId, year))
          )
        );
      }

    } else if (type === 'activity') {
      // ── Delete from activityTracking ─────────────────────────────────────
      const actSnap = await adminDb
        .collection('activityTracking')
        .where('importBatchId', '==', batchId)
        .get();

      // Collect daily_activity doc IDs to clean up
      const dailyDocIds = new Set<string>();
      let fb = adminDb.batch();
      let fc = 0;
      for (const doc of actSnap.docs) {
        const d = doc.data();
        // daily_activity doc ID format: agentId_YYYY-MM-DD
        const agentId = d.agentId || d.agentProfileId || '';
        const date = d.date || '';
        if (agentId && date) dailyDocIds.add(`${agentId}_${date}`);
        fb.delete(doc.ref);
        deleted++;
        fc++;
        if (fc >= 499) { await fb.commit(); fb = adminDb.batch(); fc = 0; }
      }
      if (fc > 0) await fb.commit();

      // Remove the matching daily_activity aggregates (best-effort)
      if (dailyDocIds.size > 0) {
        let db2 = adminDb.batch();
        let dc = 0;
        for (const dailyId of dailyDocIds) {
          db2.delete(adminDb.collection('daily_activity').doc(dailyId));
          dc++;
          if (dc >= 499) { await db2.commit(); db2 = adminDb.batch(); dc = 0; }
        }
        if (dc > 0) await db2.commit();
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    console.error('[api/admin/import-history DELETE]', err);
    return jsonError(500, err.message ?? 'Failed to reverse import batch');
  }
}
