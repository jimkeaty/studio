/**
 * GET /api/agent/transactions
 * Returns the authenticated agent's transactions (all statuses).
 * Also annotates each transaction with pendingTasksCount from the agentTasks collection.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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
    // Fetch all transactions belonging to this agent
    const snap = await adminDb
      .collection('transactions')
      .where('agentId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

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
          .where('agentId', '==', uid)
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
