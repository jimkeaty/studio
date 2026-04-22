import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * ONE-TIME MIGRATION: Move all transactions with status='under_contract' to status='pending'
 * Admin-only endpoint. Safe to run multiple times (idempotent).
 */
export async function POST(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization') || '';
    if (!h.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = h.slice(7).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    const admin = await isAdminLike(decoded.uid);
    if (!admin) return jsonError(403, 'Forbidden: Admin only');

    // Query all transactions with status = under_contract
    const snapshot = await adminDb
      .collection('transactions')
      .where('status', '==', 'under_contract')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ ok: true, migrated: 0, message: 'No under_contract transactions found. Nothing to migrate.' });
    }

    const batch = adminDb.batch();
    const migrated: string[] = [];

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'pending', updatedAt: new Date().toISOString() });
      migrated.push(doc.id);
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      migrated: migrated.length,
      message: `Successfully migrated ${migrated.length} transaction(s) from under_contract → pending.`,
      ids: migrated,
    });

  } catch (err: any) {
    console.error('[migration/fix-under-contract]', err);
    return jsonError(500, err?.message || 'Internal server error');
  }
}
