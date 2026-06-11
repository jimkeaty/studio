// POST /api/admin/fix-agent-uid — admin-only
// Stamps the correct Firebase Auth UID onto an agent profile doc.
// Looks up the agent by email in Firebase Auth, then updates the profile doc.
// Body: { profileDocId: string } OR { email: string }
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const isAdmin = await isAdminLike(decoded.uid);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { profileDocId, email } = body;

    if (!profileDocId && !email) {
      return NextResponse.json({ error: 'profileDocId or email required' }, { status: 400 });
    }

    // Get the profile doc
    let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let profileEmail = email;

    if (profileDocId) {
      profileDoc = await adminDb.collection('agentProfiles').doc(profileDocId).get();
      if (!profileDoc.exists) {
        return NextResponse.json({ error: `Profile doc "${profileDocId}" not found` }, { status: 404 });
      }
      profileEmail = profileEmail || profileDoc.data()?.email;
    } else {
      // Find profile by email
      const snap = await adminDb.collection('agentProfiles').where('email', '==', email).limit(1).get();
      if (snap.empty) {
        return NextResponse.json({ error: `No profile found with email "${email}"` }, { status: 404 });
      }
      profileDoc = snap.docs[0];
    }

    if (!profileEmail) {
      return NextResponse.json({ error: 'Profile has no email — cannot look up Firebase Auth UID' }, { status: 400 });
    }

    // Look up Firebase Auth by email
    let authUser;
    try {
      authUser = await adminAuth.getUserByEmail(profileEmail);
    } catch (e: any) {
      return NextResponse.json({ error: `No Firebase Auth account found for email "${profileEmail}": ${e.message}` }, { status: 404 });
    }

    const oldFirebaseUid = profileDoc!.data()?.firebaseUid;
    const newFirebaseUid = authUser.uid;

    if (oldFirebaseUid === newFirebaseUid) {
      return NextResponse.json({
        ok: true,
        message: 'firebaseUid already correct — no update needed',
        profileDocId: profileDoc!.id,
        firebaseUid: newFirebaseUid,
      });
    }

    // Update the profile
    await adminDb.collection('agentProfiles').doc(profileDoc!.id).update({ firebaseUid: newFirebaseUid });

    return NextResponse.json({
      ok: true,
      message: `✅ Updated firebaseUid on profile "${profileDoc!.id}"`,
      profileDocId: profileDoc!.id,
      email: profileEmail,
      oldFirebaseUid: oldFirebaseUid || '(was missing)',
      newFirebaseUid,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
