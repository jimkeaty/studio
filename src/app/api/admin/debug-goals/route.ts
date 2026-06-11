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
        const docId = d.id.toLowerCase();
        return n.includes(name) || slug.includes(name) || docId.includes(name);
      })
      .map(d => ({
        docId: d.id,
        name: d.data().name || d.data().displayName,
        agentId: d.data().agentId,
        firebaseUid: d.data().firebaseUid,
        email: d.data().email,
        status: d.data().status,
      }));

    // 2. Find ALL goals for this year and the previous year
    const [goalsSnap, prevGoalsSnap] = await Promise.all([
      adminDb.collection('brokerCommandGoals').where('year', '==', year).get(),
      adminDb.collection('brokerCommandGoals').where('year', '==', year - 1).get(),
    ]);
    
    // 3. For each matching profile, find goals under all possible segment keys
    const results = matchingProfiles.map(p => {
      const possibleSegments = new Set<string>();
      possibleSegments.add(`agent_${p.docId}`);
      if (p.agentId) possibleSegments.add(`agent_${p.agentId}`);
      if (p.firebaseUid) possibleSegments.add(`agent_${p.firebaseUid}`);

      const findGoals = (snap: FirebaseFirestore.QuerySnapshot) =>
        snap.docs
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
        goalsFoundThisYear: findGoals(goalsSnap).length,
        goalsThisYear: findGoals(goalsSnap),
        goalsFoundPrevYear: findGoals(prevGoalsSnap).length,
        goalsPrevYear: findGoals(prevGoalsSnap),
      };
    });

    // 4. List all unique segments in goals for this year
    const allSegmentsThisYear = [...new Set(goalsSnap.docs.map(d => d.data().segment))].sort();
    const allSegmentsPrevYear = [...new Set(prevGoalsSnap.docs.map(d => d.data().segment))].sort();

    return NextResponse.json({ 
      ok: true, 
      year, 
      results, 
      allSegmentsThisYear,
      allSegmentsPrevYear,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
