// GET /api/admin/debug-listing-commission?agentName=noah
// Temporary diagnostic endpoint — reads active listing transactions and returns
// the raw commission fields stored in Firestore so we can verify the save is working.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const agentName = (searchParams.get('agentName') || 'noah').toLowerCase();

    const snap = await adminDb.collection('transactions')
      .where('status', '==', 'active')
      .get();

    const results = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((tx: any) =>
        String(tx.agentDisplayName || '').toLowerCase().includes(agentName) ||
        String(tx.agentId || '').toLowerCase().includes(agentName)
      )
      .map((tx: any) => ({
        id: tx.id,
        address: tx.address,
        agentId: tx.agentId,
        agentDisplayName: tx.agentDisplayName,
        status: tx.status,
        closingType: tx.closingType,
        listPrice: tx.listPrice,
        listPriceType: typeof tx.listPrice,
        sellerPayingListingAgent: tx.sellerPayingListingAgent,
        sellerPayingListingAgentType: typeof tx.sellerPayingListingAgent,
        sellerPayingBuyerAgent: tx.sellerPayingBuyerAgent,
        commissionPercent: tx.commissionPercent,
        agentPct: tx.agentPct,
        splitSnapshotAgentSplitPercent: tx.splitSnapshot?.agentSplitPercent ?? null,
        updatedAt: tx.updatedAt,
      }));

    return NextResponse.json({ ok: true, count: results.length, transactions: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
