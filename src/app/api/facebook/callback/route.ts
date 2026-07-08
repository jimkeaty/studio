// src/app/api/facebook/callback/route.ts
// Handles the OAuth callback from Facebook.
// Exchanges the authorization code for a long-lived user access token,
// then stores it in the agent's Firestore profile doc.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
const REDIRECT_URI = `${APP_URL}/api/facebook/callback`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // User denied permission
  if (error) {
    console.error('[Facebook/callback] OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/notifications?fb=denied&reason=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/dashboard/settings/notifications?fb=error&reason=missing_code`);
  }

  // Decode state to get uid
  let uid: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    uid = decoded.uid;
    if (!uid) throw new Error('No uid in state');
    // Reject stale states (> 10 minutes)
    if (Date.now() - decoded.ts > 10 * 60 * 1000) throw new Error('State expired');
  } catch (e) {
    console.error('[Facebook/callback] Invalid state:', e);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings/notifications?fb=error&reason=invalid_state`);
  }

  try {
    // Step 1: Exchange code for short-lived access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        })
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error('[Facebook/callback] Token exchange error:', tokenData.error);
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings/notifications?fb=error&reason=${encodeURIComponent(tokenData.error.message)}`
      );
    }
    const shortLivedToken: string = tokenData.access_token;

    // Step 2: Exchange for long-lived token (valid ~60 days)
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          fb_exchange_token: shortLivedToken,
        })
    );
    const longLivedData = await longLivedRes.json();
    if (longLivedData.error) {
      console.error('[Facebook/callback] Long-lived token error:', longLivedData.error);
      // Fall back to short-lived token
    }
    const accessToken: string = longLivedData.access_token || shortLivedToken;
    const expiresIn: number = longLivedData.expires_in || tokenData.expires_in || 3600;

    // Step 3: Get the user's Facebook name and ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`
    );
    const meData = await meRes.json();
    const fbUserId: string = meData.id || '';
    const fbName: string = meData.name || '';

    // Step 4: Store in Firestore on the agent's profile
    // We store in two places: by Firebase UID (users doc) and agentProfiles doc
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update users doc
    await adminDb.collection('users').doc(uid).set(
      {
        facebookToken: accessToken,
        facebookUserId: fbUserId,
        facebookName: fbName,
        facebookTokenExpiresAt: expiresAt.toISOString(),
        facebookConnectedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Also update agentProfiles doc if it exists (by firebaseUid field)
    const profileQuery = await adminDb
      .collection('agentProfiles')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();
    if (!profileQuery.empty) {
      await profileQuery.docs[0].ref.set(
        {
          facebookToken: accessToken,
          facebookUserId: fbUserId,
          facebookName: fbName,
          facebookTokenExpiresAt: expiresAt.toISOString(),
          facebookConnectedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    console.log(`[Facebook/callback] Connected Facebook for uid=${uid}, fbUserId=${fbUserId}, name=${fbName}`);

    // Redirect back to settings with success
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/notifications?fb=connected&name=${encodeURIComponent(fbName)}`
    );
  } catch (err: any) {
    console.error('[Facebook/callback] Unexpected error:', err);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings/notifications?fb=error&reason=${encodeURIComponent(err.message || 'unknown')}`
    );
  }
}
