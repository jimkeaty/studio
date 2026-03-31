// src/app/api/admin/agent-profiles/merge/route.ts
// POST — merge duplicate agent profiles: keeps the primary, reassigns transactions from duplicates, deletes duplicates
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
    return NextResponse.json({ ok: false, error: 'Forbidden'
  }, { status: 403 });
    }

    const body = await req.json();
    const { keepAgentId, deleteAgentIds } = body;

    if (!keepAgentId || !Array.isArray(deleteAgentIds) || deleteAgentIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'keepAgentId and deleteAgentIds[] are required' },
        { status: 400 },
      );
    }

    // Get the primary agent profile
    const keepDoc = await adminDb.collection('agentProfiles').doc(keepAgentId).get();
    if (!keepDoc.exists) {
      return NextResponse.json(
        { ok: false, error: `Primary agent ${keepAgentId} not found` },
        { status: 404 },
      );
    }
    const keepData = keepDoc.data()!;
    const keepDisplayName = keepData.displayName || keepAgentId;

    let totalReassigned = 0;
    let totalDeleted = 0;

    for (const deleteId of deleteAgentIds) {
      if (deleteId === keepAgentId) continue;

      // 1. Reassign all transactions from the duplicate to the primary
      const txSnap = await adminDb
        .collection('transactions')
        .where('agentId', '==', deleteId)
        .get();

      if (!txSnap.empty) {
        const BATCH_LIMIT = 499;
        let batch = adminDb.batch();
        let count = 0;

        for (const txDoc of txSnap.docs) {
          batch.update(txDoc.ref, {
            agentId: keepAgentId,
            agentDisplayName: keepDisplayName,
            updatedAt: new Date(),
            mergedFrom: deleteId,
          });
          count++;
          if (count >= BATCH_LIMIT) {
            await batch.commit();
            batch = adminDb.batch();
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
        totalReassigned += txSnap.size;
      }

      // 2. Reassign daily_activity records
      const activitySnap = await adminDb
        .collection('daily_activity')
        .where('agentId', '==', deleteId)
        .get();

      if (!activitySnap.empty) {
        const BATCH_LIMIT = 499;
        let batch = adminDb.batch();
        let count = 0;

        for (const actDoc of activitySnap.docs) {
          batch.update(actDoc.ref, {
            agentId: keepAgentId,
            updatedAt: new Date(),
          });
          count++;
          if (count >= BATCH_LIMIT) {
            await batch.commit();
            batch = adminDb.batch();
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 3. Reassign agentYearRollups
      const rollupsSnap = await adminDb
        .collection('agentYearRollups')
        .where('agentId', '==', deleteId)
        .get();

      if (!rollupsSnap.empty) {
        const BATCH_LIMIT = 499;
        let batch = adminDb.batch();
        let count = 0;

        for (const doc of rollupsSnap.docs) {
          batch.update(doc.ref, {
            agentId: keepAgentId,
            agentName: keepDisplayName,
            updatedAt: new Date(),
          });
          count++;
          if (count >= BATCH_LIMIT) {
            await batch.commit();
            batch = adminDb.batch();
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 4. Delete the duplicate agent profile
      await adminDb.collection('agentProfiles').doc(deleteId).delete();
      totalDeleted++;
    }

    return NextResponse.json({
      ok: true,
      keepAgentId,
      keepDisplayName,
      transactionsReassigned: totalReassigned,
      profilesDeleted: totalDeleted,
    });
  } catch (err: any) {
    console.error('[api/admin/agent-profiles/merge POST]', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal Server Error' },
      { status: 500 },
    );
  }
}
