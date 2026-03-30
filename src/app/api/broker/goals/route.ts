// GET + POST /api/broker/goals — manage monthly goals
// Admin: can set goals for any segment (TOTAL, team IDs, agent_*)
// Agents: can set goals for their own segment (agent_{uid})
// Team leaders: can set goals for their team segment (teamId)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

// Check if user can write to the given segment
async function canWriteSegment(uid: string, segment: string): Promise<boolean> {
  // Admin can write anything — including agent_* segments when impersonating
  if (uid === ADMIN_UID) return true;

  // Agents can write their own segment (keyed by Firebase UID)
  if (segment === `agent_${uid}`) return true;

  // Look up the agent's profile to find their canonical Firebase UID.
  // An agent's segment may be keyed by their profile doc ID (Firebase UID)
  // rather than their agentId slug — allow if it matches.
  const profileBySlug = await adminDb.collection('agentProfiles')
    .where('agentId', '==', uid).limit(1).get();
  if (!profileBySlug.empty) {
    const profileUid = profileBySlug.docs[0].id;
    if (segment === `agent_${profileUid}`) return true;
  }

  // Team leaders can write their team's segment
  const profileSnap = profileBySlug.empty
    ? await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get()
    : profileBySlug;
  if (!profileSnap.empty) {
    const profile = profileSnap.docs[0].data();
    if (profile.teamRole === 'leader' && profile.primaryTeamId === segment) {
      return true;
    }
  }

  return false;
}

// GET /api/broker/goals?year=2026&segment=TOTAL
export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const segment = searchParams.get('segment') || 'TOTAL';

    // Non-admin can only read their own or their team's goals
    const isAdmin = (await isAdminLike(decoded.uid));
    if (!isAdmin) {
      const allowed =
        segment === `agent_${decoded.uid}` ||
        await canWriteSegment(decoded.uid, segment);
      if (!allowed) return jsonError(403, 'Forbidden');
    }

    const snap = await adminDb
      .collection('brokerCommandGoals')
      .where('year', '==', year)
      .where('segment', '==', segment)
      .orderBy('month', 'asc')
      .get();

    const goals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, goals });
  } catch (err: any) {
    console.error('[api/broker/goals GET]', err);
    return jsonError(500, err.message);
  }
}

// POST /api/broker/goals — save goals for a month
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) return jsonError(401, 'Unauthorized');

    const body = await req.json();
    const { year, month, segment = 'TOTAL', grossMarginGoal, volumeGoal, salesCountGoal } = body;

    if (!year || !month || month < 1 || month > 12) {
      return jsonError(400, 'year and month (1-12) are required');
    }

    // Check permissions
    const allowed = await canWriteSegment(decoded.uid, segment);
    if (!allowed) return jsonError(403, 'You do not have permission to set goals for this segment');

    const docId = `${year}-${String(month).padStart(2, '0')}-${segment}`;
    const docRef = adminDb.collection('brokerCommandGoals').doc(docId);

    await docRef.set(
      {
        year,
        month,
        segment,
        grossMarginGoal: grossMarginGoal ?? null,
        volumeGoal: volumeGoal ?? null,
        salesCountGoal: salesCountGoal ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: decoded.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: docId });
  } catch (err: any) {
    console.error('[api/broker/goals POST]', err);
    return jsonError(500, err.message);
  }
}
