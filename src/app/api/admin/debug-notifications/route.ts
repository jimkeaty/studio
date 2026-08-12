// GET  /api/admin/debug-notifications?email=anna@...
//      Diagnose notification setup for a staff user — shows staffUsers record,
//      users/{uid} doc, notification prefs, and recent notifications.
//
// POST /api/admin/debug-notifications
//      Body: { email: string }
//      Force-links the Firebase UID for the given email by looking up the
//      Firebase Auth user record and writing firebaseUid to the staffUsers doc.
//      Also creates a minimal users/{uid} doc if one doesn't exist.
//      Use this to fix Anna Cain (or any staff member) without requiring them to log in.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// ── GET: diagnose ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const callerUid = await requireAdmin(req);
  if (!callerUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = req.nextUrl.searchParams.get('email') || '';

  // 1. Find staffUsers record — try exact match first, then case-insensitive scan
  let staffDocData: any = null;
  let staffDocId: string | null = null;
  const exactSnap = await adminDb.collection('staffUsers')
    .where('email', '==', email.toLowerCase().trim()).limit(1).get();
  if (!exactSnap.empty) {
    staffDocData = exactSnap.docs[0].data();
    staffDocId = exactSnap.docs[0].id;
  } else {
    const allSnap = await adminDb.collection('staffUsers').get();
    const match = allSnap.docs.find(d => (d.data().email || '').toLowerCase() === email.toLowerCase().trim());
    if (match) { staffDocData = match.data(); staffDocId = match.id; }
  }

  const firebaseUid = staffDocData?.firebaseUid || null;

  // 2. Try to resolve Firebase Auth UID from email (even if staffUsers.firebaseUid is missing)
  let authUid: string | null = null;
  try {
    const authUser = await adminAuth.getUserByEmail(email.toLowerCase().trim());
    authUid = authUser.uid;
  } catch { /* user may not exist in Firebase Auth */ }

  // 3. Find users/{uid} record
  let userDoc: any = null;
  const uidToCheck = firebaseUid || authUid;
  if (uidToCheck) {
    const uSnap = await adminDb.collection('users').doc(uidToCheck).get();
    userDoc = uSnap.exists ? uSnap.data() : null;
  }

  // 4. Check recent notifications
  let recentNotifs: any[] = [];
  if (uidToCheck) {
    try {
      // Avoid requiring a composite index solely for this diagnostic endpoint.
      // Notification timestamps can be Firestore Timestamp objects or legacy
      // ISO strings, so sort after reading the recipient's recent records.
      const nSnap = await adminDb.collection('notifications')
        .where('recipientUid', '==', uidToCheck)
        .limit(100)
        .get();
      recentNotifs = nSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const toMillis = (value: any) => {
            if (value?.toDate) return value.toDate().getTime();
            const parsed = new Date(value || 0).getTime();
            return Number.isFinite(parsed) ? parsed : 0;
          };
          return toMillis(b.createdAt) - toMillis(a.createdAt);
        })
        .slice(0, 10);
    } catch (e: any) {
      recentNotifs = [{ error: e.message }];
    }
  }

  // 5. Show all staffUsers UIDs
  const allStaffSnap = await adminDb.collection('staffUsers').get();
  const allStaffUsers = allStaffSnap.docs.map(d => ({
    docId: d.id,
    email: d.data().email,
    firebaseUid: d.data().firebaseUid || null,
    role: d.data().role,
    status: d.data().status || 'no status field',
    displayName: d.data().displayName,
  }));

  const diagnosis: string[] = [];
  if (!staffDocData) diagnosis.push('❌ No staffUsers record found for this email');
  if (staffDocData && !firebaseUid && !authUid) diagnosis.push('❌ No firebaseUid on staffUsers record AND no Firebase Auth account found — user has never signed in');
  if (staffDocData && !firebaseUid && authUid) diagnosis.push('⚠️  Firebase Auth UID found but NOT linked to staffUsers record — POST to this endpoint to fix');
  if (firebaseUid && !userDoc) diagnosis.push('⚠️  staffUsers.firebaseUid is set but no users/{uid} doc exists — POST to this endpoint to create it');
  if (firebaseUid && userDoc) diagnosis.push('✅ staffUsers.firebaseUid is set and users/{uid} doc exists');
  if (recentNotifs.length === 0 && uidToCheck) diagnosis.push('⚠️  No notifications found in Firestore for this UID — notifications may not be reaching this user');
  if (recentNotifs.length > 0) diagnosis.push(`✅ ${recentNotifs.length} recent notification(s) found in Firestore`);

  return NextResponse.json({
    queried_email: email,
    diagnosis,
    staffUsers_record: staffDocData
      ? { docId: staffDocId, role: staffDocData.role, status: staffDocData.status, firebaseUid: staffDocData.firebaseUid || null, email: staffDocData.email, displayName: staffDocData.displayName }
      : 'NOT FOUND in staffUsers',
    firebase_auth_uid: authUid || 'NOT FOUND in Firebase Auth',
    linked_uid: firebaseUid || null,
    users_doc: userDoc
      ? { email: userDoc.email, displayName: userDoc.displayName, notificationPrefs: userDoc.notificationPrefs ?? 'not set (defaults: in_app=true, email=true, sms=false)' }
      : (uidToCheck ? 'NOT FOUND in users collection' : 'cannot check — no UID'),
    recent_notifications: recentNotifs.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      read: n.read,
      createdAt: typeof n.createdAt?.toDate === 'function' ? n.createdAt.toDate().toISOString() : n.createdAt,
    })),
    all_staff_users: allStaffUsers,
  });
}

