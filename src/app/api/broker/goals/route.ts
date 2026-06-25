// GET + POST /api/broker/goals — manage monthly goals
// Admin: can set goals for any segment (TOTAL, team IDs, agent_*)
// Agents: can set goals for their own segment (agent_{uid})
// Team leaders: can set goals for their team segment (teamId)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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

/**
 * Resolve the canonical profile doc ID for a uid.
 * Resolution order: direct doc lookup → agentId slug → firebaseUid field.
 * Returns profileDocId if found, otherwise the original uid.
 */
async function resolveProfileDocId(uid: string): Promise<string> {
  try {
    const byId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byId.exists) return byId.id;

    const bySlug = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid).limit(1).get();
    if (!bySlug.empty) return bySlug.docs[0].id;

    const byFbUid = await adminDb.collection('agentProfiles')
      .where('firebaseUid', '==', uid).limit(1).get();
    if (!byFbUid.empty) return byFbUid.docs[0].id;
  } catch { /* non-fatal */ }
  return uid;
}

// Check if user can write to the given segment
async function canWriteSegment(uid: string, segment: string): Promise<boolean> {
  // Admin can write anything — including agent_* segments when impersonating
  if (await isAdminLike(uid)) return true;

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

  // Team leaders can write their team's segment AND agent_* goals for their own team members
  const profileSnap = profileBySlug.empty
    ? await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get()
    : profileBySlug;
  if (!profileSnap.empty) {
    const profile = profileSnap.docs[0].data();
    // Write own team segment
    if (profile.teamRole === 'leader' && profile.primaryTeamId === segment) {
      return true;
    }
    // Write agent_* goals for team members on the same team
    if (profile.teamRole === 'leader' && profile.primaryTeamId && segment.startsWith('agent_')) {
      const targetUid = segment.replace('agent_', '');
      // Check if target belongs to the same team (by firebaseUid or agentId)
      const memberSnap = await adminDb.collection('agentProfiles')
        .where('primaryTeamId', '==', profile.primaryTeamId)
        .where('firebaseUid', '==', targetUid).limit(1).get();
      if (!memberSnap.empty) return true;
      const memberBySlug = await adminDb.collection('agentProfiles')
        .where('primaryTeamId', '==', profile.primaryTeamId)
        .where('agentId', '==', targetUid).limit(1).get();
      if (!memberBySlug.empty) return true;
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
    let { year, month, segment = 'TOTAL', grossMarginGoal, volumeGoal, salesCountGoal } = body;

    if (!year || !month || month < 1 || month > 12) {
      return jsonError(400, 'year and month (1-12) are required');
    }

    // Normalize agent segments to use the canonical profile doc ID.
    // This ensures goals are always stored under agent_{profileDocId} regardless
    // of whether the caller passed a Firebase UID, a slug, or a profile doc ID.
    if (segment && segment.startsWith('agent_')) {
      const rawId = segment.replace('agent_', '');
      const canonicalId = await resolveProfileDocId(rawId);
      if (canonicalId !== rawId) {
        segment = `agent_${canonicalId}`;
      }
    }

    // Check permissions (against the normalized segment)
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
