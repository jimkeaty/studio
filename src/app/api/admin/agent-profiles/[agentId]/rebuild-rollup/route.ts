/**
 * POST /api/admin/agent-profiles/[agentId]/rebuild-rollup
 *
 * Rebuilds the agentYearRollups document for a single agent for the current
 * anniversary cycle year (and optionally prior years).
 *
 * Body (optional): { years?: number[] }  — defaults to current year + prior year
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { getAnniversaryCycle } from '@/lib/agents/anniversaryCycle';

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
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

  // Admin / staff only
  const allowedRoles = ['admin', 'broker', 'staff', 'tc'];
  const role = decoded.role || decoded.userRole || '';
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { agentId } = params;
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });

  try {
    // Determine which years to rebuild
    let yearsToRebuild: number[];
    try {
      const body = await req.json().catch(() => ({}));
      yearsToRebuild = Array.isArray(body.years) ? body.years : [];
    } catch {
      yearsToRebuild = [];
    }

    if (yearsToRebuild.length === 0) {
      // Default: rebuild current cycle year + prior year
      const profileDoc = await adminDb.collection('agentProfiles').doc(agentId).get();
      const p = profileDoc.exists ? (profileDoc.data() as any) : {};
      const anniversaryMonth = Number(p.anniversaryMonth ?? 0);
      const anniversaryDay = Number(p.anniversaryDay ?? 0);
      const today = new Date();
      const currentCycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, today);
      const currentYear = currentCycle.cycleStart.getUTCFullYear();
      const priorYear = currentYear - 1;
      yearsToRebuild = [currentYear, priorYear];
    }

    const rebuilt: number[] = [];
    for (const year of yearsToRebuild) {
      await rebuildAgentRollup(adminDb, agentId, year);
      rebuilt.push(year);
    }

    return NextResponse.json({ ok: true, agentId, rebuilt });
  } catch (err: any) {
    console.error('[rebuild-rollup]', err);
    return NextResponse.json({ error: err.message || 'Rebuild failed' }, { status: 500 });
  }
}
