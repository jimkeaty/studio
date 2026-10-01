import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * POST /api/admin/agent-profiles/[agentId]/rollup-rebuild
 *
 * Rebuilds exactly one agent-year derived rollup from the canonical transaction
 * ledger. It deliberately cannot mutate the ledger itself or rebuild all agents.
 * Body: { year: number, reason?: string }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const header = req.headers.get('authorization') || '';
    if (!header.startsWith('Bearer ')) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(header.slice('Bearer '.length));
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { agentId } = await context.params;
    const normalizedAgentId = String(agentId || '').trim();
    if (!normalizedAgentId) return jsonError(400, 'Agent ID is required');

    const body = await req.json().catch(() => ({}));
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return jsonError(400, 'A valid calendar year is required');
    }

    const profile = await adminDb.collection('agentProfiles').doc(normalizedAgentId).get();
    if (!profile.exists) return jsonError(404, 'Agent profile not found');

    await rebuildAgentRollup(adminDb, normalizedAgentId, year);
    const rollupId = `${normalizedAgentId}_${year}`;
    const rollup = await adminDb.collection('agentYearRollups').doc(rollupId).get();

    await adminDb.collection('agentYearRollups').doc(rollupId).collection('auditEvents').add({
      type: 'targeted_rollup_rebuild',
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      agentId: normalizedAgentId,
      year,
      rollup: rollup.exists ? rollup.data() : null,
    });
  } catch (error: any) {
    console.error('[agent rollup rebuild]', error);
    return jsonError(500, error?.message || 'Unable to rebuild agent rollup');
  }
}
