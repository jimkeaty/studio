/**
 * /api/agent/drafts
 *
 * GET    — list all drafts for the calling agent
 * POST   — create or update a draft (body: { draftId?, fields, label? })
 * DELETE — delete a draft (body: { draftId })
 *
 * Drafts are stored in Firestore under: users/{uid}/transactionDrafts/{draftId}
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ── GET: list all drafts ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError(401, 'Unauthorized');
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  try {
    const snap = await adminDb
      .collection('users')
      .doc(uid)
      .collection('transactionDrafts')
      .orderBy('savedAt', 'desc')
      .limit(20)
      .get();

    const drafts = snap.docs.map((d) => {
      const data = d.data();
      return {
        draftId: d.id,
        label: data.label || null,
        address: data.fields?.address || null,
        clientName: data.fields?.clientName || null,
        salePrice: data.fields?.salePrice || null,
        savedAt: data.savedAt?.toDate?.()?.toISOString?.() ?? data.savedAt ?? null,
      };
    });

    return NextResponse.json({ ok: true, drafts });
  } catch (err: any) {
    return jsonError(500, err.message || 'Failed to load drafts');
  }
}

// ── POST: save or update a draft ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError(401, 'Unauthorized');
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  let body: { draftId?: string; fields: Record<string, unknown>; label?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  if (!body.fields || typeof body.fields !== 'object') {
    return jsonError(400, 'fields is required');
  }

  try {
    const draftsRef = adminDb.collection('users').doc(uid).collection('transactionDrafts');
    const docRef = body.draftId ? draftsRef.doc(body.draftId) : draftsRef.doc();

    await docRef.set({
      fields: body.fields,
      label: body.label || null,
      savedAt: new Date(),
      uid,
    }, { merge: true });

    return NextResponse.json({ ok: true, draftId: docRef.id });
  } catch (err: any) {
    return jsonError(500, err.message || 'Failed to save draft');
  }
}

// ── DELETE: delete a draft ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError(401, 'Unauthorized');
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  let body: { draftId: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  if (!body.draftId) return jsonError(400, 'draftId is required');

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('transactionDrafts')
      .doc(body.draftId)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message || 'Failed to delete draft');
  }
}
