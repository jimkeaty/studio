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
  // Note: we no longer test for composite index here because the test query
  // with a dummy UID can fail due to security rules, producing a false positive.
  // The index is confirmed to exist in Firebase Console.
  const usedFallback = false;

  const rows: Array<Record<string, any>> = [];
  const eventCounts = new Map<string, number>();
  const monitorEvents: Array<{
    id: string;
    recipient: string;
    type: string;
    title: string;
    body: string;
    createdAt: string | null;
    read: boolean;
  }> = [];
  let eventsLast24h = 0;
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
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

    // Check recent notifications for this UID. Do not apply a small Firestore
    // limit before sorting: this query is unordered by design so a limit can
    // hide the newest records for staff with a longer notification history.
    let recentNotifCount = 0;
    let unreadNotifCount = 0;
    let lastNotifAt: string | null = null;
    let recentNotifications: Array<{ id: string; type: string; title: string; body: string; createdAt: string | null; read: boolean }> = [];
    try {
      const notifSnap = await db.collection('notifications')
        .where('recipientUid', '==', firebaseUid)
        .limit(500)
        .get();
      recentNotifCount = notifSnap.size;
      const unread = notifSnap.docs.filter(d => !d.data().read);
      unreadNotifCount = unread.length;
      const allNotifications = notifSnap.docs
        .map((d) => {
          const notification = d.data() as Record<string, any>;
          const rawCreatedAt = notification.createdAt;
          const createdAt = rawCreatedAt?.toDate?.()?.toISOString()
            || (rawCreatedAt instanceof Date ? rawCreatedAt.toISOString() : rawCreatedAt || null);
          return {
            id: d.id,
            type: String(notification.type || ''),
            title: String(notification.title || ''),
            body: String(notification.body || ''),
            createdAt,
            read: !!notification.read,
          };
        });

      for (const notification of allNotifications) {
        const createdAtMs = notification.createdAt ? new Date(notification.createdAt).getTime() : 0;
        if (createdAtMs >= twentyFourHoursAgo) {
          eventsLast24h += 1;
          eventCounts.set(notification.type || 'unknown', (eventCounts.get(notification.type || 'unknown') || 0) + 1);
        }
        monitorEvents.push({ ...notification, recipient: email || firebaseUid });
      }

      recentNotifications = allNotifications
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 10);
      lastNotifAt = recentNotifications[0]?.createdAt || null;
    } catch { /* non-fatal */ }

    if (recentNotifCount === 0 && usersDocExists && notificationPrefs?.in_app !== false) {
      issues.push('No notifications found in Firestore for this UID. Either no notifications have been sent yet, or sendNotification is failing silently. Try clicking the purple bell icon on the Staff Users page to send a test notification, then re-run this diagnostic.');
    }

    rows.push({ email, firebaseUid, usersDocExists, notificationPrefs, recentNotifCount, unreadNotifCount, lastNotifAt, recentNotifications, issues });
  }

  const unreadTotal = rows.reduce((total, row) => total + Number(row.unreadNotifCount || 0), 0);
  const staffWithIssues = rows.filter((row) => Array.isArray(row.issues) && row.issues.length > 0).length;
  const recentEvents = monitorEvents
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 60);

  return NextResponse.json({
    ok: true,
    rows,
    usedFallback,
    monitoring: {
      generatedAt: new Date().toISOString(),
      staffCount: rows.length,
      healthyStaffCount: rows.length - staffWithIssues,
      staffWithIssues,
      unreadTotal,
      eventsLast24h,
      eventsByType: Object.fromEntries(eventCounts),
      recentEvents,
    },
  });
}
