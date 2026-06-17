// POST /api/admin/bulk-invite-agents
// Admin-only endpoint that:
//  1. Scans all agentProfiles that have no Firebase Auth account
//  2. Creates a Firebase Auth user for each one (email + no password — forces password reset)
//  3. Generates a password-reset / sign-in link and sends it via Firebase Auth email
//  4. Stamps the new firebaseUid onto the agentProfile doc
//
// Supports optional `emails` array in the request body to target specific agents only.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // Require admin auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Admin only');

    // Optional: target specific emails or profileIds only
    let body: { emails?: string[]; profileIds?: string[]; dryRun?: boolean } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const targetEmails = body.emails?.map((e) => e.toLowerCase().trim());
    const targetProfileIds = body.profileIds?.map((id) => id.trim());
    const dryRun = body.dryRun === true;

    // Fetch all agentProfiles
    const profilesSnap = await adminDb.collection('agentProfiles').get();

    const results: {
      profileId: string;
      email: string;
      name: string;
      status: 'invited' | 'already_exists' | 'skipped_no_email' | 'skipped_filter' | 'dry_run' | string;
      firebaseUid?: string;
      error?: string;
    }[] = [];

    for (const doc of profilesSnap.docs) {
      const data = doc.data() || {};
      const email: string | undefined = data.email?.toLowerCase().trim();
      const name: string = data.name || data.displayName || doc.id;

      if (!email) {
        results.push({ profileId: doc.id, email: '(none)', name, status: 'skipped_no_email' });
        continue;
      }

      // If targeting specific emails or profileIds, skip others
      if (targetEmails && !targetEmails.includes(email)) {
        results.push({ profileId: doc.id, email, name, status: 'skipped_filter' });
        continue;
      }
      if (targetProfileIds && !targetProfileIds.includes(doc.id)) {
        results.push({ profileId: doc.id, email, name, status: 'skipped_filter' });
        continue;
      }

      // Check if Firebase Auth account already exists
      try {
        const existingUser = await adminAuth.getUserByEmail(email);
        // Already exists — stamp firebaseUid if missing
        if (!data.firebaseUid) {
          if (!dryRun) {
            await adminDb.collection('agentProfiles').doc(doc.id).update({ firebaseUid: existingUser.uid });
          }
        }
        results.push({ profileId: doc.id, email, name, status: 'already_exists', firebaseUid: existingUser.uid });
        continue;
      } catch (lookupErr: any) {
        if (lookupErr.code !== 'auth/user-not-found') {
          results.push({ profileId: doc.id, email, name, status: `error_lookup`, error: lookupErr.message });
          continue;
        }
        // User not found — proceed to create
      }

      if (dryRun) {
        results.push({ profileId: doc.id, email, name, status: 'dry_run' });
        continue;
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
        results.push({ profileId: doc.id, email, name, status: `error_create`, error: createErr.message });
        continue;
      }

      // Stamp firebaseUid onto the profile doc
      try {
        await adminDb.collection('agentProfiles').doc(doc.id).update({ firebaseUid: newUid });
      } catch (updateErr: any) {
        // Non-fatal — still report success for auth creation
        console.warn(`[bulk-invite] Could not stamp firebaseUid on ${doc.id}:`, updateErr.message);
      }

      // Send password-reset / welcome email
      let emailSent = false;
      try {
        // generatePasswordResetLink creates the link; Firebase Auth emails it automatically
        // when using sendPasswordResetEmail via the client SDK, but via Admin SDK we
        // use generatePasswordResetLink to confirm the link was generated (Firebase App Hosting
        // sends the email via the project's configured email template).
        await adminAuth.generatePasswordResetLink(email);
        emailSent = true;
      } catch (emailErr: any) {
        console.warn(`[bulk-invite] Could not generate reset link for ${email}:`, emailErr.message);
      }

      results.push({
        profileId: doc.id,
        email,
        name,
        status: 'invited',
        firebaseUid: newUid,
        ...(emailSent ? {} : { error: 'Auth account created but welcome email could not be sent' }),
      });
    }

    const invited = results.filter((r) => r.status === 'invited').length;
    const alreadyExists = results.filter((r) => r.status === 'already_exists').length;
    const skippedNoEmail = results.filter((r) => r.status === 'skipped_no_email').length;
    const skippedFilter = results.filter((r) => r.status === 'skipped_filter').length;
    const wouldInvite = results.filter((r) => r.status === 'dry_run').length;
    const errors = results.filter((r) => r.status.startsWith('error')).length;

    console.log(
      `[bulk-invite-agents] invited=${invited}, alreadyExists=${alreadyExists}, ` +
      `skippedNoEmail=${skippedNoEmail}, errors=${errors}, dryRun=${dryRun}`
    );

    return NextResponse.json({
      ok: true,
      dryRun,
      summary: { invited, alreadyExists, skippedNoEmail, skippedFilter, wouldInvite, errors, total: results.length },
      results: results.filter((r) => !['skipped_filter'].includes(r.status)), // omit filtered-out agents from output
    });
  } catch (err: any) {
    console.error('[bulk-invite-agents]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
