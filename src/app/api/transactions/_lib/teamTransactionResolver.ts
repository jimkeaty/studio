import { adminDb } from '@/lib/firebase/admin';
import { nameSimilarity } from '@/lib/agents/fuzzyMatch';
import { getAnniversaryCycle } from '@/lib/agents/anniversaryCycle';
import type {
  AgentProfile,
  AgentTier,
} from '@/lib/agents/types';
import type {
  MemberPlan,
  MemberPlanBand,
  Team,
  TeamMembership,
  TeamPlan,
  TeamThresholdBand,
} from '@/lib/teams/types';
import type {
  ResolveTransactionInput,
  ResolvedTransactionCalculation,
} from '@/lib/transactions/types';

function asMoney(value: number) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function getActiveIndividualTier(
  tiers: AgentTier[],
  commission: number
): AgentTier | null {
  for (const tier of tiers || []) {
    const from = Number(tier.fromCompanyDollar || 0);
    const to =
      tier.toCompanyDollar === null || tier.toCompanyDollar === undefined
        ? null
        : Number(tier.toCompanyDollar);

    if (commission >= from && (to === null || commission < to)) {
      return tier;
    }
  }

  return null;
}

function getActiveLeaderBand(
  bands: TeamThresholdBand[],
  commission: number
): TeamThresholdBand | null {
  for (const band of bands || []) {
    const from = Number(band.fromCompanyDollar || 0);
    const to =
      band.toCompanyDollar === null || band.toCompanyDollar === undefined
        ? null
        : Number(band.toCompanyDollar);

    if (commission >= from && (to === null || commission < to)) {
      return band;
    }
  }

  return null;
}

function getActiveMemberBand(
  bands: MemberPlanBand[],
  commission: number
): MemberPlanBand | null {
  for (const band of bands || []) {
    const from = Number(band.fromCompanyDollar || 0);
    const to =
      band.toCompanyDollar === null || band.toCompanyDollar === undefined
        ? null
        : Number(band.toCompanyDollar);

    if (commission >= from && (to === null || commission < to)) {
      return band;
    }
  }

  return null;
}

async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  // First try direct doc lookup (slug-keyed profiles, e.g. 'scott-domingue')
  const snap = await adminDb.collection('agentProfiles').doc(agentId).get();
  if (snap.exists) {
    return snap.data() as AgentProfile;
  }

  // Fallback: the intake may store the agent's Firebase UID instead of the slug.
  // Query by the agentId field (which stores the slug) or by firebaseUid field.
  const bySlugSnap = await adminDb
    .collection('agentProfiles')
    .where('agentId', '==', agentId)
    .limit(1)
    .get();
  if (!bySlugSnap.empty) {
    return bySlugSnap.docs[0].data() as AgentProfile;
  }

  const byUidSnap = await adminDb
    .collection('agentProfiles')
    .where('firebaseUid', '==', agentId)
    .limit(1)
    .get();
  if (!byUidSnap.empty) {
    return byUidSnap.docs[0].data() as AgentProfile;
  }

  // Fallback: fuzzy name match — handles cases where the stored agentId slug
  // doesn't exactly match the profile doc ID (e.g. 'charles-ditch' vs 'charles-ditsch',
  // or when a display name is passed instead of a slug).
  // Convert the agentId slug back to a readable name for comparison.
  const agentIdAsName = agentId.replace(/-/g, ' ');
  try {
    const allProfilesSnap = await adminDb.collection('agentProfiles').get();
    let bestDocData: AgentProfile | null = null;
    let bestDocId = '';
    let bestScore = 0;
    for (const profileDoc of allProfilesSnap.docs) {
      const profileData = profileDoc.data() as AgentProfile;
      const profileName = String(profileData.displayName || profileDoc.id).replace(/-/g, ' ');
      const score = nameSimilarity(agentIdAsName, profileName);
      if (score > bestScore) {
        bestScore = score;
        bestDocData = profileData;
        bestDocId = profileDoc.id;
      }
    }
    // Accept fuzzy match at >= 0.75 similarity
    if (bestDocData && bestScore >= 0.75) {
      console.warn(
        `[getAgentProfile] Fuzzy matched '${agentId}' → '${bestDocId}' (score: ${bestScore.toFixed(2)})`
      );
      return bestDocData;
    }
  } catch (fuzzyErr: any) {
    console.warn('[getAgentProfile] Fuzzy fallback failed:', fuzzyErr?.message);
  }

  throw new Error(`Agent profile not found for ${agentId}`);
}

