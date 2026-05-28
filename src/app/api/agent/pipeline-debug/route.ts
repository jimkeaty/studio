// GET /api/agent/pipeline-debug
// Diagnostic endpoint — shows exactly what agentIds are resolved for the
// logged-in user and how many transactions are found under each ID.
// Accessible by the agent themselves OR any admin.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;
    const isAdmin = await isAdminLike(callerUid);

    const { searchParams } = new URL(req.url);
    const viewAs = searchParams.get('viewAs');
    const uid = (viewAs && isAdmin) ? viewAs : callerUid;

    const log: string[] = [];
    const ids = new Set<string>([uid]);
    log.push(`Starting with uid: ${uid}`);

    // Strategy 1
    try {
      const byDocId = await adminDb.collection('agentProfiles').doc(uid).get();
      if (byDocId.exists) {
        const data = byDocId.data() || {};
        log.push(`Strategy 1 HIT: agentProfiles/${uid} exists. agentId field="${data.agentId}", firebaseUid field="${data.firebaseUid}"`);
        ids.add(uid); // doc ID itself
        if (data.agentId) ids.add(String(data.agentId));
      } else {
        log.push(`Strategy 1 MISS: agentProfiles/${uid} does not exist`);
      }
    } catch (e: any) { log.push(`Strategy 1 ERROR: ${e.message}`); }

    // Strategy 2
    try {
      const byField = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
      if (!byField.empty) {
        const doc = byField.docs[0];
        log.push(`Strategy 2 HIT: agentProfiles doc "${doc.id}" has agentId=="${uid}"`);
        ids.add(doc.id);
        if (doc.data().agentId) ids.add(String(doc.data().agentId));
      } else {
        log.push(`Strategy 2 MISS: no agentProfiles doc has agentId=="${uid}"`);
      }
    } catch (e: any) { log.push(`Strategy 2 ERROR: ${e.message}`); }

    // Strategy 3
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        log.push(`Strategy 3 HIT: users/${uid} exists. agentId field="${userData.agentId}"`);
        if (userData.agentId) ids.add(String(userData.agentId));
      } else {
        log.push(`Strategy 3 MISS: users/${uid} does not exist`);
      }
    } catch (e: any) { log.push(`Strategy 3 ERROR: ${e.message}`); }

    // Strategy 4
    try {
      const byFirebaseUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
      if (!byFirebaseUid.empty) {
        const doc = byFirebaseUid.docs[0];
        log.push(`Strategy 4 HIT: agentProfiles doc "${doc.id}" has firebaseUid=="${uid}"`);
        ids.add(doc.id);
        if (doc.data().agentId) ids.add(String(doc.data().agentId));
      } else {
        log.push(`Strategy 4 MISS: no agentProfiles doc has firebaseUid=="${uid}"`);
      }
    } catch (e: any) { log.push(`Strategy 4 ERROR: ${e.message}`); }

    const resolvedIds = Array.from(ids);
    log.push(`Resolved IDs to query: [${resolvedIds.join(', ')}]`);

    // Count transactions for each resolved ID
    const txCounts: Record<string, number> = {};
    for (const agentId of resolvedIds) {
      try {
        const snap = await adminDb.collection('transactions').where('agentId', '==', agentId).get();
        txCounts[agentId] = snap.size;
        log.push(`transactions where agentId=="${agentId}": ${snap.size} docs`);
      } catch (e: any) {
        txCounts[agentId] = -1;
        log.push(`transactions query for agentId=="${agentId}" ERROR: ${e.message}`);
      }
    }

    const totalTx = Object.values(txCounts).filter(n => n > 0).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      ok: true,
      uid,
      callerUid,
      isAdmin,
      resolvedIds,
      txCounts,
      totalTransactionsFound: totalTx,
      log,
    });
  } catch (err: any) {
    console.error('[pipeline-debug]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
