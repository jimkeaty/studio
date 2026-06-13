// GET    /api/agent-competitions/[id]  — get single competition
// PATCH  /api/agent-competitions/[id]  — update (creator only)
// DELETE /api/agent-competitions/[id]  — delete (creator only)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}
type RouteContext = { params: Promise<{ competitionId: string }> };

async function resolveProfileId(uid: string): Promise<string> {
  const snap = await adminDb
    .collection('agentProfiles')
    .where('firebaseUid', '==', uid)
    .limit(1)
    .get();
  return snap.empty ? uid : snap.docs[0].id;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    await adminAuth.verifyIdToken(token);
    const { competitionId } = await ctx.params;
    const doc = await adminDb.collection('agentCompetitions').doc(competitionId).get();
    if (!doc.exists) return jsonError(404, 'Competition not found');
    return NextResponse.json({ ok: true, competition: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    const agentProfileId = await resolveProfileId(decoded.uid);
    const { competitionId } = await ctx.params;
    const ref = adminDb.collection('agentCompetitions').doc(competitionId);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, 'Competition not found');
    if (doc.data()!.createdBy !== agentProfileId) return jsonError(403, 'Only the creator can edit this competition');
    const updates = await req.json();
    await ref.update({ ...updates, updatedAt: new Date().toISOString() });
    const updated = await ref.get();
    return NextResponse.json({ ok: true, competition: { id: updated.id, ...updated.data() } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    const agentProfileId = await resolveProfileId(decoded.uid);
    const { competitionId } = await ctx.params;
    const ref = adminDb.collection('agentCompetitions').doc(competitionId);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, 'Competition not found');
    if (doc.data()!.createdBy !== agentProfileId) return jsonError(403, 'Only the creator can delete this competition');
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
