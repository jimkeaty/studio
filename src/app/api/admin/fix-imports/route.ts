// src/app/api/admin/fix-imports/route.ts
// One-time migration: patches imported transactions to add brokerProfit
// and fix transactionType 'residential_lease' → 'rental'
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find all imported transactions
    const snap = await adminDb
      .collection('transactions')
      .where('source', '==', 'import')
      .get();

    let patched = 0;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const updates: Record<string, any> = {};

      // Add brokerProfit from splitSnapshot.companyRetained if missing
      if (data.brokerProfit === undefined || data.brokerProfit === null) {
        const companyRetained = data.splitSnapshot?.companyRetained ?? 0;
        updates.brokerProfit = companyRetained;
      }

      // Fix transactionType: residential_lease → rental
      if (data.transactionType === 'residential_lease') {
        updates.transactionType = 'rental';
      }

      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates);
        patched++;
        batchCount++;

        if (batchCount >= 499) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      total: snap.size,
      patched,
    });
  } catch (err: any) {
    console.error('[fix-imports]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
