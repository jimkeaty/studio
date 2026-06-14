// GET  /api/agent-competitions/[competitionId]/prizes  — list all prizes/pot entries
// POST /api/agent-competitions/[competitionId]/prizes  — add a prize or buy-in entry
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function resolveProfile(uid: string) {
  const snap = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
  if (!snap.empty) {
    const d = snap.docs[0].data();
    return {
      profileId: snap.docs[0].id,
      name: d.displayName || d.name || uid,
      role: d.role || d.staffRole || 'agent',
    };
  }
  return { profileId: uid, name: uid, role: 'agent' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { competitionId: string } }
) {
  try {
    const token = bearer(req);
    if (!token) return jsonError(401, 'Missing token');
    await adminAuth.verifyIdToken(token);

    const prizesSnap = await adminDb
      .collection('agentCompetitions')
      .doc(params.competitionId)
      .collection('prizes')
      .orderBy('addedAt', 'asc')
      .get();

    const prizes = prizesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalPot = prizes.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return NextResponse.json({ ok: true, prizes, totalPot });
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
    const { profileId, name, role } = await resolveProfile(decoded.uid);

    // Verify competition exists
    const compDoc = await adminDb.collection('agentCompetitions').doc(params.competitionId).get();
    if (!compDoc.exists) return jsonError(404, 'Competition not found');

    const body = await req.json();
    const {
      type,        // 'prize' | 'buyin' | 'sponsor'
      description, // "Yeti Cooler", "$50 cash", etc.
      amount,      // numeric dollar amount (0 if non-cash)
      place,       // 1st, 2nd, 3rd — null means general pot
      donorName,   // override display name (for vendors/sponsors)
      donorType,   // 'agent' | 'broker' | 'team_leader' | 'vendor' | 'sponsor'
    } = body;

    if (!description) return jsonError(400, 'description is required');

    const entry = {
      type: type || 'prize',
      description: description.trim(),
      amount: typeof amount === 'number' ? amount : 0,
      place: place || null,
      donorProfileId: profileId,
      donorName: donorName || name,
      donorType: donorType || (role === 'admin' ? 'broker' : 'agent'),
      addedAt: new Date().toISOString(),
    };

    const ref = await adminDb
      .collection('agentCompetitions')
      .doc(params.competitionId)
      .collection('prizes')
      .add(entry);

    return NextResponse.json({ ok: true, prize: { id: ref.id, ...entry } });
  } catch (err: any) {
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
