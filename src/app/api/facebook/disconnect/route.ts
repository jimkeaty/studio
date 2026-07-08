// src/app/api/facebook/disconnect/route.ts
// Removes the stored Facebook access token for the authenticated agent.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  try {
    // Remove from users doc
    await adminDb.collection('users').doc(uid).update({
      facebookToken: FieldValue.delete(),
      facebookUserId: FieldValue.delete(),
      facebookName: FieldValue.delete(),
      facebookTokenExpiresAt: FieldValue.delete(),
      facebookConnectedAt: FieldValue.delete(),
    });

    // Also remove from agentProfiles doc
    const profileQuery = await adminDb
      .collection('agentProfiles')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();
    if (!profileQuery.empty) {
      await profileQuery.docs[0].ref.update({
        facebookToken: FieldValue.delete(),
        facebookUserId: FieldValue.delete(),
        facebookName: FieldValue.delete(),
        facebookTokenExpiresAt: FieldValue.delete(),
        facebookConnectedAt: FieldValue.delete(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Facebook/disconnect] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
