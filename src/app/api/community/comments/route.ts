/**
 * /api/community/comments
 *
 * GET  ?collection=buyerNeeds&postId=abc123   — fetch all comments for a post
 * POST { collection, postId, text }           — add a comment (auth required)
 *
 * Comments are stored in a subcollection:
 *   {collection}/{postId}/comments/{commentId}
 *
 * Each comment document:
 *   { text, agentName, agentProfileId, createdAt, updatedAt? }
 *
 * Supported collections: buyerNeeds, comingSoonListings, openHouseListings, agentHelpRequests
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const ALLOWED_COLLECTIONS = new Set([
  'buyerNeeds',
  'comingSoonListings',
  'openHouseListings',
  'agentHelpRequests',
]);

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collection = searchParams.get('collection');
  const postId = searchParams.get('postId');

  if (!collection || !postId) {
    return NextResponse.json({ ok: false, error: 'collection and postId are required' }, { status: 400 });
  }
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json({ ok: false, error: 'Invalid collection' }, { status: 400 });
  }

  try {
    const snap = await adminDb
      .collection(collection)
      .doc(postId)
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .get();

    const comments = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? d.data().updatedAt ?? null,
    }));

    return NextResponse.json({ ok: true, comments });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { collection, postId, text } = body;

    if (!collection || !postId || !text?.trim()) {
      return NextResponse.json({ ok: false, error: 'collection, postId, and text are required' }, { status: 400 });
    }
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      return NextResponse.json({ ok: false, error: 'Invalid collection' }, { status: 400 });
    }
    if (text.trim().length > 1000) {
      return NextResponse.json({ ok: false, error: 'Comment too long (max 1000 characters)' }, { status: 400 });
    }

    // Verify the parent post exists and is active
    const postRef = adminDb.collection(collection).doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 });
    }

    // Look up the agent's display name from their profile
    let agentName = 'Agent';
    let agentProfileId = auth.uid;
    try {
      const profileSnap = await adminDb.collection('agentProfiles')
        .where('firebaseUid', '==', auth.uid)
        .limit(1)
        .get();
      if (!profileSnap.empty) {
        const p = profileSnap.docs[0].data();
        agentName = p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Agent';
        agentProfileId = profileSnap.docs[0].id;
      } else {
        // Try by doc ID
        const byId = await adminDb.collection('agentProfiles').doc(auth.uid).get();
        if (byId.exists) {
          const p = byId.data()!;
          agentName = p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Agent';
          agentProfileId = byId.id;
        }
      }
    } catch { /* use defaults */ }

    const commentRef = await postRef.collection('comments').add({
      text: text.trim(),
      agentName,
      agentProfileId,
      createdByUid: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: commentRef.id, agentName });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
