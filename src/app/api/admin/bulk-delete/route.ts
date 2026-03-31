// src/app/api/admin/bulk-delete/route.ts
// POST /api/admin/bulk-delete — bulk delete transactions with filters
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function getMonthFromDoc(data: any): number | null {
  // Try closedDate first, then contractDate, then listingDate
  for (const field of ['closedDate', 'contractDate', 'listingDate']) {
    const val = data[field];
    if (!val) continue;
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.getMonth() + 1; // 1-based
    } else if (typeof val?.toDate === 'function') {
      return val.toDate().getMonth() + 1;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { scope, year, month, deleteAutoCreatedAgents } = body;

    // scope: 'all' | 'imported' | 'year' | 'source_and_year'
    if (!scope) {
      return NextResponse.json({ error: 'Missing scope parameter' }, { status: 400 });
    }

    let query: FirebaseFirestore.Query = adminDb.collection('transactions');
    let monthFilter: number | null = month ? Number(month) : null;

    if (scope === 'imported') {
      query = query.where('source', '==', 'import');
    } else if (scope === 'year' && year) {
      query = query.where('year', '==', Number(year));
    } else if (scope === 'source_and_year' && year) {
      query = query.where('source', '==', 'import').where('year', '==', Number(year));
    } else if (scope === 'all') {
      // No filters — delete everything
    } else {
      return NextResponse.json({ error: 'Invalid scope or missing year' }, { status: 400 });
    }

    const snap = await query.get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, deleted: 0, message: 'No matching transactions found.' });
    }

    let deleted = 0;
    let skipped = 0;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      // If month filter is set, check the transaction's month
      if (monthFilter) {
        const docMonth = getMonthFromDoc(doc.data());
        if (docMonth !== monthFilter) {
          skipped++;
          continue;
        }
      }

      batch.delete(doc.ref);
      deleted++;
      batchCount++;

      if (batchCount >= 499) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // ── Optionally delete auto-created agent profiles ──────────────────
    let agentsDeleted = 0;
    if (deleteAutoCreatedAgents) {
      const agentSnap = await adminDb
        .collection('agentProfiles')
        .where('source', '==', 'bulk_import')
        .get();

      if (!agentSnap.empty) {
        // Check all agents for remaining transactions in parallel (fixes N+1 query)
        const agentDocs = agentSnap.docs;
        const remainingTxChecks = await Promise.all(
          agentDocs.map((agentDoc) => {
            const agentId = agentDoc.data().agentId || agentDoc.id;
            return adminDb
              .collection('transactions')
              .where('agentId', '==', agentId)
              .limit(1)
              .get();
          })
        );

        // Now batch-delete agents with zero remaining transactions
        let agentBatch = adminDb.batch();
        let agentBatchCount = 0;

        for (let i = 0; i < agentDocs.length; i++) {
          if (remainingTxChecks[i].empty) {
            agentBatch.delete(agentDocs[i].ref);
            agentsDeleted++;
            agentBatchCount++;

            if (agentBatchCount >= 499) {
              await agentBatch.commit();
              agentBatch = adminDb.batch();
              agentBatchCount = 0;
            }
          }
        }

        if (agentBatchCount > 0) {
          await agentBatch.commit();
        }
      }
    }

    return NextResponse.json({ ok: true, deleted, skipped, agentsDeleted });
  } catch (err: any) {
    console.error('[bulk-delete]', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
