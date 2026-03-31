import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * GET /api/admin/agent-profiles/[agentId]/commission
 *
 * Returns the agent's commission structure (tiers + default transaction fee)
 * so the Add Transaction form can auto-calculate splits.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return jsonError(403, 'Forbidden');
    }

    const { agentId } = await params;
    if (!agentId) return jsonError(400, 'Missing agentId');

    const snap = await adminDb.collection('agentProfiles').doc(agentId).get();
    if (!snap.exists) {
      return jsonError(404, 'Agent profile not found');
    }

    const data = snap.data() || {};

    return NextResponse.json({
      ok: true,
      agentId,
      agentType: data.agentType || 'independent',
      teamGroup: data.teamGroup || 'independent',
      commissionMode: data.commissionMode || 'team_default',
      defaultTransactionFee: data.defaultTransactionFee ?? null,
      tiers: (data.tiers || []).map((t: any) => ({
        tierName: t.tierName || '',
        fromCompanyDollar: Number(t.fromCompanyDollar || 0),
        toCompanyDollar: t.toCompanyDollar === null || t.toCompanyDollar === undefined
          ? null
          : Number(t.toCompanyDollar),
        agentSplitPercent: Number(t.agentSplitPercent || 0),
        companySplitPercent: Number(t.companySplitPercent || 0),
        transactionFee: t.transactionFee === null || t.transactionFee === undefined
          ? null
          : Number(t.transactionFee),
        capAmount: t.capAmount === null || t.capAmount === undefined
          ? null
          : Number(t.capAmount),
        notes: t.notes || '',
      })),
    });
  } catch (err: any) {
    console.error('[API/agent-profiles/commission] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error');
  }
}
