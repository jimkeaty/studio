/**
 * POST /api/admin/transactions/bulk-delete
 *
 * Deletes a list of transactions by their Firestore document IDs.
 * Accepts: { ids: string[] }
 * Max 500 IDs per request.
 * After deletion, rebuilds rollups for all affected agents.
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

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ── Validate input ────────────────────────────────────────────────────
    const body = await req.json();
    const { ids } = body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonError(400, 'ids must be a non-empty array of transaction IDs');
    }
    if (ids.length > 500) {
      return jsonError(400, 'Maximum 500 transactions per bulk delete request');
    }
    const idList = ids.filter(id => typeof id === 'string' && id.trim().length > 0) as string[];
    if (idList.length === 0) return jsonError(400, 'No valid transaction IDs provided');

    // ── Fetch docs to collect agentIds for rollup rebuild ─────────────────
    const affectedAgentIds = new Set<string>();
    const affectedYears = new Set<number>();

    // Fetch in chunks of 30 (Firestore 'in' query limit)
    const CHUNK = 30;
    for (let i = 0; i < idList.length; i += CHUNK) {
      const chunk = idList.slice(i, i + CHUNK);
      const snap = await adminDb
        .collection('transactions')
        .where('__name__', 'in', chunk)
        .get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.agentId) affectedAgentIds.add(d.agentId);
        if (d.year) affectedYears.add(Number(d.year));
      }
    }

    // ── Delete in Firestore batches of 499 ────────────────────────────────
    let deleted = 0;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const id of idList) {
      batch.delete(adminDb.collection('transactions').doc(id));
      deleted++;
      batchCount++;
      if (batchCount >= 499) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // ── Rebuild rollups for affected agents (non-fatal) ───────────────────
    const years = Array.from(affectedYears);
    const rollupResults = await Promise.allSettled(
      Array.from(affectedAgentIds).flatMap(agentId =>
        years.map(year => rebuildAgentRollup(adminDb, agentId, year))
      )
    );
    const rollupErrors = rollupResults
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message ?? 'unknown');
    if (rollupErrors.length > 0) {
      console.warn('[bulk-delete-by-ids] Some rollup rebuilds failed (non-fatal):', rollupErrors);
    }

    return NextResponse.json({
      ok: true,
      deleted,
      rollupRebuilt: rollupResults.filter(r => r.status === 'fulfilled').length,
    });
  } catch (err: any) {
    console.error('[api/admin/transactions/bulk-delete]', err);
    return NextResponse.json({ ok: false, error: err.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
