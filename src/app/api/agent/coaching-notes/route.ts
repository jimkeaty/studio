// GET  /api/agent/coaching-notes?agentId=xxx  — list notes for an agent
// POST /api/agent/coaching-notes               — add a note
// DELETE /api/agent/coaching-notes?id=xxx      — delete a note (admin only)
//
// Access rules:
//   - Admin/DAD: can read and write notes for any agent
//   - Agent: can read their own notes (read-only)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { sendNotification } from '@/lib/notifications/sendNotification';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function getCallerRole(req: NextRequest): Promise<{ uid: string; isAdmin: boolean } | null> {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    const admin = await isAdminLike(decoded.uid);
    return { uid: decoded.uid, isAdmin: admin };
  } catch { return null; }
}

// GET — list notes for an agent
export async function GET(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  if (!agentId) return jsonError(400, 'agentId is required');

  // Agents can only read their own notes
  if (!caller.isAdmin && caller.uid !== agentId) return jsonError(403, 'Forbidden');

  try {
    const snap = await adminDb
      .collection('coachingNotes')
      .where('agentId', '==', agentId)
      .orderBy('createdAt', 'desc')
      .get();
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, notes });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

// POST — add a coaching note
export async function POST(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');
  if (!caller.isAdmin) return jsonError(403, 'Only admin/DAD can add coaching notes');

  try {
    const body = await req.json();
    const { agentId, note, authorName } = body;
    if (!agentId?.trim()) return jsonError(400, 'agentId is required');
    if (!note?.trim()) return jsonError(400, 'note is required');

    const doc = {
      agentId: agentId.trim(),
      note: note.trim(),
      authorUid: caller.uid,
      authorName: authorName?.trim() || 'Director of Agent Development',
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb.collection('coachingNotes').add(doc);

    // Notify the agent
    try {
      const agentSnap = await adminDb.collection('agentProfiles').doc(agentId).get();
      const agentData = agentSnap.data();
      if (agentData?.uid) {
        await sendNotification(adminDb, {
          recipientUids: [agentData.uid],
          title: 'New Coaching Note from Your DAD',
          body: `${doc.authorName} left you a coaching note. Tap to view it on your dashboard.`,
          url: '/dashboard',
          type: 'system',
        });
      }
    } catch (notifErr) {
      console.error('[coaching-notes] notification failed:', notifErr);
    }

    return NextResponse.json({ ok: true, id: ref.id, note: { id: ref.id, ...doc } });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

// DELETE — remove a note (admin only)
export async function DELETE(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');
  if (!caller.isAdmin) return jsonError(403, 'Forbidden');

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return jsonError(400, 'id is required');

  try {
    await adminDb.collection('coachingNotes').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