async function getTeam(teamId: string): Promise<Team> {
  const snap = await adminDb.collection('teams').doc(teamId).get();
  if (!snap.exists) {
    throw new Error(`Team not found for ${teamId}`);
  }
  return snap.data() as Team;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getTeamPlan(teamPlanId: string): Promise<TeamPlan> {
  const snap = await adminDb.collection('teamPlans').doc(teamPlanId).get();
  if (!snap.exists) {
    throw new Error(`Team plan not found for ${teamPlanId}`);
  }
  return snap.data() as TeamPlan;
}

async function getActiveMembership(
  teamId: string,
  agentId: string,
  role: 'leader' | 'member'
): Promise<TeamMembership> {
  const membershipId = `${teamId}__${agentId}__${role}`;
  const snap = await adminDb.collection('teamMemberships').doc(membershipId).get();
  if (!snap.exists) {
    throw new Error(`Team membership not found for ${membershipId}`);
  }

  const membership = snap.data() as TeamMembership;
  if (!membership.activeFlag) {
    throw new Error(`Team membership is inactive for ${membershipId}`);
  }

  return membership;
}

async function getMemberPlan(memberPlanId: string): Promise<MemberPlan> {
  const snap = await adminDb.collection('memberPlans').doc(memberPlanId).get();
  if (!snap.exists) {
    throw new Error(`Member plan not found for ${memberPlanId}`);
  }
  return snap.data() as MemberPlan;
}

/**
 * Look up the agent's cumulative YTD tier-progression company dollar from
 * their agentYearRollups document. This is the correct value to use for
 * tier bracket selection — NOT the single-transaction GCI.
 *
 * Returns 0 if the rollup does not exist yet (new agent / first transaction).
 */
async function getAgentYtdCompanyDollar(
  agentId: string,
  profile: AgentProfile,
  referenceDate?: string | Date | null
): Promise<number> {
  try {
    const anniversaryMonth = Number((profile as any).anniversaryMonth ?? 0);
    const anniversaryDay = Number((profile as any).anniversaryDay ?? 0);
    // Use the transaction date (if provided) to find the correct anniversary cycle.
    // This ensures past-dated transactions (e.g. a January closing entered in May)
    // use the cycle that was active when the transaction actually occurred,
    // not the cycle that is active today.
    let refDate: Date;
    if (referenceDate) {
      const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
      refDate = isNaN(d.getTime()) ? new Date() : d;
    } else {
      refDate = new Date();
    }
    const cycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, refDate);
    const rollupYear = cycle.cycleStart.getUTCFullYear();
    const rollupSnap = await adminDb
      .collection('agentYearRollups')
      .doc(`${agentId}_${rollupYear}`)
      .get();
    if (!rollupSnap.exists) return 0;
    const r = rollupSnap.data() || {};
    return Number(r.tierProgressionCompanyDollar ?? r.companyDollar ?? 0);
  } catch {
    return 0; // non-fatal — fall back to 0 (first-tier behaviour)
  }
}

