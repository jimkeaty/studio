// GET    /api/agent/one-on-ones?agentId=xxx         — list 1:1s for an agent
// GET    /api/agent/one-on-ones?upcoming=true        — all upcoming 1:1s (admin)
// GET    /api/agent/one-on-ones?overdue=true         — all overdue 1:1s (admin)
// POST   /api/agent/one-on-ones                      — schedule a new 1:1
// PATCH  /api/agent/one-on-ones                      — update / complete a 1:1
// DELETE /api/agent/one-on-ones?id=xxx               — delete a 1:1
//
// Access rules:
//   - Admin/DAD: full access for all agents
//   - Agent: can view their own 1:1s and request a new one
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

export async function GET(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  const upcoming = searchParams.get('upcoming') === 'true';
  const overdue = searchParams.get('overdue') === 'true';
  const today = new Date().toISOString().split('T')[0];

  try {
    let query: FirebaseFirestore.Query = adminDb.collection('oneOnOnes');

    if (agentId) {
      // Agents can only see their own
      if (!caller.isAdmin && caller.uid !== agentId) return jsonError(403, 'Forbidden');
      // Need to look up agentId by uid if caller is agent
      let resolvedAgentId = agentId;
      if (!caller.isAdmin) {
        // agentId might be the uid — resolve to profile id
        const profileSnap = await adminDb.collection('agentProfiles')
          .where('uid', '==', caller.uid).limit(1).get();
        if (!profileSnap.empty) resolvedAgentId = profileSnap.docs[0].id;
      }
      query = query.where('agentId', '==', resolvedAgentId);
    } else if (!caller.isAdmin) {
      // Non-admin without agentId — look up their own profile
      const profileSnap = await adminDb.collection('agentProfiles')
        .where('uid', '==', caller.uid).limit(1).get();
      if (profileSnap.empty) return NextResponse.json({ ok: true, oneOnOnes: [] });
      query = query.where('agentId', '==', profileSnap.docs[0].id);
    }

    if (upcoming) {
      query = query.where('scheduledDate', '>=', today).where('completedAt', '==', null);
    } else if (overdue) {
      query = query.where('scheduledDate', '<', today).where('completedAt', '==', null);
    }

    const snap = await query.orderBy('scheduledDate', 'asc').get();
    const oneOnOnes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, oneOnOnes });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const {
      agentId,       // profile doc id of the agent
      agentName,
      agentUid,      // firebase uid of the agent (for notification)
      scheduledDate, // ISO date string YYYY-MM-DD
      scheduledTime, // e.g. "10:00 AM"
      withWhom,      // "dad" | "broker"
      withName,      // display name of DAD or broker
      notes,
      requestedByAgent, // true if agent is requesting the 1:1
    } = body;

    if (!agentId?.trim()) return jsonError(400, 'agentId is required');
    if (!scheduledDate?.trim()) return jsonError(400, 'scheduledDate is required');

    // Agents can only request for themselves
    if (!caller.isAdmin) {
      const profileSnap = await adminDb.collection('agentProfiles')
        .where('uid', '==', caller.uid).limit(1).get();
      if (profileSnap.empty || profileSnap.docs[0].id !== agentId) {
        return jsonError(403, 'Agents can only request 1:1s for themselves');
      }
    }

    const doc = {
      agentId: agentId.trim(),
      agentName: agentName?.trim() || '',
      agentUid: agentUid?.trim() || null,
      scheduledDate: scheduledDate.trim(),
      scheduledTime: scheduledTime?.trim() || null,
      withWhom: withWhom || 'dad',
      withName: withName?.trim() || 'Director of Agent Development',
      notes: notes?.trim() || null,
      requestedByAgent: requestedByAgent === true,
      completedAt: null,
      completionNotes: null,
      nextScheduledDate: null,
      createdAt: new Date().toISOString(),
      createdByUid: caller.uid,
    };

    const ref = await adminDb.collection('oneOnOnes').add(doc);

    // Notify the agent (if admin scheduled it)
    if (caller.isAdmin && agentUid) {
      try {
        await sendNotification(adminDb, {
          recipientUids: [agentUid],
          title: `1:1 Scheduled with ${doc.withName}`,
          body: `Your one-on-one with ${doc.withName} has been scheduled for ${scheduledDate}${scheduledTime ? ' at ' + scheduledTime : ''}. See your dashboard for details.`,
          url: '/dashboard',
          type: 'system',
        });
      } catch (notifErr) {
        console.error('[one-on-ones] notification failed:', notifErr);
      }
    }

    // Notify DAD/broker if agent requested it
    if (!caller.isAdmin && requestedByAgent) {
      try {
        // Find admin/DAD users to notify
        const adminSnap = await adminDb.collection('agentProfiles')
          .where('role', 'in', ['admin', 'staff']).get();
        for (const adminDoc of adminSnap.docs) {
          const adminData = adminDoc.data();
          if (adminData?.uid) {
            await sendNotification(adminDb, {
              recipientUids: [adminData.uid],
              title: `1:1 Request from ${doc.agentName}`,
              body: `${doc.agentName} has requested a one-on-one meeting. Requested date: ${scheduledDate}. Review in the Recruiting & Development dashboard.`,
              url: '/dashboard/admin/recruiting',
              type: 'system',
            });
          }
        }
      } catch (notifErr) {
        console.error('[one-on-ones] admin notification failed:', notifErr);
      }
    }

    return NextResponse.json({ ok: true, id: ref.id, oneOnOne: { id: ref.id, ...doc } });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');
  if (!caller.isAdmin) return jsonError(403, 'Only admin/DAD can update 1:1s');

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return jsonError(400, 'id is required');

    const ref = adminDb.collection('oneOnOnes').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, '1:1 not found');

    const allowed = [
      'scheduledDate', 'scheduledTime', 'withWhom', 'withName',
      'notes', 'completedAt', 'completionNotes', 'nextScheduledDate',
    ];
    const cleaned: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (key in updates) cleaned[key] = updates[key] ?? null;
    }

    // If marking complete, set completedAt to now if not provided
    if (updates.completed === true && !updates.completedAt) {
      cleaned.completedAt = new Date().toISOString();
    }

    await ref.update(cleaned);

    // If a next date was set, notify the agent
    if (updates.nextScheduledDate && snap.data()?.agentUid) {
      try {
        await sendNotification(adminDb, {
          recipientUids: [snap.data()!.agentUid],
          title: `Next 1:1 Scheduled`,
          body: `Your next one-on-one has been scheduled for ${updates.nextScheduledDate}. See your dashboard for details.`,
          url: '/dashboard',
          type: 'system',
        });
      } catch (notifErr) {
        console.error('[one-on-ones] next-date notification failed:', notifErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await getCallerRole(req);
  if (!caller) return jsonError(401, 'Unauthorized');
  if (!caller.isAdmin) return jsonError(403, 'Forbidden');

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return jsonError(400, 'id is required');

  try {
    await adminDb.collection('oneOnOnes').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
