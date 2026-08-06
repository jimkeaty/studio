// POST /api/admin/fix-staff-notifications
// One-time bulk fix: for every staffUsers record that has a firebaseUid,
// ensure users/{uid} doc exists with email + notificationPrefs.
// Without this doc, sendNotification cannot write in-app notifications for staff/TC.
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

  const db = adminDb;
  const staffSnap = await db.collection('staffUsers').get();

  const results: { email: string; uid: string; action: string }[] = [];
  const errors: { email: string; error: string }[] = [];

  for (const doc of staffSnap.docs) {
    const data = doc.data() as Record<string, any>;
    const firebaseUid = data.firebaseUid as string | undefined;
    const email = String(data.email || '').toLowerCase().trim();

    if (!firebaseUid || !email) {
      // Can't fix without a UID — skip
      continue;
    }

    try {
      const userRef = db.collection('users').doc(firebaseUid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({
          email,
          displayName: data.displayName || data.name || email,
          phone: data.phone || null,
          role: data.role || 'staff',
          notificationPrefs: { in_app: true, email: true, sms: false, push: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        results.push({ email, uid: firebaseUid, action: 'created' });
      } else {
        const existing = userDoc.data() as Record<string, any>;
        const updates: Record<string, any> = {};
        if (!existing.email) updates.email = email;
        if (!existing.notificationPrefs) {
          updates.notificationPrefs = { in_app: true, email: true, sms: false, push: true };
        }
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          await userRef.update(updates);
          results.push({ email, uid: firebaseUid, action: `updated: ${Object.keys(updates).join(', ')}` });
        } else {
          results.push({ email, uid: firebaseUid, action: 'already_ok' });
        }
      }
    } catch (err: any) {
      errors.push({ email, error: err.message || 'unknown error' });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    errors: errors.length,
    results,
    errors_detail: errors,
  });
}
