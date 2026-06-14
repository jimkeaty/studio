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

    // Fetch competitions where this agent is a participant OR creator.
    // NOTE: No .orderBy() here — combining array-contains/equality filter with orderBy
    // on a different field requires a composite Firestore index. We sort in memory instead.
    const [asParticipant, asCreator] = await Promise.all([
      adminDb
        .collection('agentCompetitions')
        .where('participantIds', 'array-contains', agentProfileId)
        .get(),
      adminDb
        .collection('agentCompetitions')
        .where('createdBy', '==', agentProfileId)
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
    const {
      name, metric, metricLabel, startDate, endDate, participantIds,
      // New format fields
      format,          // 'standard' | 'golf' | 'nascar' | 'march_madness'
      thresholdRules,  // ThresholdRule[] for golf format
      pointRules,      // PointRules for nascar format
      scoringStrategy, // 'threshold_map' | 'points'
      rankingDirection,// 'asc' | 'desc'
      // Prize setup
      prizeDescription,// Initial prize description
      buyInAmount,     // Per-person buy-in (honor system)
      // Vendor/sponsor info
      vendorName,      // If creator is a vendor
      vendorType,      // 'vendor' | 'sponsor'
      // Team competition fields
      isTeamCompetition,   // boolean
      teamFormation,       // 'creator_assigned' | 'self_selected'
      teamScoringMethod,   // 'scramble' | 'combined' | 'average'
      teams,               // [{ teamId, teamName, mascot, color, memberIds }] for creator_assigned
      // Individual team identity (for creator in self_selected or individual comps)
      creatorTeamName,
      creatorMascot,
      creatorTeamColor,
    } = body;

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

    // Determine scoring strategy from format if not explicitly set
    const resolvedFormat = format || 'standard';
    const resolvedScoringStrategy = scoringStrategy ||
      (resolvedFormat === 'golf' ? 'threshold_map' :
       resolvedFormat === 'nascar' ? 'points' : 'desc');
    const resolvedRankingDirection = rankingDirection ||
      (resolvedFormat === 'golf' ? 'asc' : 'desc');

    // Default golf threshold rules if none provided
    const defaultGolfRules = [
      { min: 0, max: 0, score: 2, label: 'Double Bogey', emoji: '😬' },
      { min: 1, max: 1, score: 3, label: 'Bogey', emoji: '😐' },
      { min: 2, max: 2, score: 4, label: 'Par', emoji: '🏌️' },
      { min: 3, max: 3, score: 5, label: 'Birdie', emoji: '🐦' },
      { min: 4, max: 4, score: 6, label: 'Eagle', emoji: '🦅' },
      { min: 5, max: null, score: 7, label: 'Albatross', emoji: '🦅🦅' },
    ];

    // Default NASCAR point rules if none provided
    const defaultNascarRules = {
      closedDeal: 40,
      pendingDeal: 15,
      engagementPoint: 1,
      appointmentHeldPoint: 5,
      contractWrittenPoint: 10,
    };

    const now = new Date().toISOString();
    const competition: any = {
      name: name.trim(),
      metric,
      metricLabel: metricLabel || metric,
      format: resolvedFormat,
      scoringStrategy: resolvedScoringStrategy,
      rankingDirection: resolvedRankingDirection,
      startDate,
      endDate,
      status: resolvedFormat === 'march_madness' ? 'draft' : 'active',
      createdBy: agentProfileId,
      createdByName: agentName,
      participantIds: allParticipantIds,
      participantNames,
      createdAt: now,
      updatedAt: now,
      // Scoring rules
      ...(resolvedFormat === 'golf' ? { thresholdRules: thresholdRules || defaultGolfRules } : {}),
      ...(resolvedFormat === 'nascar' ? { pointRules: pointRules || defaultNascarRules } : {}),
      // Prize/pot
      prizeDescription: prizeDescription || null,
      buyInAmount: typeof buyInAmount === 'number' ? buyInAmount : 0,
      totalPot: 0,
      // Vendor
      vendorName: vendorName || null,
      vendorType: vendorType || null,
      // Team competition
      isTeamCompetition: !!isTeamCompetition,
      teamFormation: isTeamCompetition ? (teamFormation || 'creator_assigned') : null,
      teamScoringMethod: isTeamCompetition ? (teamScoringMethod || 'combined') : null,
      teams: isTeamCompetition && Array.isArray(teams) ? teams : [],
      // Team identities keyed by agentProfileId (for self_selected or individual comps)
      teamIdentities: {
        [agentProfileId]: {
          teamName: creatorTeamName || null,
          mascot: creatorMascot || null,
          color: creatorTeamColor || null,
        },
      },
      // March Madness bracket (initialized separately)
      ...(resolvedFormat === 'march_madness' ? { rounds: [], bracket: null, championId: null } : {}),
    };

    const ref = await adminDb.collection('agentCompetitions').add(competition);
    return NextResponse.json({ ok: true, competition: { id: ref.id, ...competition } });
  } catch (err: any) {
    console.error('[api/agent-competitions POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
