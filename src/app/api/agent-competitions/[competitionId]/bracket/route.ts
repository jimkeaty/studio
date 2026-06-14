// GET  /api/agent-competitions/[competitionId]/bracket  — get bracket state
// POST /api/agent-competitions/[competitionId]/bracket  — advance a matchup (admin/creator only)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { competitionId: string } }
) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    await adminAuth.verifyIdToken(token);

    const compDoc = await adminDb.collection('agentCompetitions').doc(params.competitionId).get();
    if (!compDoc.exists) return jsonError(404, 'Competition not found');
    const comp = compDoc.data()!;

    if (comp.format !== 'march_madness') {
      return jsonError(400, 'This competition is not a March Madness bracket');
    }

    return NextResponse.json({ ok: true, bracket: comp.bracket || null, rounds: comp.rounds || [] });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionId: string } }
) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const compDoc = await adminDb.collection('agentCompetitions').doc(params.competitionId).get();
    if (!compDoc.exists) return jsonError(404, 'Competition not found');
    const comp = compDoc.data()!;

    // Resolve caller profile
    const profileSnap = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
    const callerProfileId = profileSnap.empty ? uid : profileSnap.docs[0].id;

    // Only creator or admin can advance bracket
    const isAdmin = await isAdminLike(uid);
    if (comp.createdBy !== callerProfileId && !isAdmin) {
      return jsonError(403, 'Only the competition creator or an admin can advance the bracket');
    }

    const body = await req.json();
    const { action, roundIndex, matchupIndex, winnerId } = body;

    if (action === 'set_winner') {
      // Update a specific matchup winner and advance bracket
      const rounds: any[] = comp.rounds || [];
      if (!rounds[roundIndex] || !rounds[roundIndex].matchups[matchupIndex]) {
        return jsonError(400, 'Invalid round or matchup index');
      }

      rounds[roundIndex].matchups[matchupIndex].winnerId = winnerId;
      rounds[roundIndex].matchups[matchupIndex].completedAt = new Date().toISOString();

      // Check if all matchups in this round are complete → seed next round
      const currentRound = rounds[roundIndex];
      const allDone = currentRound.matchups.every((m: any) => m.winnerId);

      if (allDone && roundIndex + 1 < rounds.length) {
        // Seed winners into next round
        const winners = currentRound.matchups.map((m: any) => m.winnerId);
        const nextRound = rounds[roundIndex + 1];
        for (let i = 0; i < nextRound.matchups.length; i++) {
          nextRound.matchups[i].player1Id = winners[i * 2] || null;
          nextRound.matchups[i].player2Id = winners[i * 2 + 1] || null;
        }
        nextRound.status = 'active';
      }

      // Check if tournament is complete (last round, last matchup has winner)
      const lastRound = rounds[rounds.length - 1];
      const championId = lastRound?.matchups?.[0]?.winnerId || null;
      const tournamentComplete = !!championId;

      await adminDb.collection('agentCompetitions').doc(params.competitionId).update({
        rounds,
        championId,
        status: tournamentComplete ? 'completed' : 'active',
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, rounds, championId, tournamentComplete });
    }

    if (action === 'initialize_bracket') {
      // Build the bracket from participantIds
      const participants: string[] = comp.participantIds || [];
      if (participants.length < 2) return jsonError(400, 'Need at least 2 participants');

      // Pad to next power of 2
      const nextPow2 = Math.pow(2, Math.ceil(Math.log2(participants.length)));
      const seeded = [...participants];
      while (seeded.length < nextPow2) seeded.push('bye');

      // Shuffle for random seeding
      for (let i = seeded.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
      }

      // Build rounds
      const rounds: any[] = [];
      let roundSize = nextPow2;
      let roundNum = 1;
      while (roundSize >= 2) {
        const matchups = [];
        for (let i = 0; i < roundSize / 2; i++) {
          matchups.push({
            matchupId: `r${roundNum}_m${i + 1}`,
            player1Id: roundNum === 1 ? seeded[i * 2] : null,
            player2Id: roundNum === 1 ? seeded[i * 2 + 1] : null,
            winnerId: null,
            completedAt: null,
            // Auto-advance byes
            ...(roundNum === 1 && seeded[i * 2 + 1] === 'bye' ? { winnerId: seeded[i * 2], completedAt: new Date().toISOString(), isBye: true } : {}),
            ...(roundNum === 1 && seeded[i * 2] === 'bye' ? { winnerId: seeded[i * 2 + 1], completedAt: new Date().toISOString(), isBye: true } : {}),
          });
        }
        rounds.push({
          roundNumber: roundNum,
          roundLabel: roundSize === 2 ? 'Championship' : roundSize === 4 ? 'Semifinals' : roundSize === 8 ? 'Quarterfinals' : `Round of ${roundSize}`,
          status: roundNum === 1 ? 'active' : 'pending',
          matchups,
        });
        roundSize = roundSize / 2;
        roundNum++;
      }

      await adminDb.collection('agentCompetitions').doc(params.competitionId).update({
        rounds,
        bracket: { seeded, totalRounds: rounds.length },
        status: 'active',
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, rounds, bracket: { seeded, totalRounds: rounds.length } });
    }

    return jsonError(400, 'Unknown action');
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
