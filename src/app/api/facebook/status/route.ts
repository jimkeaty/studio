// src/app/api/facebook/status/route.ts
// Returns the Facebook connection status for the authenticated agent.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ connected: false, error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ connected: false, error: 'Invalid token' }, { status: 401 });
  }

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const data = userDoc.data() || {};
    const facebookToken = data.facebookToken as string | undefined;
    const facebookName = data.facebookName as string | undefined;
    const facebookUserId = data.facebookUserId as string | undefined;
    const expiresAt = data.facebookTokenExpiresAt as string | undefined;

    if (!facebookToken) {
      return NextResponse.json({ connected: false });
    }

    // Check if token is expired
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

    return NextResponse.json({
      connected: !isExpired,
      expired: isExpired,
      facebookName: facebookName || null,
      facebookUserId: facebookUserId || null,
      expiresAt: expiresAt || null,
    });
  } catch (err: any) {
    console.error('[Facebook/status] Error:', err);
    return NextResponse.json({ connected: false, error: err.message }, { status: 500 });
  }
}
