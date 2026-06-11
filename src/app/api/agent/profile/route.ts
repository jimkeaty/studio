import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

/**
 * GET /api/agent/profile
 * Returns the current agent's profile fields needed for plugin resolution.
 * Supports ?viewAs=<agentId> for admin impersonation.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const viewAs = req.nextUrl.searchParams.get('viewAs');

    // Determine which uid to look up
    const lookupUid = viewAs ?? decoded.uid;

    // Strategy 1: direct doc ID lookup
    let profileSnap = await adminDb.collection('agentProfiles').doc(lookupUid).get();

    // Strategy 2: query by agentId field (slug)
    if (!profileSnap.exists) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', lookupUid)
        .limit(1)
        .get();
      if (!q.empty) profileSnap = q.docs[0] as any;
    }

    // Strategy 3: query by email (direct login, no viewAs)
    if (!profileSnap.exists && !viewAs && decoded.email) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('email', '==', decoded.email)
        .limit(1)
        .get();
      if (!q.empty) profileSnap = q.docs[0] as any;
    }

    // Strategy 4: query by firebaseUid field
    if (!profileSnap.exists) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('firebaseUid', '==', lookupUid)
        .limit(1)
        .get();
      if (!q.empty) profileSnap = q.docs[0] as any;
    }

    if (!profileSnap.exists) {
      // Return minimal profile — no plugins, role defaults to 'agent'
      return NextResponse.json({ ok: true, profile: { role: 'agent', enabledPlugins: [] } });
    }

    const data = profileSnap.data() as Record<string, any>;
    return NextResponse.json({
      ok: true,
      profile: {
        docId: profileSnap.id,
        agentId: data.agentId ?? null,
        displayName: data.displayName ?? null,
        role: data.role ?? 'agent',
        enabledPlugins: data.enabledPlugins ?? [],
        status: data.status ?? 'active',
      },
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API/agent/profile] Error:', err?.message || err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
