// src/app/api/facebook/connect/route.ts
// Initiates Facebook OAuth flow for an agent to connect their Facebook account.
// The agent must be authenticated (Firebase ID token in Authorization header).
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';

// The redirect URI must be registered in the Facebook App Dashboard under
// Facebook Login > Settings > Valid OAuth Redirect URIs
const REDIRECT_URI = `${APP_URL}/api/facebook/callback`;

// Permissions needed:
// - publish_to_groups: post to the KRE Agents group on behalf of the user
// - groups_access_member_info: verify group membership (optional)
const SCOPES = ['publish_to_groups'].join(',');

export async function GET(req: NextRequest) {
  // Verify the agent is authenticated
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Encode the uid in the state parameter so we can retrieve it in the callback
  const state = Buffer.from(JSON.stringify({ uid, ts: Date.now() })).toString('base64url');

  const oauthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  oauthUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  oauthUrl.searchParams.set('scope', SCOPES);
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('response_type', 'code');

  return NextResponse.json({ url: oauthUrl.toString() });
}
