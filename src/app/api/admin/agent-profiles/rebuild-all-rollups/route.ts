/**
 * POST /api/admin/agent-profiles/rebuild-all-rollups
 *
 * Rebuilds agentYearRollups for every active agent for their current
 * anniversary cycle year and the prior year.
 *
 * Returns a standard JSON response with results after all agents are processed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { getAnniversaryCycle } from '@/lib/agents/anniversaryCycle';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowedRoles = ['admin', 'broker', 'staff'];
  const role = decoded.role || decoded.userRole || '';
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fetch all active agents ───────────────────────────────────────────────
  const agentsSnap = await adminDb
    .collection('agentProfiles')
    .where('status', '==', 'active')
    .get();

  const agents = agentsSnap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as any,
  }));

  const total = agents.length;
  let rebuilt = 0;
  const errors: { agentId: string; name: string; error: string }[] = [];

  // ── Rebuild each agent ────────────────────────────────────────────────────
  for (const agent of agents) {
    const { id, data } = agent;
    const displayName =
      data.displayName ||
      `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
      id;

    try {
      const anniversaryMonth = Number(data.anniversaryMonth ?? 0);
      const anniversaryDay = Number(data.anniversaryDay ?? 0);
      const today = new Date();
      const currentCycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, today);
      const currentYear = currentCycle.cycleStart.getUTCFullYear();
      const priorYear = currentYear - 1;

      await rebuildAgentRollup(adminDb, id, currentYear);
      await rebuildAgentRollup(adminDb, id, priorYear);
      rebuilt++;
    } catch (err: any) {
      errors.push({ agentId: id, name: displayName, error: err?.message || 'Unknown error' });
    }
  }

  return NextResponse.json({
    ok: true,
    total,
    rebuilt,
    errorCount: errors.length,
    errors,
  });
}
