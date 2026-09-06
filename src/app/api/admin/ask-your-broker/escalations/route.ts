import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
    const snapshot = await adminDb.collection('brokerEscalations').orderBy('updatedAt', 'desc').limit(200).get();
    return NextResponse.json({ ok: true, escalations: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error.message || 'Unable to load broker reviews.' }, { status: 500 }); }
}
