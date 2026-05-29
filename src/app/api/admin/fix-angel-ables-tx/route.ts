// One-time fix: set agentDisplayName = "Angel Ables" on the 6235 Woodlawn transaction
// Transaction doc ID: asPqyRU62dql1rHbxXgL
// Also scans for any remaining transactions with the old uppercase-I agentId and fixes those too.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const correctId = 'psqbGa6gzKh2fqzzlve1'; // lowercase l
    const correctName = 'Angel Ables';
    const knownTxId = 'asPqyRU62dql1rHbxXgL'; // the specific 6235 Woodlawn tx

    const fixed: string[] = [];

    // 1. Directly patch the known transaction by doc ID
    const txRef = adminDb.collection('transactions').doc(knownTxId);
    const txSnap = await txRef.get();
    if (txSnap.exists) {
      await txRef.update({
        agentId: correctId,
        agentDisplayName: correctName,
      });
      fixed.push(`Direct patch: ${knownTxId} (${txSnap.data()?.address || 'unknown address'})`);
    }

    // 2. Also scan for any remaining transactions with the old uppercase-I agentId
    const wrongId = 'psqbGa6gzKh2fqzzIve1'; // uppercase I
    const snap = await adminDb.collection('transactions')
      .where('agentId', '==', wrongId)
      .get();

    if (!snap.empty) {
      const batch = adminDb.batch();
      snap.docs.forEach(doc => {
        batch.update(doc.ref, {
          agentId: correctId,
          agentDisplayName: correctName,
        });
        fixed.push(`Scan fix: ${doc.id} (${doc.data().address || 'unknown address'})`);
      });
      await batch.commit();
    }

    // 3. Also fix any transaction where agentId is correct but agentDisplayName is still blank or the raw ID
    const blankNameSnap = await adminDb.collection('transactions')
      .where('agentId', '==', correctId)
      .get();

    const blankBatch = adminDb.batch();
    let blankCount = 0;
    blankNameSnap.docs.forEach(doc => {
      const d = doc.data();
      if (!d.agentDisplayName || d.agentDisplayName === correctId) {
        blankBatch.update(doc.ref, { agentDisplayName: correctName });
        fixed.push(`Name fix: ${doc.id} (${d.address || 'unknown address'})`);
        blankCount++;
      }
    });
    if (blankCount > 0) await blankBatch.commit();

    return NextResponse.json({
      ok: true,
      message: `Fixed ${fixed.length} item(s).`,
      fixed,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
