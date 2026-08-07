// GET /api/admin/notification-debug
// Returns a full diagnostic of the notification pipeline for every staff member:
// - staffUsers.firebaseUid present?
// - users/{uid} doc exists?
// - notificationPrefs.in_app = true?
// - How many notifications exist in Firestore for this UID?
// - What issues are blocking the bell?
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
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

  // Check if composite index exists by running a test query
  let usedFallback = false;
  try {
    await db.collection('notifications')
      .where('recipientUid', '==', '__test__')
      .where('read', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
  } catch {
    usedFallback = true;
  }

  const rows = [];
  for (const doc of staffSnap.docs) {
    const data = doc.data() as Record<string, any>;
    const email = String(data.email || '').toLowerCase().trim();
    const firebaseUid = data.firebaseUid as string | null || null;
    const issues: string[] = [];

    if (!firebaseUid) {
      issues.push('staffUsers.firebaseUid is missing — staff member has never logged in or account was not linked. Click "Fix Bell Notifications" on the Staff Users page, then have them log out and back in.');
      rows.push({ email, firebaseUid: null, usersDocExists: false, notificationPrefs: null, recentNotifCount: 0, unreadNotifCount: 0, lastNotifAt: null, issues });
      continue;
    }

    // Check users/{uid} doc
    const userDoc = await db.collection('users').doc(firebaseUid).get();
    const usersDocExists = userDoc.exists;
    const userData = usersDocExists ? (userDoc.data() as Record<string, any>) : null;
    const notificationPrefs = userData?.notificationPrefs || null;

    if (!usersDocExists) {
      issues.push('users/{uid} doc is missing — the bell cannot find notification preferences. Click "Force-Fix All Staff" above to create it.');
    } else if (!notificationPrefs) {
      issues.push('notificationPrefs field is missing from users/{uid} doc. Click "Force-Fix All Staff" to add it.');
    } else if (notificationPrefs.in_app === false) {
      issues.push('notificationPrefs.in_app is set to false — in-app notifications are disabled for this user. Click "Force-Fix All Staff" to enable it.');
    }

    // Check how many notifications exist in Firestore for this UID
    let recentNotifCount = 0;
    let unreadNotifCount = 0;
    let lastNotifAt: string | null = null;
    try {
      const notifSnap = await db.collection('notifications')
        .where('recipientUid', '==', firebaseUid)
        .limit(20)
        .get();
      recentNotifCount = notifSnap.size;
      const unread = notifSnap.docs.filter(d => !d.data().read);
      unreadNotifCount = unread.length;
      if (notifSnap.size > 0) {
        const dates = notifSnap.docs
          .map(d => d.data().createdAt?.toDate?.()?.toISOString())
          .filter(Boolean) as string[];
        if (dates.length > 0) lastNotifAt = dates.sort().reverse()[0];
      }
    } catch { /* non-fatal */ }

    if (recentNotifCount === 0 && usersDocExists && notificationPrefs?.in_app !== false) {
      issues.push('No notifications found in Firestore for this UID. Either no notifications have been sent yet, or sendNotification is failing silently. Try clicking the purple bell icon on the Staff Users page to send a test notification, then re-run this diagnostic.');
    }

    if (usedFallback) {
      issues.push('Firestore composite index is missing on notifications collection. The bell uses a fallback query but results may not be sorted correctly. Create index: notifications → recipientUid ASC, read ASC, createdAt DESC.');
    }

    rows.push({ email, firebaseUid, usersDocExists, notificationPrefs, recentNotifCount, unreadNotifCount, lastNotifAt, issues });
  }

  return NextResponse.json({ ok: true, rows, usedFallback });
}
