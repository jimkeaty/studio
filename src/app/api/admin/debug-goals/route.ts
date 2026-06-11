// GET /api/admin/debug-goals?name=matthew — admin-only diagnostic endpoint
// Returns the agent profile and all matching brokerCommandGoals for the given name
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const isAdmin = await isAdminLike(decoded.uid);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const name = (searchParams.get('name') || '').toLowerCase();
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

    // 1. Find matching profiles
    const allProfiles = await adminDb.collection('agentProfiles').get();
    const matchingProfiles = allProfiles.docs
      .filter(d => {
        const data = d.data();
        const n = (data.name || data.displayName || '').toLowerCase();
        const slug = (data.agentId || '').toLowerCase();
        return n.includes(name) || slug.includes(name);
      })
      .map(d => ({
        docId: d.id,
        name: d.data().name || d.data().displayName,
        agentId: d.data().agentId,
        firebaseUid: d.data().firebaseUid,
        email: d.data().email,
        status: d.data().status,
      }));

    // 2. Find all goals for this year
    const goalsSnap = await adminDb.collection('brokerCommandGoals')
      .where('year', '==', year).get();
    
    // 3. For each matching profile, find goals under all possible segment keys
    const results = matchingProfiles.map(p => {
      const possibleSegments = new Set<string>();
      possibleSegments.add(`agent_${p.docId}`);
      if (p.agentId) possibleSegments.add(`agent_${p.agentId}`);
      if (p.firebaseUid) possibleSegments.add(`agent_${p.firebaseUid}`);

      const matchingGoals = goalsSnap.docs
        .filter(d => possibleSegments.has(d.data().segment))
        .map(d => ({
          docId: d.id,
          segment: d.data().segment,
          month: d.data().month,
          grossMarginGoal: d.data().grossMarginGoal,
          volumeGoal: d.data().volumeGoal,
          salesCountGoal: d.data().salesCountGoal,
        }));

      return {
        profile: p,
        possibleSegments: [...possibleSegments],
        goalsFound: matchingGoals.length,
        goals: matchingGoals,
      };
    });

    // 4. Also list all unique segments in goals for this year
    const allSegments = [...new Set(goalsSnap.docs.map(d => d.data().segment))].sort();

    return NextResponse.json({ ok: true, year, results, allSegments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
