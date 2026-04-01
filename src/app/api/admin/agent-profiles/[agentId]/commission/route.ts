import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { getTeamDefaultTiers, getTeamDefaultTransactionFee } from '@/lib/commissions/teamTemplates';
import { getAnniversaryCycle } from '@/lib/agents/anniversaryCycle';

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
    const { agentId } = await params;
    if (!agentId) return jsonError(400, 'Missing agentId');

    // Allow: admin-like users can fetch any agent's commission profile.
    // Allow: an agent can fetch their own commission profile (agentId === their UID).
    // Deny: agents cannot fetch other agents' commission profiles.
    const adminAccess = await isAdminLike(decoded.uid);
    const isSelf = decoded.uid === agentId;
    if (!adminAccess && !isSelf) {
      return jsonError(403, 'Forbidden');
    }

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

    // ── YTD tier progression companyDollar (anniversary-cycle based) ─────────
    // We look up the rollup document for the calendar year that contains the
    // agent's CURRENT anniversary cycle. Because rebuildAgentRollup now stores
    // tierProgressionCompanyDollar filtered to the anniversary cycle window,
    // we need to find which calendar-year rollup covers today's cycle.
    //
    // Strategy: the rollup for year Y stores the cycle that started in year Y.
    // Today's cycle starts in either this calendar year or last calendar year.
    // We check both rollups and pick the one whose cycleStart/cycleEnd contains today.
    let ytdTierProgressionCompanyDollar = 0;
    let cycleStart: string | null = null;
    let cycleEnd: string | null = null;
    try {
      const today = new Date();
      const anniversaryMonth = Number(data.anniversaryMonth ?? 0);
      const anniversaryDay = Number(data.anniversaryDay ?? 0);
      // Compute the current anniversary cycle
      const currentCycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, today);
      // The rollup document key is based on the calendar year of cycleStart
      const rollupYear = currentCycle.cycleStart.getUTCFullYear();
      const rollupSnap = await adminDb
        .collection('agentYearRollups')
        .doc(`${agentId}_${rollupYear}`)
        .get();
      if (rollupSnap.exists) {
        const r = rollupSnap.data() || {};
        // Prefer tierProgressionCompanyDollar (includes team member credits for leaders)
        // Fall back to companyDollar for agents whose rollup predates this field
        ytdTierProgressionCompanyDollar = Number(
          r.tierProgressionCompanyDollar ?? r.companyDollar ?? 0
        );
        cycleStart = String(r.cycleStart || currentCycle.cycleStart.toISOString().slice(0, 10));
        cycleEnd = String(r.cycleEnd || currentCycle.cycleEnd.toISOString().slice(0, 10));
      } else {
        // Rollup not yet built — return cycle boundaries from utility
        cycleStart = currentCycle.cycleStart.toISOString().slice(0, 10);
        cycleEnd = currentCycle.cycleEnd.toISOString().slice(0, 10);
      }
    } catch {
      // Non-fatal: form will fall back to per-transaction GCI for tier lookup
    }

    return NextResponse.json({
      ok: true,
      agentId,
      agentType,
      teamGroup,
      commissionMode,
      tiersSource,
      defaultTransactionFee,
      tiers,
      ytdTierProgressionCompanyDollar,
      // Anniversary cycle boundaries for display in progress bars / dashboard
      cycleStart,
      cycleEnd,
    });
  } catch (err: any) {
    console.error('[API/agent-profiles/commission] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error');
  }
}
