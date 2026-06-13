// GET /api/agent-competitions/agents
// Returns a list of active agents for the competition invite picker.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export async function GET(req: NextRequest) {
  try {
    const token = bearer(req);
    if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 401 });
    await adminAuth.verifyIdToken(token);

    const snap = await adminDb.collection('agentProfiles').get();
    const agents: { id: string; displayName: string; email?: string }[] = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.isDemoAccount === true) continue;
      if (d.status && d.status !== 'active' && d.status !== 'grace_period') continue;
      agents.push({
        id: doc.id,
        displayName: d.displayName || d.name || doc.id,
        email: d.email || undefined,
      });
    }
    agents.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ ok: true, agents });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
