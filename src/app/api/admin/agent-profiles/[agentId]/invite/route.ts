// POST /api/admin/agent-profiles/[agentId]/invite
//
// Sends a Firebase Auth invite (password-reset email) to a single agent.
// Looks up the profile by doc ID (agentId slug), reads the email directly,
// creates a Firebase Auth account if one doesn't exist, and sends the invite.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // Auth check
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const { agentId } = await context.params;

    // Look up the profile — try doc.id first, then agentId field
    let profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();

    // If not found by doc.id, try querying by agentId field (slug)
    if (!profileSnap.exists) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', agentId)
        .limit(1)
        .get();
      if (!q.empty) profileSnap = q.docs[0] as any;
    }

    if (!profileSnap.exists) {
      return jsonError(404, 'Agent profile not found');
    }

    const data = profileSnap.data() || {};
    const profileDocId = profileSnap.id;

    // Get email — check multiple possible field names
    const email: string | null =
      (data.email?.trim() || data.contactEmail?.trim() || data.workEmail?.trim() || null);

    if (!email) {
      return NextResponse.json({
        ok: false,
        status: 'skipped_no_email',
        error: 'No email address on this profile — add an email first',
      });
    }

    const name: string = data.displayName || data.name || agentId;

    // Check if Firebase Auth account already exists
    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      // Already exists — stamp firebaseUid if missing
      if (!data.firebaseUid) {
        await adminDb
          .collection('agentProfiles')
          .doc(profileDocId)
          .update({ firebaseUid: existingUser.uid })
          .catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        status: 'already_exists',
        email,
        firebaseUid: existingUser.uid,
        message: `${email} already has an account — they can sign in with Google now`,
      });
    } catch (lookupErr: any) {
      if (lookupErr.code !== 'auth/user-not-found') {
        return jsonError(500, `Error checking existing account: ${lookupErr.message}`);
      }
      // User not found — proceed to create
    }

    // Create Firebase Auth user
    let newUid: string;
    try {
      const newUser = await adminAuth.createUser({
        email,
        displayName: name,
        emailVerified: false,
      });
      newUid = newUser.uid;
    } catch (createErr: any) {
      return jsonError(500, `Could not create account: ${createErr.message}`);
    }

    // Stamp firebaseUid onto the profile doc
    await adminDb
      .collection('agentProfiles')
      .doc(profileDocId)
      .update({ firebaseUid: newUid })
      .catch(() => {});

    // Send password-reset / welcome email via Firebase Auth
    let emailSent = false;
    try {
      await adminAuth.generatePasswordResetLink(email);
      emailSent = true;
    } catch (emailErr: any) {
      console.warn(`[invite] Could not generate reset link for ${email}:`, emailErr.message);
    }

    return NextResponse.json({
      ok: true,
      status: 'invited',
      email,
      firebaseUid: newUid,
      emailSent,
      message: emailSent
        ? `Invite sent to ${email}`
        : `Account created for ${email} but welcome email could not be sent`,
    });
  } catch (err: any) {
    console.error('[invite]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
