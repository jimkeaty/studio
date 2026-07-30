/**
 * GET /api/agent/transactions
 * Returns the authenticated agent's transactions (all statuses).
 * Also annotates each transaction with pendingTasksCount from the agentTasks collection.
 *
 * Identity resolution: transactions may store agentId as the Firebase UID OR as the
 * agentProfiles document ID (legacy). We resolve all possible IDs for the caller and
 * union the results so agents always see their full history regardless of which ID
 * was written at intake time.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Resolve all identity strings for a Firebase UID so we can query by any of them. */
async function resolveAgentIds(uid: string): Promise<Set<string>> {
  const ids = new Set<string>([uid]);
  try {
    // By doc ID
    const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byDocId.exists) {
      const d = byDocId.data() || {};
      ids.add(byDocId.id);
      if (d.agentId) ids.add(String(d.agentId));
      if (d.firebaseUid) ids.add(String(d.firebaseUid));
    }
    // By agentId field
    const byField = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
    if (!byField.empty) {
      const d = byField.docs[0].data() || {};
      ids.add(byField.docs[0].id);
      if (d.agentId) ids.add(String(d.agentId));
      if (d.firebaseUid) ids.add(String(d.firebaseUid));
    }
    // By firebaseUid field
    const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
    if (!byFbUid.empty) {
      const d = byFbUid.docs[0].data() || {};
      ids.add(byFbUid.docs[0].id);
      if (d.agentId) ids.add(String(d.agentId));
      if (d.firebaseUid) ids.add(String(d.firebaseUid));
    }
  } catch (_) {
    // Non-fatal — fall back to uid only
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return jsonError(401, 'Unauthorized');

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  try {
    // Resolve all identity IDs for this agent (Firebase UID, agentProfiles docId, agentId field)
    const agentIds = await resolveAgentIds(uid);
    const idArray = Array.from(agentIds);

    // Firestore 'in' supports up to 30 values. Batch if needed (rare edge case).
    const txMap = new Map<string, any>();
    for (let i = 0; i < idArray.length; i += 30) {
      const batch = idArray.slice(i, i + 30);
      const snap = await adminDb
        .collection('transactions')
        .where('agentId', 'in', batch)
        .orderBy('createdAt', 'desc')
        .get();
      for (const doc of snap.docs) {
        if (!txMap.has(doc.id)) {
          txMap.set(doc.id, { id: doc.id, ...doc.data() });
        }
      }
    }

    const transactions = Array.from(txMap.values());

    // Sort combined results by createdAt desc
    transactions.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
      return bTime - aTime;
    });

    // Fetch pending task counts for each transaction
    const txIds = transactions.map((t: any) => t.id);
    const taskCountMap: Record<string, number> = {};

    if (txIds.length > 0) {
      // Batch into groups of 10 for Firestore 'in' query limit
      for (let i = 0; i < txIds.length; i += 10) {
        const batch = txIds.slice(i, i + 10);
        const taskSnap = await adminDb
          .collection('agentTasks')
          .where('transactionId', 'in', batch)
          .where('agentId', 'in', idArray.slice(0, 10)) // use resolved ids
          .where('completed', '==', false)
          .get();
        for (const doc of taskSnap.docs) {
          const txId = doc.data().transactionId;
          taskCountMap[txId] = (taskCountMap[txId] || 0) + 1;
        }
      }
    }

    const annotated = transactions.map((t: any) => ({
      ...t,
      pendingTasksCount: taskCountMap[t.id] || 0,
    }));

    return NextResponse.json({ ok: true, transactions: annotated });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal error');
  }
}
