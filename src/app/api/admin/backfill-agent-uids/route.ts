// POST /api/admin/backfill-agent-uids
// Admin-only endpoint that iterates all agentProfiles, looks up each agent's
// Firebase Auth UID by email, and stamps firebaseUid onto the profile doc.
// This is a one-time fix for the legacy data issue where agentProfile doc IDs
// don't match Firebase Auth UIDs, causing agents to see 0 transactions on login.
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

    // Fetch all agentProfiles
    const profilesSnap = await adminDb.collection('agentProfiles').get();
    const results: { profileId: string; email: string; status: string; firebaseUid?: string }[] = [];

    for (const doc of profilesSnap.docs) {
      const data = doc.data() || {};
      const email: string | undefined = data.email;

      if (!email) {
        results.push({ profileId: doc.id, email: '(none)', status: 'skipped_no_email' });
        continue;
      }

      // Already stamped — skip unless it looks wrong
      if (data.firebaseUid) {
        results.push({ profileId: doc.id, email, status: 'already_stamped', firebaseUid: data.firebaseUid });
        continue;
      }

      // Look up Firebase Auth user by email
      try {
        const authUser = await adminAuth.getUserByEmail(email);
        await adminDb.collection('agentProfiles').doc(doc.id).update({ firebaseUid: authUser.uid });
        results.push({ profileId: doc.id, email, status: 'stamped', firebaseUid: authUser.uid });
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          results.push({ profileId: doc.id, email, status: 'no_auth_user' });
        } else {
          results.push({ profileId: doc.id, email, status: `error: ${err.message}` });
        }
      }
    }

    const stamped = results.filter(r => r.status === 'stamped').length;
    const alreadyDone = results.filter(r => r.status === 'already_stamped').length;
    const noAuthUser = results.filter(r => r.status === 'no_auth_user').length;
    const skipped = results.filter(r => r.status === 'skipped_no_email').length;
    const errors = results.filter(r => r.status.startsWith('error')).length;

    console.log(`[backfill-agent-uids] stamped=${stamped}, already=${alreadyDone}, noAuth=${noAuthUser}, skipped=${skipped}, errors=${errors}`);

    return NextResponse.json({
      ok: true,
      summary: { stamped, alreadyDone, noAuthUser, skipped, errors, total: results.length },
      results,
    });
  } catch (err: any) {
    console.error('[backfill-agent-uids]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
