// GET    /api/broker/agent-attendance?agentId=xxx           — get attendance records for an agent
// GET    /api/broker/agent-attendance?agentId=xxx&type=huddle — filter by type
// POST   /api/broker/agent-attendance                        — log an attendance record (admin)
// PATCH  /api/broker/agent-attendance                        — update a record (admin)
// DELETE /api/broker/agent-attendance?id=xxx                 — delete a record (admin)
//
// Also supports Smart Academy progress update via type='academy'
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
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
  let uid: string;
  let isAdmin = false;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    uid = decoded.uid;
    isAdmin = await isAdminLike(uid);
  } catch { return jsonError(401, 'Unauthorized'); }

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  const type = searchParams.get('type'); // 'huddle' | 'training' | 'floor_time' | 'academy' | null (all)

  if (!agentId) return jsonError(400, 'agentId is required');

  // Agents can only see their own
  if (!isAdmin) {
    const profileSnap = await adminDb.collection('agentProfiles')
      .where('uid', '==', uid).limit(1).get();
    if (profileSnap.empty || profileSnap.docs[0].id !== agentId) {
      return jsonError(403, 'Forbidden');
    }
  }

  try {
    let query: FirebaseFirestore.Query = adminDb
      .collection('agentAttendance')
      .where('agentId', '==', agentId);

    if (type) query = query.where('type', '==', type);

    const snap = await query.orderBy('date', 'desc').get();
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Compute summary stats
    const huddles = records.filter(r => (r as any).type === 'huddle');
    const training = records.filter(r => (r as any).type === 'training');
    const floorTime = records.filter(r => (r as any).type === 'floor_time');
    const academy = records.filter(r => (r as any).type === 'academy');

    const summary = {
      huddlesAttended: huddles.length,
      trainingSessionsAttended: training.length,
      totalTrainingMinutes: training.reduce((s, r) => s + ((r as any).durationMinutes || 0), 0),
      floorTimeSessions: floorTime.length,
      totalFloorTimeMinutes: floorTime.reduce((s, r) => s + ((r as any).durationMinutes || 0), 0),
      academyProgressPct: academy.length > 0 ? (academy[0] as any).progressPct || 0 : 0,
      academyCurrentModule: academy.length > 0 ? (academy[0] as any).currentModule || null : null,
      academyLastUpdated: academy.length > 0 ? (academy[0] as any).date || null : null,
    };

    return NextResponse.json({ ok: true, records, summary });
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
      agentId,
      type,           // 'huddle' | 'training' | 'floor_time' | 'academy'
      date,           // ISO date YYYY-MM-DD
      durationMinutes,
      topic,          // for training/huddle: what was covered
      notes,
      // Academy-specific
      progressPct,
      currentModule,
    } = body;

    if (!agentId?.trim()) return jsonError(400, 'agentId is required');
    if (!type?.trim()) return jsonError(400, 'type is required');
    if (!date?.trim()) return jsonError(400, 'date is required');

    const doc: Record<string, any> = {
      agentId: agentId.trim(),
      type: type.trim(),
      date: date.trim(),
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      topic: topic?.trim() || null,
      notes: notes?.trim() || null,
      loggedByUid: decoded.uid,
      createdAt: new Date().toISOString(),
    };

    if (type === 'academy') {
      doc.progressPct = progressPct ? Number(progressPct) : null;
      doc.currentModule = currentModule?.trim() || null;
    }

    const ref = await adminDb.collection('agentAttendance').add(doc);
    return NextResponse.json({ ok: true, id: ref.id, record: { id: ref.id, ...doc } });
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

    const ref = adminDb.collection('agentAttendance').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, 'Record not found');

    const allowed = ['date', 'durationMinutes', 'topic', 'notes', 'progressPct', 'currentModule'];
    const cleaned: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (key in updates) cleaned[key] = updates[key] ?? null;
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

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return jsonError(400, 'id is required');

  try {
    await adminDb.collection('agentAttendance').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
