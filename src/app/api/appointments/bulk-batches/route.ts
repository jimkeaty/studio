/**
 * GET  /api/appointments/bulk-batches
 *   Returns all bulk import batches for the agent, grouped by importBatchId.
 *   Each batch includes: importBatchId, importedAt, count, sample client names.
 *
 * DELETE /api/appointments/bulk-batches?batchId=<importBatchId>
 *   Deletes all appointments belonging to the given importBatchId.
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

// ── GET — list all import batches ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    let uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const viewAs = searchParams.get('viewAs');
    if (viewAs) {
      const callerIsAdmin = await isAdminLike(decoded.uid);
      if (!callerIsAdmin) return jsonError(403, 'Forbidden');
      uid = viewAs;
    }

    // Query all appointments for this agent and filter bulk_import in memory.
    // This avoids a composite index on (agentId, source, importedAt) which
    // Firestore requires but may not yet be built.
    const snap = await adminDb
      .collection('appointments')
      .where('agentId', '==', uid)
      .get();

    // Group by importBatchId
    const batchMap = new Map<string, {
      importBatchId: string;
      importedAt: string;
      count: number;
      sampleNames: string[];
    }>();

    for (const doc of snap.docs) {
      const d = doc.data();
      // Only include bulk-imported appointments
      if (d.source !== 'bulk_import') continue;
      const batchId: string = d.importBatchId ?? 'unknown';
      const importedAt: string = d.importedAt ?? '';
      const name: string = d.contactName ?? '';

      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, { importBatchId: batchId, importedAt, count: 0, sampleNames: [] });
      }
      const entry = batchMap.get(batchId)!;
      entry.count += 1;
      if (entry.sampleNames.length < 3 && name) {
        entry.sampleNames.push(name);
      }
    }

    // Sort by importedAt descending
    const batches = Array.from(batchMap.values()).sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt)
    );

    return NextResponse.json({ ok: true, batches });
  } catch (err: any) {
    console.error('[API/appointments/bulk-batches] GET failed:', err);
    return jsonError(500, err.message ?? 'Failed to load batches');
  }
}

// ── DELETE — delete all appointments in a batch ───────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    let uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const viewAs = searchParams.get('viewAs');

    if (!batchId) return jsonError(400, 'Missing batchId query parameter');

    if (viewAs) {
      const callerIsAdmin = await isAdminLike(decoded.uid);
      if (!callerIsAdmin) return jsonError(403, 'Forbidden');
      uid = viewAs;
    }

    // Fetch all docs in this batch belonging to this agent
    const snap = await adminDb
      .collection('appointments')
      .where('agentId', '==', uid)
      .where('importBatchId', '==', batchId)
      .get();

    if (snap.empty) {
      return jsonError(404, 'No appointments found for this batch ID');
    }

    // Delete in Firestore batches of 400
    const FIRESTORE_BATCH_SIZE = 400;
    let deleted = 0;
    const docs = snap.docs;

    for (let start = 0; start < docs.length; start += FIRESTORE_BATCH_SIZE) {
      const chunk = docs.slice(start, start + FIRESTORE_BATCH_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    console.error('[API/appointments/bulk-batches] DELETE failed:', err);
    return jsonError(500, err.message ?? 'Failed to delete batch');
  }
}
