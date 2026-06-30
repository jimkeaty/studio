// POST /api/admin/staff-users/[userId]/relink
//
// Force-links a Firebase Auth account to a staffUsers Firestore record.
// Looks up the Firebase Auth user by the email stored in the staffUsers record,
// then writes their UID to staffUsers.firebaseUid.
//
// This fixes the case where a staff user was created before they first signed in,
// or where their email in Firestore doesn't exactly match their Firebase email.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    const callerIsAdmin = await isAdminLike(decoded.uid);
    if (!callerIsAdmin) return jsonError(403, 'Forbidden: Admin only');

    const { userId } = params;
    const docRef = adminDb.collection('staffUsers').doc(userId);
    const snap = await docRef.get();
    if (!snap.exists) return jsonError(404, 'Staff user not found');

    const data = snap.data()!;
    const email: string = data.email || '';
    if (!email) return jsonError(400, 'Staff user has no email address');

    // Look up Firebase Auth by email
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch {
      // Try case-insensitive — Firebase Auth is case-insensitive for email lookup
      try {
        firebaseUser = await adminAuth.getUserByEmail(email.toLowerCase());
      } catch {
        return jsonError(404, `No Firebase Auth account found for email: ${email}. The user may not have signed up yet.`);
      }
    }

    const firebaseUid = firebaseUser.uid;

    // Check if already linked to a different UID
    if (data.firebaseUid && data.firebaseUid !== firebaseUid) {
      // Overwrite — the admin explicitly requested a relink
      console.log(`[relink] Overwriting existing UID ${data.firebaseUid} → ${firebaseUid} for staffUsers/${userId}`);
    }

    // Write the UID
    await docRef.update({
      firebaseUid,
      updatedAt: new Date(),
    });

    console.log(`[relink] Linked staffUsers/${userId} (${email}) → firebaseUid=${firebaseUid}`);
    return NextResponse.json({ ok: true, linked: true, firebaseUid });
  } catch (err: any) {
    console.error('[POST /api/admin/staff-users/[userId]/relink]', err);
    return jsonError(500, err.message || 'Internal server error');
  }
}
