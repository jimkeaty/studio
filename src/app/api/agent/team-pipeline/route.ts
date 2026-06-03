'use server';
/**
 * /api/agent/team-pipeline
 *
 * Returns all transactions for every member of the caller's team.
 * Only accessible to:
 *   - A team leader (teamRole === 'leader') viewing their own team
 *   - An admin/broker using ?viewAs=<agentSlug> to view a team leader's team
 *
 * Returns the full transaction document (including splitSnapshot) so the
 * team leader can see GCI, agent net, and leader-retained amounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) out[k] = serializeFirestore(v);
    return out;
  }
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    const callerIsAdmin = await isAdminLike(decoded.uid);

    const { searchParams } = new URL(req.url);
    const viewAs = searchParams.get('viewAs');
    // uid is either the logged-in agent's UID or the viewAs slug (for admin impersonation)
    const uid = (viewAs && callerIsAdmin) ? viewAs : decoded.uid;

    // ── Resolve agent profile ─────────────────────────────────────────────
    let profileDocId: string | null = null;
    let profileData: any = null;

    // Strategy 1: direct doc lookup by uid
    const byId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byId.exists) { profileDocId = byId.id; profileData = byId.data(); }

    // Strategy 2: query by agentId slug field
    if (!profileDocId) {
      const bySlug = await adminDb.collection('agentProfiles').where('agentId', '==', uid).limit(1).get();
      if (!bySlug.empty) { profileDocId = bySlug.docs[0].id; profileData = bySlug.docs[0].data(); }
    }

    // Strategy 3: email lookup (only when NOT viewAs — caller email belongs to broker)
    const isViewingAs = !!(viewAs && callerIsAdmin);
    if (!profileDocId && !isViewingAs) {
      const email = decoded.email || '';
      if (email) {
        const byEmail = await adminDb.collection('agentProfiles').where('email', '==', email).limit(1).get();
        if (!byEmail.empty) { profileDocId = byEmail.docs[0].id; profileData = byEmail.docs[0].data(); }
      }
    }

    // Strategy 4: firebaseUid field
    if (!profileDocId) {
      const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
      if (!byFbUid.empty) { profileDocId = byFbUid.docs[0].id; profileData = byFbUid.docs[0].data(); }
    }

    const profile = profileData ?? null;
    const isTeamLeader = profile?.teamRole === 'leader' && !!profile?.primaryTeamId;
    const teamId = profile?.primaryTeamId || null;

    // Only team leaders (or admins viewing a team leader) may call this endpoint
    if (!isTeamLeader && !callerIsAdmin) {
      return jsonError(403, 'Only team leaders can access team pipeline data');
    }
    if (!teamId) {
      return jsonError(400, 'No team associated with this agent');
    }

    // ── Build the set of all agent IDs on this team ───────────────────────
    const membersSnap = await adminDb.collection('agentProfiles')
      .where('primaryTeamId', '==', teamId).get();

    const agentIds = new Set<string>();
    // Map from agentId/docId → display name for the table
    const agentNameMap = new Map<string, string>();

    for (const d of membersSnap.docs) {
      const pd = d.data();
      const displayName = pd.displayName || pd.name || pd.agentId || d.id;
      if (pd.agentId) { agentIds.add(pd.agentId as string); agentNameMap.set(pd.agentId as string, displayName); }
      agentIds.add(d.id); agentNameMap.set(d.id, displayName);
      if (pd.firebaseUid) { agentIds.add(pd.firebaseUid as string); agentNameMap.set(pd.firebaseUid as string, displayName); }
    }

    // Also include the leader themselves (in case they are not in the members query)
    const leaderName = profile?.displayName || profile?.name || uid;
    agentIds.add(uid);
    agentNameMap.set(uid, leaderName);
    if (profileDocId && profileDocId !== uid) { agentIds.add(profileDocId); agentNameMap.set(profileDocId, leaderName); }
    if (profile?.agentId) { agentIds.add(String(profile.agentId)); agentNameMap.set(String(profile.agentId), leaderName); }

    // ── Fetch all transactions for the team ───────────────────────────────
    const agentIdList = [...agentIds];
    const BATCH = 30;
    const batches = Array.from({ length: Math.ceil(agentIdList.length / BATCH) }, (_, i) =>
      adminDb.collection('transactions')
        .where('agentId', 'in', agentIdList.slice(i * BATCH, i * BATCH + BATCH))
        .get()
    );
    const allSnaps = await Promise.all(batches);

    // Also fetch by splitSnapshot.primaryTeamId as a fallback
    const extraSnap = await adminDb.collection('transactions')
      .where('splitSnapshot.primaryTeamId', '==', teamId)
      .get();

    const txMap = new Map<string, any>();
    for (const snap of allSnaps) {
      for (const d of snap.docs) {
        if (!txMap.has(d.id)) {
          const raw = serializeFirestore({ id: d.id, ...d.data() });
          // Attach agent display name from our map
          raw._agentDisplayName = agentNameMap.get(raw.agentId) || raw.agentDisplayName || raw.agentId || '';
          txMap.set(d.id, raw);
        }
      }
    }
    for (const d of extraSnap.docs) {
      if (!txMap.has(d.id)) {
        const raw = serializeFirestore({ id: d.id, ...d.data() });
        raw._agentDisplayName = agentNameMap.get(raw.agentId) || raw.agentDisplayName || raw.agentId || '';
        txMap.set(d.id, raw);
      }
    }

    const allTx = Array.from(txMap.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });

    // Derive summary counts
    const activeTransactions = allTx.filter(t => t.status === 'active' || t.status === 'temp_off_market');
    const pendingTransactions = allTx.filter(t => t.status === 'pending' || t.status === 'under_contract');
    const allClosedTransactions = allTx.filter(t => t.status === 'closed');

    // Available years from closed transactions
    const closedYears = Array.from(new Set(
      allClosedTransactions.map(t => {
        if (t.year) return Number(t.year);
        const d: string = t.closedDate ?? t.closingDate ?? '';
        const m = d.match(/^(\d{4})/);
        return m ? Number(m[1]) : null;
      }).filter((y): y is number => y !== null)
    )).sort((a, b) => b - a);

    return NextResponse.json({
      ok: true,
      teamId,
      activeTransactions,
      pendingTransactions,
      allClosedTransactions,
      allTransactions: allTx,
      closedYears,
      totalCount: allTx.length,
    });
  } catch (err: any) {
    console.error('[api/agent/team-pipeline] Error:', err);
    return jsonError(500, err.message || 'Internal server error');
  }
}
