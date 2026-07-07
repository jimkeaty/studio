// POST /api/admin/fix-staff-uid — look up Firebase Auth UID by email and write it to staffUsers
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const isAdmin = await isAdminLike(adminDb, uid);
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  // 1. Look up Firebase Auth user by email
  let authUser: { uid: string };
  try {
    authUser = await adminAuth.getUserByEmail(email);
  } catch (e: any) {
    return NextResponse.json({ error: `No Firebase Auth user found for ${email}: ${e.message}` }, { status: 404 });
  }

  const firebaseUid = authUser.uid;

  // 2. Find the staffUsers doc for this email
  const staffSnap = await adminDb.collection('staffUsers').where('email', '==', email).limit(1).get();
  if (staffSnap.empty) {
    return NextResponse.json({ error: `No staffUsers record found for ${email}` }, { status: 404 });
  }

  const staffDocRef = staffSnap.docs[0].ref;

  // 3. Write the firebaseUid to the staffUsers doc
  await staffDocRef.update({ firebaseUid });

  // 4. Also ensure a users/{uid} doc exists with email and displayName
  const staffData = staffSnap.docs[0].data();
  const usersDocRef = adminDb.collection('users').doc(firebaseUid);
  const usersDoc = await usersDocRef.get();
  if (!usersDoc.exists) {
    await usersDocRef.set({
      email,
      displayName: staffData.displayName || staffData.name || email,
      role: staffData.role || 'staff',
      phone: staffData.phone || '',
      createdAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    message: `firebaseUid linked and users doc ensured for ${email}`,
    firebaseUid,
  });
}
