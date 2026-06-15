// GET /api/broker/recruiting-pipeline  — list all pipeline candidates
// POST /api/broker/recruiting-pipeline — create a new candidate
// PATCH /api/broker/recruiting-pipeline — update a candidate
// DELETE /api/broker/recruiting-pipeline — delete a candidate
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
  try {
    const snap = await adminDb.collection('recruitingPipeline')
      .orderBy('createdAt', 'desc').get();
    const candidates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, candidates });
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
      name, source, recruiter, status, expectedStartDate,
      phone, email, currentBrokerage, notes,
      followUpDate, followUpAction,
    } = body;
    if (!name?.trim()) return jsonError(400, 'name is required');
    const now = new Date().toISOString();
    const doc = {
      name: name.trim(),
      source: source?.trim() || null,
      recruiter: recruiter?.trim() || null,
      status: status || 'prospect',
      expectedStartDate: expectedStartDate || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      currentBrokerage: currentBrokerage?.trim() || null,
      notes: notes?.trim() || null,
      followUpDate: followUpDate?.trim() || null,
      followUpAction: followUpAction?.trim() || null,
      lastContactedAt: null,
      stageEnteredAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: decoded.uid,
    };
    const ref = await adminDb.collection('recruitingPipeline').add(doc);
    return NextResponse.json({ ok: true, id: ref.id, candidate: { id: ref.id, ...doc } });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function PATCH(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return jsonError(400, 'id is required');
    const ref = adminDb.collection('recruitingPipeline').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, 'Candidate not found');
    const now = new Date().toISOString();
    const cleaned: Record<string, any> = { updatedAt: now };
    const allowed = [
      'name','source','recruiter','status','expectedStartDate','phone','email','currentBrokerage','notes',
      'followUpDate','followUpAction','lastContactedAt',
    ];
    for (const key of allowed) {
      if (key in updates) cleaned[key] = updates[key] ?? null;
    }
    // If status changed, record when they entered the new stage
    const prevData = snap.data();
    if (updates.status && updates.status !== prevData?.status) {
      cleaned.stageEnteredAt = now;
      // Auto-log a stage change activity
      await adminDb.collection('recruitingPipelineActivity').add({
        candidateId: id,
        type: 'stage_change',
        summary: `Stage changed: ${prevData?.status || 'unknown'} → ${updates.status}`,
        notes: null,
        authorUid: decoded.uid,
        authorName: 'System',
        followUpDate: null,
        followUpAction: null,
        createdAt: now,
      });
    }
    await ref.update(cleaned);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return jsonError(400, 'id is required');
    await adminDb.collection('recruitingPipeline').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
