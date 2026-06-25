import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const COL = 'buyerNeeds';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyToken(req: NextRequest) {
  const tok = bearer(req);
  if (!tok) return null;
  try { return await adminAuth.verifyIdToken(tok); } catch { return null; }
}

/**
 * Build the full set of identity values for a given uid.
 * Community posts may be stored under the Firebase UID, the Firestore profile doc ID,
 * or the agentId slug — this resolves all three so ownership checks work regardless
 * of which ID was used when the post was created.
 */
async function buildOwnerIdSet(uid: string): Promise<Set<string>> {
  const ids = new Set([uid]);
  try {
    const byId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byId.exists) {
      const d = byId.data();
      if (d?.agentId) ids.add(String(d.agentId));
      if (d?.firebaseUid) ids.add(String(d.firebaseUid));
    } else {
      // uid might be an agentId slug
      const bySlug = await adminDb.collection('agentProfiles')
        .where('agentId', '==', uid).limit(1).get();
      if (!bySlug.empty) {
        ids.add(bySlug.docs[0].id);
        const d = bySlug.docs[0].data();
        if (d?.firebaseUid) ids.add(String(d.firebaseUid));
      }
      // uid might be a Firebase UID stored in the firebaseUid field
      const byFbUid = await adminDb.collection('agentProfiles')
        .where('firebaseUid', '==', uid).limit(1).get();
      if (!byFbUid.empty) {
        ids.add(byFbUid.docs[0].id);
        const d = byFbUid.docs[0].data();
        if (d?.agentId) ids.add(String(d.agentId));
      }
    }
  } catch { /* ignore profile lookup errors */ }
  return ids;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    // Ownership check — must be the post owner or an admin
    const data = snap.data() as Record<string, any>;
    const admin = await isAdminLike(auth.uid);
    if (!admin) {
      const ownerIds = await buildOwnerIdSet(auth.uid);
      const isOwner =
        ownerIds.has(data.createdByUid ?? '') ||
        ownerIds.has(data.agentProfileId ?? '');
      if (!isOwner) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await req.json();
    await ref.update({ ...body, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyToken(req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const ref = adminDb.collection(COL).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    // Ownership check — must be the post owner or an admin
    const data = snap.data() as Record<string, any>;
    const admin = await isAdminLike(auth.uid);
    if (!admin) {
      const ownerIds = await buildOwnerIdSet(auth.uid);
      const isOwner =
        ownerIds.has(data.createdByUid ?? '') ||
        ownerIds.has(data.agentProfileId ?? '');
      if (!isOwner) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    await ref.update({ status: 'removed', removedAt: new Date().toISOString(), removedByUid: auth.uid });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
