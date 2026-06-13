// GET  /api/agent-competitions  — list competitions the caller is in (or created)
// POST /api/agent-competitions  — create a new peer competition (any agent can do this)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ── GET: List competitions the caller participates in ──────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Resolve the agent's profile doc id (could be uid or a slug)
    const profileByUid = await adminDb
      .collection('agentProfiles')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();
    const agentProfileId = profileByUid.empty ? uid : profileByUid.docs[0].id;
    const agentName = profileByUid.empty
      ? (decoded.name || decoded.email || uid)
      : (profileByUid.docs[0].data().displayName || profileByUid.docs[0].data().name || uid);

    // Fetch competitions where this agent is a participant OR creator
    const [asParticipant, asCreator] = await Promise.all([
      adminDb
        .collection('agentCompetitions')
        .where('participantIds', 'array-contains', agentProfileId)
        .orderBy('createdAt', 'desc')
        .get(),
      adminDb
        .collection('agentCompetitions')
        .where('createdBy', '==', agentProfileId)
        .orderBy('createdAt', 'desc')
        .get(),
    ]);

    // Merge and deduplicate
    const seen = new Set<string>();
    const competitions: any[] = [];
    for (const doc of [...asParticipant.docs, ...asCreator.docs]) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      competitions.push({ id: doc.id, ...doc.data() });
    }
    competitions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return NextResponse.json({ ok: true, competitions, agentProfileId, agentName });
  } catch (err: any) {
    console.error('[api/agent-competitions GET]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── POST: Create a peer competition ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Resolve agent profile
    const profileByUid = await adminDb
      .collection('agentProfiles')
      .where('firebaseUid', '==', uid)
      .limit(1)
      .get();
    const agentProfileId = profileByUid.empty ? uid : profileByUid.docs[0].id;
    const agentName = profileByUid.empty
      ? (decoded.name || decoded.email || uid)
      : (profileByUid.docs[0].data().displayName || profileByUid.docs[0].data().name || uid);

    const body = await req.json();
    const { name, metric, metricLabel, startDate, endDate, participantIds } = body;

    // Validate
    if (!name || !metric || !startDate || !endDate) {
      return jsonError(400, 'Missing required fields: name, metric, startDate, endDate');
    }
    if (!Array.isArray(participantIds) || participantIds.length < 1) {
      return jsonError(400, 'Must include at least one other participant');
    }

    // Always include the creator
    const allParticipantIds = Array.from(new Set([agentProfileId, ...participantIds]));

    // Fetch display names for all participants
    const participantNames: Record<string, string> = { [agentProfileId]: agentName };
    for (const pid of participantIds) {
      if (pid === agentProfileId) continue;
      try {
        const pdoc = await adminDb.collection('agentProfiles').doc(pid).get();
        if (pdoc.exists) {
          const d = pdoc.data()!;
          participantNames[pid] = d.displayName || d.name || pid;
        }
      } catch {}
    }

    const now = new Date().toISOString();
    const competition = {
      name: name.trim(),
      metric,
      metricLabel: metricLabel || metric,
      startDate,
      endDate,
      status: 'active' as const,
      createdBy: agentProfileId,
      createdByName: agentName,
      participantIds: allParticipantIds,
      participantNames,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('agentCompetitions').add(competition);
    return NextResponse.json({ ok: true, competition: { id: ref.id, ...competition } });
  } catch (err: any) {
    console.error('[api/agent-competitions POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
