// GET    /api/broker/recruiting-pipeline/activity?candidateId=xxx  — list activity for a candidate
// POST   /api/broker/recruiting-pipeline/activity                   — log a new activity
// DELETE /api/broker/recruiting-pipeline/activity?id=xxx            — delete an activity entry
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get('candidateId');
  if (!candidateId) return jsonError(400, 'candidateId is required');

  try {
    const snap = await adminDb
      .collection('recruitingPipelineActivity')
      .where('candidateId', '==', candidateId)
      .orderBy('createdAt', 'desc')
      .get();
    const activities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, activities });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const {
      candidateId,
      type,       // 'call' | 'email' | 'text' | 'meeting' | 'note' | 'stage_change'
      summary,    // short description e.g. "Called, left voicemail"
      notes,      // optional longer notes
      authorName,
      // Follow-up fields — when logging a contact, set the next follow-up
      followUpDate,   // ISO date YYYY-MM-DD
      followUpAction, // e.g. "Send info packet" or "Schedule interview"
    } = body;

    if (!candidateId?.trim()) return jsonError(400, 'candidateId is required');
    if (!type?.trim()) return jsonError(400, 'type is required');
    if (!summary?.trim()) return jsonError(400, 'summary is required');

    const now = new Date().toISOString();

    const doc = {
      candidateId: candidateId.trim(),
      type: type.trim(),
      summary: summary.trim(),
      notes: notes?.trim() || null,
      authorUid: decoded.uid,
      authorName: authorName?.trim() || 'Recruiter',
      followUpDate: followUpDate?.trim() || null,
      followUpAction: followUpAction?.trim() || null,
      createdAt: now,
    };

    const ref = await adminDb.collection('recruitingPipelineActivity').add(doc);

    // Update the candidate's lastContactedAt and followUpDate on the main record
    const candidateRef = adminDb.collection('recruitingPipeline').doc(candidateId);
    const updateFields: Record<string, any> = {
      lastContactedAt: now,
      updatedAt: now,
    };
    if (followUpDate) updateFields.followUpDate = followUpDate;
    if (followUpAction) updateFields.followUpAction = followUpAction;
    await candidateRef.update(updateFields).catch(() => {}); // ignore if candidate not found

    return NextResponse.json({ ok: true, id: ref.id, activity: { id: ref.id, ...doc } });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return jsonError(400, 'id is required');

  try {
    await adminDb.collection('recruitingPipelineActivity').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
