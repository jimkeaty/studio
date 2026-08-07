// POST /api/admin/test-notification
// Writes a test in-app notification directly to Firestore for a user by email.
// Used to verify the bell notification pipeline without triggering a real event.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function POST(req: NextRequest) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const isAdmin = await isAdminLike(callerUid);
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const db = adminDb;
  const results: { email: string; uid: string | null; notifId: string | null; error?: string }[] = [];

  const emails: string[] = Array.isArray(email) ? email : [email];

  for (const targetEmail of emails) {
    const normalizedEmail = targetEmail.toLowerCase().trim();

    // Step 1: Find the users/{uid} doc by email
    let uid: string | null = null;
    try {
      const userSnap = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
      if (!userSnap.empty) {
        uid = userSnap.docs[0].id;
      }
    } catch { /* non-fatal */ }

    // Step 2: Fall back to staffUsers.firebaseUid
    if (!uid) {
      try {
        const staffSnap = await db.collection('staffUsers').where('email', '==', normalizedEmail).limit(1).get();
        if (!staffSnap.empty) {
          uid = staffSnap.docs[0].data().firebaseUid || null;
        }
      } catch { /* non-fatal */ }
    }

    if (!uid) {
      results.push({ email: normalizedEmail, uid: null, notifId: null, error: 'No users/{uid} doc or staffUsers.firebaseUid found for this email. Run Fix Bell Notifications first.' });
      continue;
    }

    // Step 3: Write a test notification directly to Firestore
    try {
      const notifRef = await db.collection('notifications').add({
        recipientUid: uid,
        type: 'system',
        title: '🔔 Bell Test Notification',
        body: `This is a test notification sent to ${normalizedEmail} to verify in-app bell delivery. If you can see this, the bell is working correctly.`,
        url: '/dashboard',
        read: false,
        createdAt: new Date(),
        testNotification: true,
      });
      results.push({ email: normalizedEmail, uid, notifId: notifRef.id });
    } catch (err: any) {
      results.push({ email: normalizedEmail, uid, notifId: null, error: err.message });
    }
  }

  const allOk = results.every(r => !r.error);
  return NextResponse.json({ ok: allOk, results });
}
