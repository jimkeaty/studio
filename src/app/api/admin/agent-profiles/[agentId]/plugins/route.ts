import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

/**
 * POST /api/admin/agent-profiles/[agentId]/plugins
 * Updates the enabledPlugins array on an agent's profile document.
 * Admin only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const callerIsAdmin = await isAdminLike(decoded.uid);
    if (!callerIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { agentId } = params;
    const body = await req.json();
    const enabledPlugins: string[] = Array.isArray(body.enabledPlugins)
      ? body.enabledPlugins
      : [];

    // Find the profile doc — try direct ID first, then agentId field
    let ref = adminDb.collection('agentProfiles').doc(agentId);
    let snap = await ref.get();
    if (!snap.exists) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', agentId)
        .limit(1)
        .get();
      if (!q.empty) {
        ref = q.docs[0].ref;
      } else {
        return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
      }
    }

    await ref.update({
      enabledPlugins,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, agentId, enabledPlugins });
  } catch (err: any) {
    console.error('[API/admin/agent-profiles/plugins] Error:', err?.message || err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
