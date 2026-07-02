/**
 * /api/community/archived
 *
 * GET  — fetch all archived posts for the current user across all 4 collections
 * POST { collection, postId } — re-add an archived post (set status back to active)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTIONS = [
  { name: 'buyerNeeds',         label: 'Buyer Need',             emoji: '🔍' },
  { name: 'comingSoonListings', label: 'Coming Soon Listing',     emoji: '⏰' },
  { name: 'openHouseListings',  label: 'Open House Opportunity', emoji: '🏠' },
  { name: 'agentHelpRequests',  label: 'Agent Help Request',     emoji: '🤝' },
] as const;

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

async function getOwnerIdSet(uid: string): Promise<Set<string>> {
  const ids = new Set([uid]);
  try {
    const byFbUid = await adminDb.collection('agentProfiles')
      .where('firebaseUid', '==', uid).limit(1).get();
    if (!byFbUid.empty) {
      ids.add(byFbUid.docs[0].id);
      const d = byFbUid.docs[0].data();
      if (d?.agentId) ids.add(String(d.agentId));
    }
    const byId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byId.exists) {
      const d = byId.data()!;
      if (d?.agentId) ids.add(String(d.agentId));
      if (d?.firebaseUid) ids.add(String(d.firebaseUid));
    }
  } catch { /* ignore */ }
  return ids;
}

export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const ownerIds = await getOwnerIdSet(auth.uid);
    const allArchived: any[] = [];

    for (const col of COLLECTIONS) {
      // Query by status=archived — Firestore doesn't support OR queries across fields,
      // so we fetch all archived and filter client-side by ownership
      const snap = await adminDb
        .collection(col.name)
        .where('status', '==', 'archived')
        .get();

      for (const doc of snap.docs) {
        const data = doc.data();
        // Only show the agent's own archived posts
        const isOwner =
          ownerIds.has(data.createdByUid ?? '') ||
          ownerIds.has(data.agentProfileId ?? '');
        if (!isOwner) continue;

        allArchived.push({
          id: doc.id,
          collection: col.name,
          label: col.label,
          emoji: col.emoji,
          ...data,
          archivedAt: data.archivedAt?.toDate?.()?.toISOString() ?? data.archivedAt ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt ?? null,
        });
      }
    }

    // Sort by archivedAt descending
    allArchived.sort((a, b) => {
      const ta = a.archivedAt ?? a.createdAt ?? '';
      const tb = b.archivedAt ?? b.createdAt ?? '';
      return tb > ta ? 1 : -1;
    });

    return NextResponse.json({ ok: true, items: allArchived });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { collection, postId } = await req.json();
    if (!collection || !postId) {
      return NextResponse.json({ ok: false, error: 'collection and postId are required' }, { status: 400 });
    }

    const validCols = COLLECTIONS.map(c => c.name);
    if (!validCols.includes(collection)) {
      return NextResponse.json({ ok: false, error: 'Invalid collection' }, { status: 400 });
    }

    const ref = adminDb.collection(collection).doc(postId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const data = snap.data()!;
    const ownerIds = await getOwnerIdSet(auth.uid);
    const isOwner =
      ownerIds.has(data.createdByUid ?? '') ||
      ownerIds.has(data.agentProfileId ?? '');
    if (!isOwner) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    await ref.update({
      status: 'active',
      lastConfirmedAt: now,
      archivedAt: FieldValue.delete(),
      archivedReason: FieldValue.delete(),
      renewalPromptSentAt: FieldValue.delete(),
      readdedAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
