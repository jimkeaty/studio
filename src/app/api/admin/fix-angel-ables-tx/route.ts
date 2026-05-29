// One-time fix: correct agentId on Angel Ables' 6235 Woodlawn transaction
// The transaction has agentId = "psqbGa6gzKh2fqzzIve1" (uppercase I)
// but Angel Ables' profile doc ID is "psqbGa6gzKh2fqzzlve1" (lowercase l)
// This endpoint finds all transactions with the wrong ID and fixes them.
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

    const wrongId = 'psqbGa6gzKh2fqzzIve1'; // uppercase I
    const correctId = 'psqbGa6gzKh2fqzzlve1'; // lowercase l
    const correctName = 'Angel Ables';

    // Find all transactions with the wrong agentId
    const snap = await adminDb.collection('transactions')
      .where('agentId', '==', wrongId)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, message: 'No transactions found with the wrong agentId — may already be fixed.', fixed: 0 });
    }

    const batch = adminDb.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, {
        agentId: correctId,
        agentDisplayName: correctName,
      });
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      message: `Fixed ${snap.docs.length} transaction(s): agentId corrected from "${wrongId}" to "${correctId}" and agentDisplayName set to "${correctName}".`,
      fixed: snap.docs.length,
      transactions: snap.docs.map(d => ({ id: d.id, address: d.data().address })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