// ── POST: force-link Firebase UID for a staff user ────────────────────────────
export async function POST(req: NextRequest) {
  const callerUid = await requireAdmin(req);
  if (!callerUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').toLowerCase().trim();
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  // 1. Find Firebase Auth UID for this email
  let authUid: string;
  let authDisplayName = '';
  try {
    const authUser = await adminAuth.getUserByEmail(email);
    authUid = authUser.uid;
    authDisplayName = authUser.displayName || '';
  } catch {
    return NextResponse.json({ ok: false, error: `No Firebase Auth account found for ${email}. The user must sign in at least once before their UID can be linked.` }, { status: 404 });
  }

  // 2. Find staffUsers record
  let staffDocRef: FirebaseFirestore.DocumentReference | null = null;
  let staffDocData: any = null;
  const exactSnap = await adminDb.collection('staffUsers')
    .where('email', '==', email).limit(1).get();
  if (!exactSnap.empty) {
    staffDocRef = exactSnap.docs[0].ref;
    staffDocData = exactSnap.docs[0].data();
  } else {
    const allSnap = await adminDb.collection('staffUsers').get();
    const match = allSnap.docs.find(d => (d.data().email || '').toLowerCase() === email);
    if (match) { staffDocRef = match.ref; staffDocData = match.data(); }
  }

  if (!staffDocRef) {
    return NextResponse.json({ ok: false, error: `No staffUsers record found for ${email}. Create the staff user first.` }, { status: 404 });
  }

  // 3. Link the UID
  await staffDocRef.update({
    firebaseUid: authUid,
    status: 'active',
    updatedAt: new Date().toISOString(),
  });

  // 4. Ensure users/{uid} doc exists with correct fields
  const userRef = adminDb.collection('users').doc(authUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      uid: authUid,
      email,
      displayName: authDisplayName || staffDocData?.displayName || '',
      role: staffDocData?.role || 'staff',
      notificationPrefs: { in_app: true, email: true, sms: false, push: true },
      createdAt: new Date().toISOString(),
    });
  } else {
    // Ensure notificationPrefs exists
    const existing = userSnap.data() as any;
    if (!existing.notificationPrefs) {
      await userRef.update({ notificationPrefs: { in_app: true, email: true, sms: false, push: true } });
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Successfully linked ${email} → Firebase UID ${authUid}`,
    firebaseUid: authUid,
    staffUsersDocId: staffDocRef.id,
    role: staffDocData?.role,
  });
}
