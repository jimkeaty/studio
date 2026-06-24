// src/app/api/agent/agents-list/route.ts
// Agent-accessible endpoint that returns a minimal list of active agents
// (id + name only) for use in co-agent dropdowns.
// Any authenticated user (agent, admin, TC) can call this.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length).trim();
    // Verify the token — any valid Firebase user can access this
    await adminAuth.verifyIdToken(token);

    const snap = await adminDb
      .collection('agentProfiles')
      .where('status', '==', 'active')
      .limit(500)
      .get();

    const agents: { agentId: string; agentName: string }[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const agentId = (d.agentId as string) || doc.id;
      const agentName =
        (d.agentName as string) ||
        (d.displayName as string) ||
        (d.name as string) ||
        '';
      if (agentId && agentName) {
        agents.push({ agentId, agentName });
      }
    }

    agents.sort((a, b) => a.agentName.localeCompare(b.agentName));

    return NextResponse.json({ ok: true, agents });
  } catch (err: any) {
    console.error('[api/agent/agents-list] Error:', err.message);
    return jsonError(500, 'Internal server error');
  }
}
