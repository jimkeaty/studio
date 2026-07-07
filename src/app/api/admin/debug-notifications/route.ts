// GET /api/admin/debug-notifications?email=anna@... — diagnose notification setup for a staff user
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email') || '';

  // 1. Find staffUsers record by email
  const staffSnap = await adminDb.collection('staffUsers')
    .where('email', '==', email).limit(1).get();
  const staffDoc = staffSnap.empty ? null : staffSnap.docs[0].data();
  const firebaseUid = staffDoc?.firebaseUid || null;

  // 2. Find users/{uid} record
  let userDoc: any = null;
  if (firebaseUid) {
    const uSnap = await adminDb.collection('users').doc(firebaseUid).get();
    userDoc = uSnap.exists ? uSnap.data() : null;
  }

  // 3. Check recent notifications for this UID
  let recentNotifs: any[] = [];
  if (firebaseUid) {
    try {
      const nSnap = await adminDb.collection('notifications')
        .where('recipientUid', '==', firebaseUid)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      recentNotifs = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e: any) {
      recentNotifs = [{ error: e.message }];
    }
  }

  // 4. Show all staffUsers UIDs (what getAllStaffUids returns)
  const allStaffSnap = await adminDb.collection('staffUsers').get();
  const allStaffUids = allStaffSnap.docs.map(d => ({
    docId: d.id,
    email: d.data().email,
    firebaseUid: d.data().firebaseUid || null,
    role: d.data().role,
    displayName: d.data().displayName,
  }));

  return NextResponse.json({
    queried_email: email,
    staffDoc: staffDoc
      ? { role: staffDoc.role, firebaseUid: staffDoc.firebaseUid || null, email: staffDoc.email, displayName: staffDoc.displayName }
      : 'NOT FOUND in staffUsers',
    firebaseUid: firebaseUid || 'MISSING — this is why notifications fail',
    userDoc: userDoc
      ? { email: userDoc.email, displayName: userDoc.displayName, notificationPrefs: userDoc.notificationPrefs ?? 'not set (uses defaults: email=true)' }
      : firebaseUid ? 'NOT FOUND in users collection' : 'cannot check — no firebaseUid',
    recentNotifications: recentNotifs.map(n => ({
      type: n.type,
      title: n.title,
      createdAt: n.createdAt,
      read: n.read,
    })),
    allStaffUsers: allStaffUids,
  });
}
