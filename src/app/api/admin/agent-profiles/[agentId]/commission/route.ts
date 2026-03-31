import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { getTeamDefaultTiers, getTeamDefaultTransactionFee } from '@/lib/commissions/teamTemplates';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizeTier(t: any) {
  return {
    tierName: t.tierName || '',
    fromCompanyDollar: Number(t.fromCompanyDollar || 0),
    toCompanyDollar:
      t.toCompanyDollar === null || t.toCompanyDollar === undefined
        ? null
        : Number(t.toCompanyDollar),
    agentSplitPercent: Number(t.agentSplitPercent || 0),
    companySplitPercent: Number(t.companySplitPercent || 0),
    transactionFee:
      t.transactionFee === null || t.transactionFee === undefined
        ? null
        : Number(t.transactionFee),
    capAmount:
      t.capAmount === null || t.capAmount === undefined
        ? null
        : Number(t.capAmount),
    notes: t.notes || '',
  };
}

/**
 * GET /api/admin/agent-profiles/[agentId]/commission
 *
 * Returns the agent's commission structure (tiers + default transaction fee)
 * so the Add Transaction / Edit Transaction form can auto-calculate splits.
 *
 * Fallback chain for tiers:
 *   1. Agent's own custom tiers (commissionMode = 'custom')
 *   2. Team plan bands (agentType = 'team', fetched from teamPlans collection)
 *   3. Team default template tiers (getTeamDefaultTiers by teamGroup)
 *   4. Standard independent tiers (final fallback via getTeamDefaultTiers)
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

    const agentType: string = data.agentType || 'independent';
    const teamGroup: string = data.teamGroup || 'independent';
    const commissionMode: string = data.commissionMode || 'team_default';
    const primaryTeamId: string | null = data.primaryTeamId || null;
    const teamRole: string | null = data.teamRole || null;

    // ── 1. Try agent's own stored tiers ──────────────────────────────────────
    let tiers: ReturnType<typeof normalizeTier>[] = (data.tiers || []).map(normalizeTier);
    let tiersSource = 'agent_custom';

    // ── 2. If tiers are empty, try team plan bands ────────────────────────────
    if (tiers.length === 0 && agentType === 'team' && primaryTeamId) {
      try {
        const teamSnap = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnap.exists) {
          const teamData = teamSnap.data() || {};
          const teamPlanId: string | null = teamData.teamPlanId || null;
          if (teamPlanId) {
            const planSnap = await adminDb.collection('teamPlans').doc(teamPlanId).get();
            if (planSnap.exists) {
              const planData = planSnap.data() || {};
              const bands =
                teamRole === 'leader'
                  ? (planData.leaderStructureBands || [])
                  : (planData.memberDefaultBands || []);
              if (bands.length > 0) {
                tiers = bands.map((b: any, i: number) => ({
                  tierName: b.tierName || `Band ${i + 1}`,
                  fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                  toCompanyDollar:
                    b.toCompanyDollar === null || b.toCompanyDollar === undefined
                      ? null
                      : Number(b.toCompanyDollar),
                  agentSplitPercent:
                    teamRole === 'leader'
                      ? Number(b.leaderPercent || 0)
                      : Number(b.memberPercent || 0),
                  companySplitPercent:
                    teamRole === 'leader'
                      ? Number(b.companyPercent || 0)
                      : Number(100 - (b.memberPercent || 0)),
                  transactionFee: null,
                  capAmount: null,
                  notes: '',
                }));
                tiersSource = 'team_plan';
              }
            }
          }
        }
      } catch {
        // Silently fall through to next fallback
      }
    }

    // ── 3. Fall back to team default template tiers ───────────────────────────
    if (tiers.length === 0) {
      const templateTiers = getTeamDefaultTiers(teamGroup);
      tiers = templateTiers.map((t) => ({
        tierName: t.tierName,
        fromCompanyDollar: t.fromCompanyDollar,
        toCompanyDollar: t.toCompanyDollar,
        agentSplitPercent: t.agentSplitPercent,
        companySplitPercent: t.companySplitPercent,
        transactionFee: null,
        capAmount: null,
        notes: t.notes || '',
      }));
      tiersSource = 'team_template';
    }

    // ── Default transaction fee ───────────────────────────────────────────────
    const defaultTransactionFee =
      data.defaultTransactionFee != null
        ? Number(data.defaultTransactionFee)
        : getTeamDefaultTransactionFee(teamGroup);

    return NextResponse.json({
      ok: true,
      agentId,
      agentType,
      teamGroup,
      commissionMode,
      tiersSource,
      defaultTransactionFee,
      tiers,
    });
  } catch (err: any) {
    console.error('[API/agent-profiles/commission] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error');
  }
}
