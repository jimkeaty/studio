/**
 * /api/agent/drafts/[draftId]
 * GET — load the full fields of a specific draft
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const token = getBearerToken(req);
  if (!token) return jsonError(401, 'Unauthorized');
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonError(401, 'Invalid token');
  }

  const { draftId } = await params;
  if (!draftId) return jsonError(400, 'draftId is required');

  try {
    const doc = await adminDb
      .collection('users')
      .doc(uid)
      .collection('transactionDrafts')
      .doc(draftId)
      .get();

    if (!doc.exists) return jsonError(404, 'Draft not found');

    const data = doc.data()!;
    // Verify ownership
    if (data.uid && data.uid !== uid) return jsonError(403, 'Forbidden');

    return NextResponse.json({
      ok: true,
      draftId: doc.id,
      fields: data.fields || {},
      label: data.label || null,
      savedAt: data.savedAt?.toDate?.()?.toISOString?.() ?? data.savedAt ?? null,
    });
  } catch (err: any) {
    return jsonError(500, err.message || 'Failed to load draft');
  }
}
