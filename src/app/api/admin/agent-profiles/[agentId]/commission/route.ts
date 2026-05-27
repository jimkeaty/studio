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
    const teamMemberCompMode: string = data.teamMemberCompMode || 'teamDefault';
    const teamMemberOverrideBands: any[] = data.teamMemberOverrideBands || [];

    // ── 0. Flat commission plan — synthetic single-tier, no progression ────────
    // Applies to both independent agents with commissionMode='flat' AND team agents
    // whose team uses a fixed commission model (commissionMode auto-set to 'flat' on save).
    if (commissionMode === 'flat') {
      const flatAgent = Number(data.flatAgentPercent ?? 0);
      const flatCompany = Number(data.flatCompanyPercent ?? 0);
      const defaultTransactionFee =
        data.defaultTransactionFee != null ? Number(data.defaultTransactionFee) : 0;
      return NextResponse.json({
        ok: true,
        agentId,
        agentType,
        teamGroup,
        commissionMode: 'flat',
        tiersSource: 'flat',
        defaultTransactionFee,
        tiers: [
          {
            tierName: 'Flat Rate',
            fromCompanyDollar: 0,
            toCompanyDollar: null,
            agentSplitPercent: flatAgent,
            companySplitPercent: flatCompany,
            transactionFee: null,
            capAmount: null,
            notes: 'Flat commission plan — no tier progression',
          },
        ],
        ytdTierProgressionCompanyDollar: 0,
        cycleStart: null,
        cycleEnd: null,
      });
    }

    // ── 0a-MEMBER. Team member with custom override bands — HIGHEST PRIORITY ───────
    // When a team member has teamMemberCompMode === 'custom' and saved
    // teamMemberOverrideBands, those bands define their actual payout — exactly
    // as the runtime resolver (teamTransactionResolver) uses them.
    // We must use the same source here so the add/edit form preview matches.
    if (
      agentType === 'team' &&
      teamRole === 'member' &&
      teamMemberCompMode === 'custom' &&
      teamMemberOverrideBands.length > 0 &&
      primaryTeamId
    ) {
      try {
        // Fetch the team plan to get the leader structure (for company split %)
        let companyPctForMember = 25; // safe fallback
        let leaderBandsForMember: any[] = [];
        const teamSnapMember = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnapMember.exists) {
          const teamDataMember = teamSnapMember.data() || {};
          const teamPlanIdMember: string | null = teamDataMember.teamPlanId || null;
          if (teamPlanIdMember) {
            const planSnapMember = await adminDb.collection('teamPlans').doc(teamPlanIdMember).get();
            if (planSnapMember.exists) {
              const planDataMember = planSnapMember.data() || {};
              leaderBandsForMember = planDataMember.leaderStructureBands || [];
              if (leaderBandsForMember.length > 0) {
                companyPctForMember = Number(leaderBandsForMember[0].companyPercent || 25);
              }
            }
          }
        }
        // Build tiers from the member's custom override bands
        const customMemberTiers = teamMemberOverrideBands.map((b: any, i: number) => ({
          tierName: b.tierName || `Band ${i + 1}`,
          fromCompanyDollar: Number(b.fromCompanyDollar || 0),
          toCompanyDollar:
            b.toCompanyDollar === null || b.toCompanyDollar === undefined
              ? null
              : Number(b.toCompanyDollar),
          agentSplitPercent: Number(b.memberPercent || 0),
          companySplitPercent: companyPctForMember,
          transactionFee: null,
          capAmount: null,
          notes: b.notes || '',
        }));
        // Build teamMemberLeaderSplit for the breakdown panel
        const teamMemberLeaderSplitCustom =
          leaderBandsForMember.length > 0
            ? {
                leaderStructureBands: leaderBandsForMember.map((b: any) => ({
                  fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                  toCompanyDollar:
                    b.toCompanyDollar === null || b.toCompanyDollar === undefined
                      ? null
                      : Number(b.toCompanyDollar),
                  leaderPercent: Number(b.leaderPercent || 0),
                  companyPercent: Number(b.companyPercent || 0),
                })),
                memberDefaultBands: teamMemberOverrideBands.map((b: any) => ({
                  fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                  toCompanyDollar:
                    b.toCompanyDollar === null || b.toCompanyDollar === undefined
                      ? null
                      : Number(b.toCompanyDollar),
                  memberPercent: Number(b.memberPercent || 0),
                })),
              }
            : null;
        // Fetch YTD rollup for tier progression
        let ytdCustom = 0;
        let cycleStartCustom: string | null = null;
        let cycleEndCustom: string | null = null;
        try {
          const today = new Date();
          const anniversaryMonth = Number(data.anniversaryMonth ?? 0);
          const anniversaryDay = Number(data.anniversaryDay ?? 0);
          const currentCycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, today);
          const rollupYear = currentCycle.cycleStart.getUTCFullYear();
          const rollupSnapCustom = await adminDb
            .collection('agentYearRollups')
            .doc(`${agentId}_${rollupYear}`)
            .get();
          if (rollupSnapCustom.exists) {
            const r = rollupSnapCustom.data() || {};
            ytdCustom = Number(r.tierProgressionCompanyDollar ?? r.companyDollar ?? 0);
            cycleStartCustom = String(r.cycleStart || currentCycle.cycleStart.toISOString().slice(0, 10));
            cycleEndCustom = String(r.cycleEnd || currentCycle.cycleEnd.toISOString().slice(0, 10));
          } else {
            cycleStartCustom = currentCycle.cycleStart.toISOString().slice(0, 10);
            cycleEndCustom = currentCycle.cycleEnd.toISOString().slice(0, 10);
          }
        } catch { /* non-fatal */ }
        const defaultTransactionFeeMember =
          data.defaultTransactionFee != null
            ? Number(data.defaultTransactionFee)
            : getTeamDefaultTransactionFee(teamGroup);
        return NextResponse.json({
          ok: true,
          agentId,
          agentType,
          teamGroup,
          commissionMode: 'custom',
          tiersSource: 'team_member_override',
          defaultTransactionFee: defaultTransactionFeeMember,
          tiers: customMemberTiers,
          teamMemberLeaderSplit: teamMemberLeaderSplitCustom,
          ytdTierProgressionCompanyDollar: ytdCustom,
          cycleStart: cycleStartCustom,
          cycleEnd: cycleEndCustom,
        });
      } catch {
        // Silently fall through to standard tier resolution
      }
    }

    // ── 0a. Agent's own stored tiers — ALWAYS the source of truth ─────────────
    // If the agent profile has tiers saved, use them unconditionally regardless
    // of commissionMode. This ensures custom tiers set by admin are never
    // overridden by team plan defaults or template fallbacks.
    const agentStoredTiers = (data.tiers || []).map(normalizeTier);
    if (agentStoredTiers.length > 0) {
      // Agent has saved tiers — skip all fallback logic and proceed directly
      // to the YTD rollup lookup below.
      // (fall through — tiers will be set at step 1 below)
    }

    // ── 0b. Team agent with team_default mode — check if team plan is fixed ────
    // Only applies when the agent has NO saved tiers of their own.
    // If the team plan uses a fixed commission model, return a flat-rate tier.
    if (agentStoredTiers.length === 0 && commissionMode === 'team_default' && agentType === 'team' && primaryTeamId) {
      try {
        const teamSnap0 = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnap0.exists) {
          const teamData0 = teamSnap0.data() || {};
          const teamPlanId0: string | null = teamData0.teamPlanId || null;
          if (teamPlanId0) {
            const planSnap0 = await adminDb.collection('teamPlans').doc(teamPlanId0).get();
            if (planSnap0.exists) {
              const planData0 = planSnap0.data() || {};
              if (planData0.commissionModelType === 'fixed' && planData0.fixedSplit) {
                const flatAgent0 = Number(planData0.fixedSplit.agentPercent ?? 0);
                const flatCompany0 = Number(planData0.fixedSplit.companyPercent ?? 0);
                const defaultTransactionFee0 =
                  data.defaultTransactionFee != null
                    ? Number(data.defaultTransactionFee)
                    : getTeamDefaultTransactionFee(teamGroup);
                return NextResponse.json({
                  ok: true,
                  agentId,
                  agentType,
                  teamGroup,
                  commissionMode: 'flat',
                  tiersSource: 'team_plan_fixed',
                  defaultTransactionFee: defaultTransactionFee0,
                  tiers: [
                    {
                      tierName: 'Flat Rate',
                      fromCompanyDollar: 0,
                      toCompanyDollar: null,
                      agentSplitPercent: flatAgent0,
                      companySplitPercent: flatCompany0,
                      transactionFee: null,
                      capAmount: null,
                      notes: 'Fixed commission plan from team plan',
                    },
                  ],
                  ytdTierProgressionCompanyDollar: 0,
                  cycleStart: null,
                  cycleEnd: null,
                });
              }
            }
          }
        }
      } catch {
        // Silently fall through to tiered resolution
      }
    }

    // ── 1. Agent's own stored tiers — source of truth ──────────────────────────
    // agentStoredTiers was computed above. Use it directly.
    let tiers: ReturnType<typeof normalizeTier>[] = agentStoredTiers;
    let tiersSource = 'agent_custom';

    // ── 2. If tiers are empty, try team plan bands ────────────────────────────
    //
    // CORRECT COMMISSION MODEL for team members on a team WITH a leader:
    //
    //   companySplitPercent = companyPercent from the leader band
    //                       = 100 - leaderPercent  (e.g. 25%)
    //
    //   agentSplitPercent   = memberPercent applied to FULL GCI directly
    //                       (e.g. 70% of $1,800 = $1,260)
    //
    //   leaderRetains       = GCI - companyRetained - memberPaid
    //                       = leaderStructureGross - memberPaid
    //                       (e.g. $1,350 - $450 - $1,260 = $90)
    //
    // The leaderPercent is used ONLY to determine the broker/company cut.
    // The memberPercent is the member's direct % of full GCI.
    //
    // For team LEADERS, agentSplitPercent = leaderPercent (their cut of GCI).
    // For LEADERLESS team members, agentSplitPercent = memberPercent of GCI directly.
    let teamMemberLeaderSplit: {
      leaderStructureBands: Array<{
        fromCompanyDollar: number;
        toCompanyDollar: number | null;
        leaderPercent: number;
        companyPercent: number;
      }>;
      memberDefaultBands: Array<{
        fromCompanyDollar: number;
        toCompanyDollar: number | null;
        memberPercent: number;
      }>;
    } | null = null;

    if (tiers.length === 0 && agentType === 'team' && primaryTeamId) {
      // Only fall back to team plan when agent has no saved tiers of their own
      try {
        const teamSnap = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnap.exists) {
          const teamData = teamSnap.data() || {};
          const teamPlanId: string | null = teamData.teamPlanId || null;
          const teamStructureType: string = teamData.structureType || 'with_leader';
          if (teamPlanId) {
            const planSnap = await adminDb.collection('teamPlans').doc(teamPlanId).get();
            if (planSnap.exists) {
              const planData = planSnap.data() || {};
              const planStructureType: string = planData.structureType || teamStructureType;
              const isWithLeader = planStructureType === 'with_leader';

              if (teamRole === 'leader') {
                // Leader: agentSplitPercent = leaderPercent (their cut of GCI)
                const bands = planData.leaderStructureBands || [];
                if (bands.length > 0) {
                  tiers = bands.map((b: any, i: number) => ({
                    tierName: b.tierName || `Band ${i + 1}`,
                    fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                    toCompanyDollar:
                      b.toCompanyDollar === null || b.toCompanyDollar === undefined
                        ? null
                        : Number(b.toCompanyDollar),
                    agentSplitPercent: Number(b.leaderPercent || 0),
                    companySplitPercent: Number(b.companyPercent || 0),
                    transactionFee: null,
                    capAmount: null,
                    notes: '',
                  }));
                  tiersSource = 'team_plan';
                }
              } else if (isWithLeader) {
                // Member on a team WITH a leader:
                //   agentSplitPercent   = memberPercent (member's direct % of full GCI)
                //   companySplitPercent = companyPercent from the leader band
                //   leaderRetains       = GCI - companyRetained - memberPaid (the spread)
                //
                // The leaderPercent is used ONLY to set the broker/company cut.
                // memberPercent is the member's own split of the full GCI.
                const leaderBands: any[] = planData.leaderStructureBands || [];
                const memberBands: any[] = planData.memberDefaultBands || [];

                if (leaderBands.length > 0 && memberBands.length > 0) {
                  // Build tiers by pairing each leader band with the matching member band.
                  // Tier thresholds are driven by the leader band (company-dollar progression).
                  // Member band is matched by its fromCompanyDollar threshold.
                  tiers = leaderBands.map((lb: any, i: number) => {
                    // Find the member band whose threshold contains this leader band's from value
                    const matchingMemberBand = memberBands.find((mb: any) => {
                      const mbFrom = Number(mb.fromCompanyDollar || 0);
                      const mbTo =
                        mb.toCompanyDollar === null || mb.toCompanyDollar === undefined
                          ? null
                          : Number(mb.toCompanyDollar);
                      const lbFrom = Number(lb.fromCompanyDollar || 0);
                      return lbFrom >= mbFrom && (mbTo === null || lbFrom < mbTo);
                    }) || memberBands[memberBands.length - 1];

                    const leaderPct = Number(lb.leaderPercent || 0);
                    const memberPct = Number(matchingMemberBand?.memberPercent || 0);
                    const companyPct = Number(lb.companyPercent || 0);

                    return {
                      tierName: lb.tierName || `Band ${i + 1}`,
                      fromCompanyDollar: Number(lb.fromCompanyDollar || 0),
                      toCompanyDollar:
                        lb.toCompanyDollar === null || lb.toCompanyDollar === undefined
                          ? null
                          : Number(lb.toCompanyDollar),
                      // Member's direct % of full GCI (NOT leaderPercent × memberPercent)
                      agentSplitPercent: memberPct,
                      // Company retains companyPercent of full GCI (= 100 - leaderPercent)
                      companySplitPercent: companyPct,
                      // Store raw percents for display breakdown in the preview card
                      leaderStructurePercent: leaderPct,
                      memberPercentOfLeaderSide: memberPct, // kept for type compat; now = direct GCI %
                      transactionFee: null,
                      capAmount: null,
                      notes: '',
                    };
                  });
                  tiersSource = 'team_plan';

                  // Expose the raw leader/member bands so the form can render the two-step breakdown
                  teamMemberLeaderSplit = {
                    leaderStructureBands: leaderBands.map((b: any) => ({
                      fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                      toCompanyDollar:
                        b.toCompanyDollar === null || b.toCompanyDollar === undefined
                          ? null
                          : Number(b.toCompanyDollar),
                      leaderPercent: Number(b.leaderPercent || 0),
                      companyPercent: Number(b.companyPercent || 0),
                    })),
                    memberDefaultBands: memberBands.map((b: any) => ({
                      fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                      toCompanyDollar:
                        b.toCompanyDollar === null || b.toCompanyDollar === undefined
                          ? null
                          : Number(b.toCompanyDollar),
                      memberPercent: Number(b.memberPercent || 0),
                    })),
                  };
                } else if (memberBands.length > 0) {
                  // Only member bands present — treat memberPercent as % of GCI (leaderless-style fallback)
                  tiers = memberBands.map((b: any, i: number) => ({
                    tierName: b.tierName || `Band ${i + 1}`,
                    fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                    toCompanyDollar:
                      b.toCompanyDollar === null || b.toCompanyDollar === undefined
                        ? null
                        : Number(b.toCompanyDollar),
                    agentSplitPercent: Number(b.memberPercent || 0),
                    companySplitPercent: Math.max(0, 100 - Number(b.memberPercent || 0)),
                    transactionFee: null,
                    capAmount: null,
                    notes: '',
                  }));
                  tiersSource = 'team_plan';
                }
              } else {
                // Leaderless team member: memberPercent is % of full GCI
                const bands = planData.memberDefaultBands || [];
                if (bands.length > 0) {
                  tiers = bands.map((b: any, i: number) => ({
                    tierName: b.tierName || `Band ${i + 1}`,
                    fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                    toCompanyDollar:
                      b.toCompanyDollar === null || b.toCompanyDollar === undefined
                        ? null
                        : Number(b.toCompanyDollar),
                    agentSplitPercent: Number(b.memberPercent || 0),
                    companySplitPercent: Math.max(0, 100 - Number(b.memberPercent || 0)),
                    transactionFee: null,
                    capAmount: null,
                    notes: '',
                  }));
                  tiersSource = 'team_plan';
                }
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

    // ── 4. Absolute last-resort fallback — should never be reached ────────────
    // getTeamDefaultTiers always returns STANDARD_TIERS for unknown groups,
    // so this guard is purely defensive against future code changes.
    if (tiers.length === 0) {
      console.warn(
        `[commission API] All tier sources exhausted for agent ${agentId}; ` +
        `falling back to STANDARD_TIERS. commissionMode=${commissionMode}, teamGroup=${teamGroup}`
      );
      const fallbackTiers = getTeamDefaultTiers('independent');
      tiers = fallbackTiers.map((t) => ({
        tierName: t.tierName,
        fromCompanyDollar: t.fromCompanyDollar,
        toCompanyDollar: t.toCompanyDollar,
        agentSplitPercent: t.agentSplitPercent,
        companySplitPercent: t.companySplitPercent,
        transactionFee: null,
        capAmount: null,
        notes: t.notes || '',
      }));
      tiersSource = 'standard_fallback';
    }

    // ── Always fetch teamMemberLeaderSplit for team members with a leader ────────
    // Even when the agent has custom tiers (agentStoredTiers.length > 0), we still
    // need to populate teamMemberLeaderSplit so the admin edit form can show the
    // Team Leader Commission Breakdown panel. Without this, the panel is hidden
    // for any team member who has custom tiers on their profile.
    if (!teamMemberLeaderSplit && agentType === 'team' && teamRole === 'member' && primaryTeamId) {
      try {
        const teamSnapExtra = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnapExtra.exists) {
          const teamDataExtra = teamSnapExtra.data() || {};
          const teamPlanIdExtra: string | null = teamDataExtra.teamPlanId || null;
          const teamStructureTypeExtra: string = teamDataExtra.structureType || 'with_leader';
          if (teamPlanIdExtra) {
            const planSnapExtra = await adminDb.collection('teamPlans').doc(teamPlanIdExtra).get();
            if (planSnapExtra.exists) {
              const planDataExtra = planSnapExtra.data() || {};
              const planStructureTypeExtra: string = planDataExtra.structureType || teamStructureTypeExtra;
              const isWithLeaderExtra = planStructureTypeExtra === 'with_leader';
              if (isWithLeaderExtra) {
                const leaderBandsExtra: any[] = planDataExtra.leaderStructureBands || [];
                const memberBandsExtra: any[] = planDataExtra.memberDefaultBands || [];
                if (leaderBandsExtra.length > 0 && memberBandsExtra.length > 0) {
                  teamMemberLeaderSplit = {
                    leaderStructureBands: leaderBandsExtra.map((b: any) => ({
                      fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                      toCompanyDollar:
                        b.toCompanyDollar === null || b.toCompanyDollar === undefined
                          ? null
                          : Number(b.toCompanyDollar),
                      leaderPercent: Number(b.leaderPercent || 0),
                      companyPercent: Number(b.companyPercent || 0),
                    })),
                    memberDefaultBands: memberBandsExtra.map((b: any) => ({
                      fromCompanyDollar: Number(b.fromCompanyDollar || 0),
                      toCompanyDollar:
                        b.toCompanyDollar === null || b.toCompanyDollar === undefined
                          ? null
                          : Number(b.toCompanyDollar),
                      memberPercent: Number(b.memberPercent || 0),
                    })),
                  };
                }
              }
            }
          }
        }
      } catch { /* non-fatal — panel simply won't show */ }
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
      // Present for team members on a team WITH a leader — null for all other agent types.
      // When present, the form should display the two-step commission breakdown:
      //   Step 1: leaderStructureGross = GCI × leaderStructureBand.leaderPercent
      //   Step 2: memberPaid = leaderStructureGross × memberDefaultBand.memberPercent
      // The tiers[].agentSplitPercent already contains the EFFECTIVE % of full GCI
      // (leaderPercent × memberPercent / 100) so auto-calc is always correct.
      teamMemberLeaderSplit,
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