export async function resolveTransactionCalculation(
  input: ResolveTransactionInput
): Promise<ResolvedTransactionCalculation> {
  const grossCommission = asMoney(input.commission);

  // ── Outbound referral fee: deducted from the top of GCI before agent/broker split ────────────────
  // referralFeeDollar takes precedence over referralFeePercent when both are supplied.
  const referralFeePercent: number | null =
    input.referralFeePercent != null && Number.isFinite(Number(input.referralFeePercent))
      ? Number(input.referralFeePercent)
      : null;
  const referralFeeDollar: number | null =
    input.referralFeeDollar != null && Number.isFinite(Number(input.referralFeeDollar))
      ? asMoney(Number(input.referralFeeDollar))
      : referralFeePercent != null
        ? asMoney(grossCommission * (referralFeePercent / 100))
        : null;
  const netAfterReferral: number | null =
    referralFeeDollar != null ? asMoney(grossCommission - referralFeeDollar) : null;

  // The commission used for agent/broker split is the net-after-referral amount
  // (or the full gross when no referral is present).
  const commission = netAfterReferral ?? grossCommission;

  const profile = await getAgentProfile(input.agentId);

  // ─── Independent agent path ──────────────────────────────────────────────────
  if (profile.agentType === 'independent') {
    // ── Flat commission plan: fixed split, no tiers, no progression ──
    if ((profile as any).commissionMode === 'flat') {
      const flatAgentPct = Number((profile as any).flatAgentPercent ?? 0);
      const flatCompanyPct = Number((profile as any).flatCompanyPercent ?? Math.max(0, 100 - flatAgentPct));
      const agentNetCommission = asMoney(commission * (flatAgentPct / 100));
      const companyRetained = asMoney(commission * (flatCompanyPct / 100));
      return {
        calculationModel: 'individual',
        agentType: profile.agentType,
        splitSnapshot: {
          primaryTeamId: null,
          teamPlanId: null,
          memberPlanId: null,
          grossCommission,
          referralFeePercent: referralFeePercent ?? null,
          referralFeeDollar: referralFeeDollar ?? null,
          netAfterReferral: netAfterReferral ?? null,
          agentSplitPercent: flatAgentPct,
          companySplitPercent: flatCompanyPct,
          agentNetCommission,
          leaderStructurePercent: null,
          leaderStructureGross: null,
          memberPercentOfLeaderSide: null,
          memberPaid: null,
          leaderRetainedAfterMember: null,
          companyRetained,
        },
        creditSnapshot: {
          leaderboardAgentId: profile.agentId,
          leaderboardAgentDisplayName: input.agentDisplayName,
          progressionMemberAgentId: profile.agentId,
          progressionLeaderAgentId: null,
          progressionTeamId: null,
          progressionCompanyDollarCredit: companyRetained,
        },
      };
    }

    // ── Tiered commission plan: use cumulative YTD company dollar for tier lookup ──
    // Use cumulative YTD company dollar for tier bracket selection.
    // Two-pass approach: first find the tier using YTD alone, compute the company
    // dollar this transaction adds, then check if the total crosses into the next tier.
    const ytdCompanyDollar = await getAgentYtdCompanyDollar(profile.agentId, profile, input.transactionDate);
    const tier = getActiveIndividualTier(profile.tiers || [], ytdCompanyDollar) ||
                 getActiveIndividualTier(profile.tiers || [], 0);
    if (!tier) {
      throw new Error(`No active individual tier found for ${profile.agentId}`);
    }
    const companyDollarThisTx = asMoney(commission * (Number(tier.companySplitPercent || 0) / 100));
    const totalAfterTx = ytdCompanyDollar + companyDollarThisTx;
    const upgradedTier = getActiveIndividualTier(profile.tiers || [], totalAfterTx) || tier;

    const agentSplitPercent = Number(upgradedTier.agentSplitPercent || 0);
    const companySplitPercent = Number(upgradedTier.companySplitPercent || 0);
    const agentNetCommission = asMoney(commission * (agentSplitPercent / 100));
    const companyRetained = asMoney(commission * (companySplitPercent / 100));

    return {
      calculationModel: 'individual',
      agentType: profile.agentType,
      splitSnapshot: {
        primaryTeamId: null,
        teamPlanId: null,
        memberPlanId: null,
        grossCommission,
        referralFeePercent: referralFeePercent ?? null,
        referralFeeDollar: referralFeeDollar ?? null,
        netAfterReferral: netAfterReferral ?? null,
        agentSplitPercent,
        companySplitPercent,
        agentNetCommission,
        leaderStructurePercent: null,
        leaderStructureGross: null,
        memberPercentOfLeaderSide: null,
        memberPaid: null,
        leaderRetainedAfterMember: null,
        companyRetained,
      },
      creditSnapshot: {
        leaderboardAgentId: profile.agentId,
        leaderboardAgentDisplayName: input.agentDisplayName,
        progressionMemberAgentId: profile.agentId,
        progressionLeaderAgentId: null,
        progressionTeamId: null,
        progressionCompanyDollarCredit: commission,
      },
    };
  }

  if (profile.agentType !== 'team') {
    throw new Error(`Unsupported agent type for ${profile.agentId}`);
  }

  if (!profile.primaryTeamId) {
    throw new Error(`Primary team missing for ${profile.agentId}`);
  }

  if (!profile.teamRole) {
    throw new Error(`Team role missing for ${profile.agentId}`);
  }

  const team = await getTeam(profile.primaryTeamId);

  // Fetch team plan lazily — leaderless teams may not have a plan configured.
  // For leaderless teams, a missing plan is non-fatal; we fall back to agent tiers.
  // For teams with a leader, a missing plan is a fatal error.
  let teamPlan: TeamPlan | null = null;
  if (team.teamPlanId) {
    const planSnap = await adminDb.collection('teamPlans').doc(team.teamPlanId).get();
    if (planSnap.exists) {
      teamPlan = planSnap.data() as TeamPlan;
    }
  }

  // Check structureType on team plan first (explicit override set in team plan editor),
  // then fall back to the team document for backward compatibility.
  const isLeaderless =
    teamPlan?.structureType === 'no_leader' ||
    (team.structureType || 'with_leader') === 'no_leader';

  if (!teamPlan && !isLeaderless) {
    throw new Error(`Team plan not found for ${team.teamPlanId} (team: ${team.teamId})`);
  }

  const isFixedModel = teamPlan
    ? (teamPlan.commissionModelType || 'tiered') === 'fixed'
    : false;

  // ─── Fixed Commission Model path ─────────────────────────────────────────────
  // Flat split on every transaction — no tier lookup, no leader bands.
  if (isFixedModel) {
    const fixedSplit = teamPlan!.fixedSplit;
    if (!fixedSplit) {
      throw new Error(
        `Team plan ${teamPlan!.teamPlanId} is set to fixed model but has no fixedSplit defined`
      );
    }
    const agentSplitPercent = Number(fixedSplit.agentPercent || 0);
    const companySplitPercent = Number(fixedSplit.companyPercent || 0);
    const agentNetCommission = asMoney(commission * (agentSplitPercent / 100));
    const companyRetained = asMoney(commission * (companySplitPercent / 100));

    return {
      calculationModel: 'individual',
      agentType: profile.agentType,
      splitSnapshot: {
        primaryTeamId: team.teamId,
        teamPlanId: teamPlan?.teamPlanId ?? null,
        memberPlanId: null,
        grossCommission,
        referralFeePercent: referralFeePercent ?? null,
        referralFeeDollar: referralFeeDollar ?? null,
        netAfterReferral: netAfterReferral ?? null,
        agentSplitPercent,
        companySplitPercent,
        agentNetCommission,
        leaderStructurePercent: null,
        leaderStructureGross: null,
        memberPercentOfLeaderSide: null,
        memberPaid: null,
        leaderRetainedAfterMember: null,
        companyRetained,
      },
      creditSnapshot: {
        leaderboardAgentId: profile.agentId,
        leaderboardAgentDisplayName: input.agentDisplayName,
        progressionMemberAgentId: profile.agentId,
        progressionLeaderAgentId: null,
        progressionTeamId: team.teamId,
        progressionCompanyDollarCredit: commission,
      },
    };
  }

  // ─── Leaderless team path (CGL, SGL, Referral Group, etc.) ───────────────────
  // Commission splits are agent vs. company only — no leader band lookup needed.
  // Resolution order:
  //   1. Agent's custom teamMemberOverrideBands (memberPercent = agent's % of full GCI)
  //   2. Team plan's memberDefaultBands (fallback to team default)
  //   3. Agent's individual tiers (legacy fallback for backward compatibility)
  if (isLeaderless) {
    let agentSplitPercent: number;
    let companySplitPercent: number;

    // Fetch YTD company dollar for tier progression in leaderless team paths
    const leaderlessYtd = await getAgentYtdCompanyDollar(profile.agentId, profile, input.transactionDate);

    // Priority 1: custom override bands on the agent profile
    if (
      profile.teamMemberCompMode === 'custom' &&
      Array.isArray(profile.teamMemberOverrideBands) &&
      profile.teamMemberOverrideBands.length > 0
    ) {
      const memberBand = getActiveMemberBand(
        profile.teamMemberOverrideBands as MemberPlanBand[],
        leaderlessYtd
      ) || getActiveMemberBand(profile.teamMemberOverrideBands as MemberPlanBand[], 0);
      if (!memberBand) {
        throw new Error(
          `No active custom member tier found for leaderless team member ${profile.agentId}`
        );
      }
      agentSplitPercent = Number(memberBand.memberPercent || 0);
      companySplitPercent = Math.max(0, 100 - agentSplitPercent);
    } else if (
      // Priority 2: team plan's memberDefaultBands
      teamPlan &&
      Array.isArray(teamPlan.memberDefaultBands) &&
      teamPlan.memberDefaultBands.length > 0
    ) {
      const memberBand = getActiveMemberBand(teamPlan.memberDefaultBands, leaderlessYtd) ||
                         getActiveMemberBand(teamPlan.memberDefaultBands, 0);
      if (!memberBand) {
        throw new Error(
          `No active member default band found for leaderless team ${team.teamId}`
        );
      }
      agentSplitPercent = Number(memberBand.memberPercent || 0);
      companySplitPercent = Math.max(0, 100 - agentSplitPercent);
    } else {
      // Priority 3: legacy fallback — individual tiers on the agent profile
      const tier = getActiveIndividualTier(profile.tiers || [], leaderlessYtd) ||
                   getActiveIndividualTier(profile.tiers || [], 0);
      if (!tier) {
        throw new Error(
          `No active tier found for leaderless team member ${profile.agentId}`
        );
      }
      agentSplitPercent = Number(tier.agentSplitPercent || 0);
      companySplitPercent = Number(tier.companySplitPercent || 0);
    }

    const agentNetCommission = asMoney(commission * (agentSplitPercent / 100));
    const companyRetained = asMoney(commission * (companySplitPercent / 100));

    return {
      calculationModel: 'individual',
      agentType: profile.agentType,
      splitSnapshot: {
        primaryTeamId: team.teamId,
        teamPlanId: teamPlan?.teamPlanId ?? null,
        memberPlanId: null,
        grossCommission,
        referralFeePercent: referralFeePercent ?? null,
        referralFeeDollar: referralFeeDollar ?? null,
        netAfterReferral: netAfterReferral ?? null,
        agentSplitPercent,
        companySplitPercent,
        agentNetCommission,
        leaderStructurePercent: null,
        leaderStructureGross: null,
        memberPercentOfLeaderSide: null,
        memberPaid: null,
        leaderRetainedAfterMember: null,
        companyRetained,
      },
      creditSnapshot: {
        leaderboardAgentId: profile.agentId,
        leaderboardAgentDisplayName: input.agentDisplayName,
        progressionMemberAgentId: profile.agentId,
        progressionLeaderAgentId: null,
        progressionTeamId: team.teamId,
        progressionCompanyDollarCredit: companyRetained,
      },
    };
  }

  // ─── Team with leader path ────────────────────────────────────────────────────
  // teamPlan is guaranteed non-null here (checked above for !isLeaderless).
  // Use cumulative YTD company dollar for leader band progression.
  const leaderYtd = await getAgentYtdCompanyDollar(profile.agentId, profile, input.transactionDate);
  const leaderBand = getActiveLeaderBand(teamPlan!.leaderStructureBands || [], leaderYtd) ||
                     getActiveLeaderBand(teamPlan!.leaderStructureBands || [], 0);

  if (!leaderBand) {
    throw new Error(`No active leader structure band found for ${team.teamId}`);
  }

  const leaderProfile = await getAgentProfile(team.leaderAgentId!);
  await getActiveMembership(team.teamId, team.leaderAgentId!, 'leader');

  const leaderStructurePercent = Number(leaderBand.leaderPercent || 0);
  const companyRetained = asMoney(commission * (Number(leaderBand.companyPercent || 0) / 100));
  const leaderStructureGross = asMoney(commission * (leaderStructurePercent / 100));

  if (profile.teamRole === 'leader') {
    return {
      calculationModel: 'teamLeader',
      agentType: profile.agentType,
      splitSnapshot: {
        primaryTeamId: team.teamId,
        teamPlanId: teamPlan!.teamPlanId,
        memberPlanId: profile.defaultPlanId || null,
        grossCommission,
        referralFeePercent: referralFeePercent ?? null,
        referralFeeDollar: referralFeeDollar ?? null,
        netAfterReferral: netAfterReferral ?? null,
        agentSplitPercent: null,
        companySplitPercent: null,
        agentNetCommission: leaderStructureGross,
        leaderStructurePercent,
        leaderStructureGross,
        memberPercentOfLeaderSide: null,
        memberPaid: null,
        leaderRetainedAfterMember: leaderStructureGross,
        companyRetained,
      },
      creditSnapshot: {
        leaderboardAgentId: profile.agentId,
        leaderboardAgentDisplayName: input.agentDisplayName,
        progressionMemberAgentId: null,
        progressionLeaderAgentId: leaderProfile.agentId,
        progressionTeamId: team.teamId,
        progressionCompanyDollarCredit: commission,
      },
    };
  }

  if (profile.teamRole !== 'member') {
    throw new Error(`Invalid team role for ${profile.agentId}`);
  }

  const membership = await getActiveMembership(team.teamId, profile.agentId, 'member');
  const memberPlanId = membership.memberPlanId || profile.defaultPlanId || null;

  let resolvedMemberPlanId: string | null = memberPlanId;
  let memberBand: MemberPlanBand | null = null;

  if (
    profile.teamMemberCompMode === 'custom' &&
    Array.isArray(profile.teamMemberOverrideBands) &&
    profile.teamMemberOverrideBands.length > 0
  ) {
    memberBand = getActiveMemberBand(profile.teamMemberOverrideBands || [], commission);

    if (!memberBand) {
      throw new Error(`No active custom team member tier found for ${profile.agentId}`);
    }

    resolvedMemberPlanId = null;
  } else if (memberPlanId) {
    const memberPlan = await getMemberPlan(memberPlanId);
    memberBand = getActiveMemberBand(memberPlan.payoutBands || [], commission);

    if (!memberBand) {
      throw new Error(`No active member payout band found for ${memberPlan.memberPlanId}`);
    }
  } else {
    memberBand = getActiveMemberBand(teamPlan!.memberDefaultBands || [], commission);

    if (!memberBand) {
      throw new Error(`No active member default band found for ${teamPlan!.teamPlanId}`);
    }

    resolvedMemberPlanId = null;
  }

  // CORRECT MODEL: memberPercent is the member's direct % of full GCI.
  // The leaderPercent is used ONLY to determine the broker/company cut.
  // Leader retains the spread between the leader side and the member payout.
  //
  // Example: GCI=$1,800, leader=75% (company=25%), member=70%
  //   companyRetained    = $1,800 × 25% = $450
  //   leaderStructureGross = $1,800 × 75% = $1,350
  //   memberPaid         = $1,800 × 70% = $1,260
  //   leaderRetains      = $1,350 - $1,260 = $90
  const memberPercentOfLeaderSide = Number(memberBand.memberPercent || 0);
  const memberPaid = asMoney(commission * (memberPercentOfLeaderSide / 100));
  const leaderRetainedAfterMember = asMoney(leaderStructureGross - memberPaid);

  return {
    calculationModel: 'teamMember',
    agentType: profile.agentType,
    splitSnapshot: {
      primaryTeamId: team.teamId,
      teamPlanId: teamPlan!.teamPlanId,
      memberPlanId: resolvedMemberPlanId,
      grossCommission,
      referralFeePercent: referralFeePercent ?? null,
      referralFeeDollar: referralFeeDollar ?? null,
      netAfterReferral: netAfterReferral ?? null,
      agentSplitPercent: null,
      companySplitPercent: null,
      agentNetCommission: memberPaid,
      leaderStructurePercent,
      leaderStructureGross,
      memberPercentOfLeaderSide,
      memberPaid,
      leaderRetainedAfterMember,
      companyRetained,
    },
    creditSnapshot: {
      leaderboardAgentId: profile.agentId,
      leaderboardAgentDisplayName: input.agentDisplayName,
      progressionMemberAgentId: profile.agentId,
      progressionLeaderAgentId: leaderProfile.agentId,
      progressionTeamId: team.teamId,
      progressionCompanyDollarCredit: commission,
    },
  };
}
