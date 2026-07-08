// src/app/api/facebook/post/route.ts
// Posts a message to the KRE Agents Facebook Group on behalf of the authenticated agent.
// The agent must have previously connected their Facebook account via OAuth.
//
// POST body:
//   postType: 'coming_soon' | 'buyer_needs' | 'open_house' | 'agent_needed'
//   message: string  (the full text to post — constructed by the caller)
//
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const FACEBOOK_GROUP_ID = process.env.FACEBOOK_GROUP_ID || '1590583281249545';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing Authorization bearer token' };
  }
  const token = authHeader.slice('Bearer '.length);
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

async function getAgentFacebookToken(uid: string): Promise<string | null> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  const data = userDoc.data() || {};
  const token = data.facebookToken as string | undefined;
  const expiresAt = data.facebookTokenExpiresAt as string | undefined;

  if (!token) return null;

  // Check expiry
  if (expiresAt && new Date(expiresAt) < new Date()) {
    console.warn(`[Facebook/post] Token expired for uid=${uid}`);
    return null;
  }

  return token;
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUser(req);
  } catch (e: any) {
    return jsonError(e.status ?? 401, e.message ?? 'Unauthorized');
  }

  let body: { postType?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { postType, message } = body;
  if (!message || !message.trim()) {
    return jsonError(400, 'message is required');
  }
  if (!postType) {
    return jsonError(400, 'postType is required');
  }

  // Get the agent's stored Facebook access token
  const accessToken = await getAgentFacebookToken(uid);
  if (!accessToken) {
    return NextResponse.json({
      ok: false,
      error: 'Facebook account not connected or token expired. Please reconnect your Facebook account in Settings.',
      code: 'fb/not-connected',
    }, { status: 403 });
  }

  // Post to the Facebook Group
  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${FACEBOOK_GROUP_ID}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          access_token: accessToken,
        }),
      }
    );

    const fbData = await fbRes.json();

    if (fbData.error) {
      console.error('[Facebook/post] Graph API error:', fbData.error);

      // Token revoked or expired — clear it from Firestore
      if (fbData.error.code === 190 || fbData.error.code === 200) {
        await adminDb.collection('users').doc(uid).update({
          facebookToken: null,
          facebookTokenExpiresAt: null,
        });
      }

      return NextResponse.json({
        ok: false,
        error: fbData.error.message || 'Facebook API error',
        fbErrorCode: fbData.error.code,
        code: 'fb/api-error',
      }, { status: 400 });
    }

    const postId: string = fbData.id || '';
    console.log(`[Facebook/post] Posted to group ${FACEBOOK_GROUP_ID}, postId=${postId}, uid=${uid}, type=${postType}`);

    // Log the post in Firestore for audit trail
    await adminDb.collection('facebookPosts').add({
      uid,
      postType,
      groupId: FACEBOOK_GROUP_ID,
      fbPostId: postId,
      messagePreview: message.slice(0, 200),
      postedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, postId });
  } catch (err: any) {
    console.error('[Facebook/post] Unexpected error:', err);
    return jsonError(500, err.message || 'Failed to post to Facebook');
  }
}
