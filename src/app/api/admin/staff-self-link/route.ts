// POST /api/admin/staff-self-link
//
// Called on every login for any authenticated user.
// If the caller's email matches a staffUsers record that has firebaseUid=null,
// this endpoint links their Firebase UID to that record so the role lookup works.
//
// CRITICAL: Also ensures users/{uid} doc exists with email + notificationPrefs.
// Without this doc, sendNotification cannot resolve the user's email or prefs,
// and in-app/bell notifications will never be written for staff/TC users.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const { uid, email } = decoded;
    if (!email) return NextResponse.json({ ok: false, error: 'No email on token' }, { status: 400 });

    // ── Helper: ensure users/{uid} doc exists with email + notificationPrefs ──
    // sendNotification reads users/{uid} to resolve email and notificationPrefs.
    // If this doc is missing, in-app notifications are never written for this user.
    async function ensureUserDoc(staffData: Record<string, any>) {
      try {
        const userRef = adminDb.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
          await userRef.set({
            email: email!.toLowerCase(),
            displayName: staffData.displayName || staffData.name || email,
            phone: staffData.phone || null,
            role: staffData.role || 'staff',
            notificationPrefs: { in_app: true, email: true, sms: false, push: true },
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`[staff-self-link] Created users/${uid} doc for ${email}`);
        } else {
          const existing = userDoc.data() as Record<string, any>;
          const updates: Record<string, any> = {};
          if (!existing.email) updates.email = email!.toLowerCase();
          if (!existing.notificationPrefs) {
            updates.notificationPrefs = { in_app: true, email: true, sms: false, push: true };
          }
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await userRef.update(updates);
            console.log(`[staff-self-link] Updated users/${uid} doc for ${email}:`, Object.keys(updates));
          }
        }
      } catch (e) {
        // Non-fatal — don't block login if this fails
        console.warn(`[staff-self-link] Could not ensure users/${uid} doc:`, e);
      }
    }

    // ── Check if this UID is already linked ───────────────────────────────────
    // Even for already-linked users, we still call ensureUserDoc so the
    // users/{uid} doc is created/updated on every login.
    const alreadyLinkedActive = await adminDb
      .collection('staffUsers')
      .where('firebaseUid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!alreadyLinkedActive.empty) {
      await ensureUserDoc(alreadyLinkedActive.docs[0].data() as Record<string, any>);
      return NextResponse.json({ ok: true, linked: false, role: alreadyLinkedActive.docs[0].data().role });
    }

    // Also check records without a status field (legacy records created before status was added)
    const alreadyLinkedAll = await adminDb
      .collection('staffUsers')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();
    if (!alreadyLinkedAll.empty) {
      await ensureUserDoc(alreadyLinkedAll.docs[0].data() as Record<string, any>);
      return NextResponse.json({ ok: true, linked: false, role: alreadyLinkedAll.docs[0].data().role });
    }

    // ── First-time link: find staffUsers record by email ──────────────────────
    // Exact lowercase match first
    let matchSnap = await adminDb
      .collection('staffUsers')
      .where('email', '==', email.toLowerCase())
      .where('status', '==', 'active')
      .limit(1)
      .get();

    // Fallback 1: case-insensitive scan of active records
    if (matchSnap.empty) {
      const allActive = await adminDb.collection('staffUsers').where('status', '==', 'active').get();
      const matchDoc = allActive.docs.find(
        (d) => (d.data().email || '').toLowerCase() === email.toLowerCase()
      );
      if (matchDoc) {
        matchSnap = { empty: false, docs: [matchDoc] } as any;
        console.log(`[staff-self-link] Case-insensitive active match for uid=${uid} email=${email} → doc=${matchDoc.id}`);
      }
    }

    // Fallback 2: scan ALL staffUsers records (catches legacy records without status field)
    if (matchSnap.empty) {
      const allStaff = await adminDb.collection('staffUsers').get();
      const matchDoc = allStaff.docs.find(
        (d) => (d.data().email || '').toLowerCase() === email.toLowerCase()
      );
      if (matchDoc) {
        matchSnap = { empty: false, docs: [matchDoc] } as any;
        console.log(`[staff-self-link] Legacy no-status match for uid=${uid} email=${email} → doc=${matchDoc.id}`);
        await matchDoc.ref.update({ status: 'active' }).catch(() => { /* non-fatal */ });
      }
    }

    if (matchSnap.empty) {
      // Not a staff user — normal agent login, no action needed
      return NextResponse.json({ ok: true, linked: false, role: null });
    }

    const doc = matchSnap.docs[0];
    const data = doc.data() as Record<string, any>;

    // Only link if firebaseUid is not yet set (or is null/empty)
    if (data.firebaseUid && data.firebaseUid !== uid) {
      console.log(`[staff-self-link] uid=${uid} email=${email} already linked to different uid=${data.firebaseUid}`);
      await ensureUserDoc(data);
      return NextResponse.json({ ok: true, linked: false, role: data.role });
    }

    // Link this Firebase UID to the staff record
    await doc.ref.update({ firebaseUid: uid, updatedAt: new Date() });
    console.log(`[staff-self-link] Linked uid=${uid} email=${email} to staffUsers/${doc.id} role=${data.role}`);

    // Ensure users/{uid} doc exists for this newly-linked staff member
    await ensureUserDoc(data);

    return NextResponse.json({ ok: true, linked: true, role: data.role });
  } catch (err: any) {
    console.error('[POST /api/admin/staff-self-link]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}
