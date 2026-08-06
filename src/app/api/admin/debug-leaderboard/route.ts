// GET /api/admin/debug-leaderboard?name=joshua&year=2026
// Diagnose why an agent might still appear on the leaderboard despite being inactive.
// Shows: agentProfiles doc.id, stored agentId field, status, and matching rollup agentId.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const name = (req.nextUrl.searchParams.get('name') || '').toLowerCase();
  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));


  // adminDb may be a Firestore instance directly (not a factory function)
  // Use it directly if it has .collection, otherwise call it
  const firestoreDb = typeof (adminDb as any).collection === 'function' ? adminDb : (adminDb as any)();

  // Fetch all agent profiles
  const profileSnap = await firestoreDb.collection('agentProfiles').get();
  const profiles = profileSnap.docs
    .map((d: any) => ({ docId: d.id, ...(d.data() as any) }))
    .filter((p: any) => name ? (String(p.displayName || p.firstName || '')).toLowerCase().includes(name) : true);

  // Fetch matching rollups
  const rollupSnap = await firestoreDb.collection('agentYearRollups').where('year', '==', year).get();
  const rollups = rollupSnap.docs.map((d: any) => ({ rollupDocId: d.id, ...(d.data() as any) }));

  const results = profiles.map((p: any) => {
    const matchingRollups = rollups.filter((r: any) =>
      r.agentId === p.docId ||
      r.agentId === p.agentId ||
      r.rollupDocId.startsWith(p.docId + '_') ||
      (p.email && r.agentId === p.email)
    );
    return {
      profile_docId: p.docId,
      profile_agentId_field: p.agentId || '(not stored in doc)',
      profile_status: p.status,
      profile_displayName: p.displayName,
      profile_email: p.email,
      matching_rollups: matchingRollups.map((r: any) => ({
        rollupDocId: r.rollupDocId,
        rollup_agentId: r.agentId,
        rollup_agentStatus: r.agentStatus,
        rollup_closed: r.closed,
        rollup_closedVolume: r.closedVolume,
        id_match: r.agentId === p.docId ? 'EXACT_MATCH' : 'MISMATCH — filter may fail',
      })),
    };
  });

  return NextResponse.json({ year, query: name, results });
}
