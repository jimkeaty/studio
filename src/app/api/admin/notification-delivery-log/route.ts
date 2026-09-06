import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ ok: false, error: 'Forbidden: Admin only' }, { status: 403 });
    const workflow = String(req.nextUrl.searchParams.get('workflow') || '').trim();
    let query: FirebaseFirestore.Query = adminDb.collection('notificationDeliveryLog');
    if (workflow) query = query.where('workflow', '==', workflow);
    const snapshot = await query.orderBy('createdAt', 'desc').limit(300).get();
    return NextResponse.json({ ok: true, entries: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error.message || 'Unable to load notification delivery log.' }, { status: 500 }); }
}
