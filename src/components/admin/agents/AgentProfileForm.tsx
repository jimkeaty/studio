'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase';
import {
  getTeamDefaultTiers,
  getTeamDefaultTransactionFee,
  TEAM_GROUP_OPTIONS,
  TEAM_NAME_TO_GROUP,
  type CommissionTierTemplate,
} from '@/lib/commissions/teamTemplates';

export type AgentType = 'independent' | 'team';
export type ProgressionMetric = 'companyDollar';
export type TeamRole = 'leader' | 'member' | null;
export type PlanAssignmentType = 'individual' | 'teamMember' | 'teamLeader';
export type TeamMemberCompMode = 'teamDefault' | 'custom';

export type CommissionMode = 'team_default' | 'custom' | 'flat';

export type AgentTierFormValue = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  agentSplitPercent: number;
  companySplitPercent: number;
  notes: string;
};

export type TeamMemberTierFormValue = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
  notes: string;
};

export type AgentProfileFormValues = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  office: string;
  status: 'active' | 'grace_period' | 'inactive' | 'out';
  startDate: string;
  agentType: AgentType;
  progressionMetric: ProgressionMetric;
  primaryTeamId: string;
  teamRole: TeamRole;
  defaultPlanType: PlanAssignmentType;
  defaultPlanId: string;
  teamMemberCompMode: TeamMemberCompMode;
  teamMemberOverrideBands: TeamMemberTierFormValue[];
  referringAgentId: string;
  referringAgentDisplayNameSnapshot: string;
  teamGroup: string;
  commissionMode: CommissionMode;
  tiers: AgentTierFormValue[];
  /** Flat commission plan fields — only used when commissionMode === 'flat' */
  flatAgentPercent: number | string;
  flatCompanyPercent: number | string;
  defaultTransactionFee: number | string;
  gracePeriodEnabled: boolean;
  notes: string;
};

type AgentProfileFormProps = {
  agentId?: string;
  initialValues?: Partial<AgentProfileFormValues>;
  submitLabel?: string;
};

type TeamOption = {
  teamId: string;
  teamName: string;
  teamPlanId?: string;
  status?: string;
  /** 'with_leader' | 'no_leader' — defaults to 'with_leader' for legacy records */
  structureType?: string;
};

type TeamPlanLeaderBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  leaderPercent: number;
  companyPercent: number;
};

type TeamPlanMemberBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
};

type TeamPlanOption = {
  teamPlanId: string;
  teamId: string;
  planName: string;
  status?: string;
  /** 'tiered' | 'fixed' — defaults to 'tiered' for legacy records */
  commissionModelType?: string;
  /** Only present when commissionModelType === 'fixed' */
  fixedSplit?: { agentPercent: number; companyPercent: number } | null;
  leaderStructureBands?: TeamPlanLeaderBand[];
  memberDefaultBands?: TeamPlanMemberBand[];
};

type MemberPlanOption = {
  memberPlanId: string;
  teamId: string;
  agentId?: string;
  planName: string;
  status?: string;
};

/** Convert a CommissionTierTemplate to the form value shape */
function templateToFormTier(t: CommissionTierTemplate): AgentTierFormValue {
  return {
    tierName: t.tierName,
    fromCompanyDollar: t.fromCompanyDollar,
    toCompanyDollar: t.toCompanyDollar,
    agentSplitPercent: t.agentSplitPercent,
    companySplitPercent: t.companySplitPercent,
    notes: t.notes || '',
  };
}

function getDefaultTiersForTeamGroup(teamGroup: string): AgentTierFormValue[] {
  return getTeamDefaultTiers(teamGroup).map(templateToFormTier);
}

/** Convert a team plan's leaderStructureBands into agent tier form values */
function teamPlanBandsToFormTiers(bands: TeamPlanLeaderBand[]): AgentTierFormValue[] {
  return bands.map((band, i) => ({
    tierName: `Tier ${i + 1}`,
    fromCompanyDollar: band.fromCompanyDollar,
    toCompanyDollar: band.toCompanyDollar,
    agentSplitPercent: band.leaderPercent,
    companySplitPercent: band.companyPercent,
    notes: '',
  }));
}

/** Convert a team plan's memberDefaultBands into TeamMemberTierFormValue[] */
function teamPlanMemberBandsToFormTiers(bands: TeamPlanMemberBand[]): TeamMemberTierFormValue[] {
  return bands.map((band, i) => ({
    tierName: `Tier ${i + 1}`,
    fromCompanyDollar: band.fromCompanyDollar,
    toCompanyDollar: band.toCompanyDollar,
    memberPercent: band.memberPercent,
    notes: '',
  }));
}

const DEFAULT_VALUES: AgentProfileFormValues = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  office: '',
  status: 'active',
  startDate: '',
  agentType: 'independent',
  progressionMetric: 'companyDollar',
  primaryTeamId: '',
  teamRole: null,
  defaultPlanType: 'individual',
  defaultPlanId: '',
  teamMemberCompMode: 'teamDefault',
  teamMemberOverrideBands: [],
  referringAgentId: '',
  referringAgentDisplayNameSnapshot: '',
  teamGroup: 'independent',
  commissionMode: 'team_default',
  tiers: getDefaultTiersForTeamGroup('independent'),
  flatAgentPercent: 70,
  flatCompanyPercent: 30,
  defaultTransactionFee: 395,
  gracePeriodEnabled: false,
  notes: '',
};

function cloneTiers(tiers: AgentTierFormValue[]) {
  return tiers.map((tier) => ({
    ...tier,
    notes: tier.notes || '',
  }));
}

function cloneTeamMemberTiers(tiers: TeamMemberTierFormValue[]) {
  return tiers.map((tier) => ({
    ...tier,
    notes: tier.notes || '',
  }));
}

function getDefaultTiers(agentType: AgentType, teamGroup?: string): AgentTierFormValue[] {
  return getDefaultTiersForTeamGroup(teamGroup || 'independent');
}

function isIndependentAgentType(agentType: AgentType) {
  return agentType === 'independent';
}

function getDefaultTeamRole(agentType: AgentType): TeamRole {
  if (agentType === 'team') return 'member';
  return null;
}

function getDefaultPlanType(
  agentType: AgentType,
  teamRole: TeamRole
): PlanAssignmentType {
  if (agentType === 'team' && teamRole === 'leader') return 'teamLeader';
  if (agentType === 'team' && teamRole === 'member') return 'teamMember';
  return 'individual';
}

function formatAnniversary(startDate: string): string {
  if (!startDate) return '—';
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

function createEmptyTier(nextIndex: number): AgentTierFormValue {
  return {
    tierName: `Tier ${nextIndex}`,
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    agentSplitPercent: 0,
    companySplitPercent: 0,
    notes: '',
  };
}

function createEmptyTeamMemberTier(nextIndex: number): TeamMemberTierFormValue {
  return {
    tierName: `Tier ${nextIndex}`,
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    memberPercent: 0,
    notes: '',
  };
}

async function fetchTeamOptions(token: string) {
  const [teamsRes, teamPlansRes, memberPlansRes] = await Promise.all([
    fetch('/api/admin/teams', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch('/api/admin/team-plans', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch('/api/admin/member-plans', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const [teamsJson, teamPlansJson, memberPlansJson] = await Promise.all([
    teamsRes.json(),
    teamPlansRes.json(),
    memberPlansRes.json(),
  ]);

  return {
    // Return ALL teams (including inactive) so the dropdown always shows the agent's
    // currently assigned team even if it was later marked inactive.
    // The UI can visually flag inactive teams.
    teams: Array.isArray(teamsJson?.teams) ? teamsJson.teams : [],
    teamPlans: Array.isArray(teamPlansJson?.teamPlans)
      ? teamPlansJson.teamPlans.filter((plan: TeamPlanOption) => plan.status !== 'inactive')
      : [],
    memberPlans: Array.isArray(memberPlansJson?.memberPlans)
      ? memberPlansJson.memberPlans.filter((plan: MemberPlanOption) => plan.status !== 'inactive')
      : [],
  };
}

export default function AgentProfileForm({
  agentId,
  initialValues,
  submitLabel = 'Save Agent',
}: AgentProfileFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<AgentProfileFormValues>(() => {
    const teamGroup = initialValues?.teamGroup || 'independent';
    const commissionMode = initialValues?.commissionMode || 'team_default';
    return {
      ...DEFAULT_VALUES,
      ...initialValues,
      progressionMetric: 'companyDollar',
      teamGroup,
      commissionMode,
      tiers:
        initialValues?.tiers && initialValues.tiers.length > 0
          ? cloneTiers(initialValues.tiers)
          : getDefaultTiersForTeamGroup(teamGroup),
      flatAgentPercent: initialValues?.flatAgentPercent ?? 70,
      flatCompanyPercent: initialValues?.flatCompanyPercent ?? 30,
      defaultTransactionFee:
        initialValues?.defaultTransactionFee ?? getTeamDefaultTransactionFee(teamGroup),
      teamMemberOverrideBands:
        initialValues?.teamMemberOverrideBands &&
        initialValues.teamMemberOverrideBands.length > 0
          ? cloneTeamMemberTiers(initialValues.teamMemberOverrideBands)
          : [],
    };
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamPlans, setTeamPlans] = useState<TeamPlanOption[]>([]);
  const [memberPlans, setMemberPlans] = useState<MemberPlanOption[]>([]);
  const [isLoadingTeamOptions, setIsLoadingTeamOptions] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [createTeamError, setCreateTeamError] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamOffice, setNewTeamOffice] = useState('');
  const [newTeamNotes, setNewTeamNotes] = useState('');

  useEffect(() => {
    if (!initialValues) return;

    const teamGroup = initialValues.teamGroup || 'independent';
    const commissionMode = initialValues.commissionMode || 'team_default';
    setValues({
      ...DEFAULT_VALUES,
      ...initialValues,
      progressionMetric: 'companyDollar',
      teamGroup,
      commissionMode,
      tiers:
        initialValues.tiers && initialValues.tiers.length > 0
          ? cloneTiers(initialValues.tiers)
          : getDefaultTiersForTeamGroup(teamGroup),
      flatAgentPercent: initialValues.flatAgentPercent ?? 70,
      flatCompanyPercent: initialValues.flatCompanyPercent ?? 30,
      defaultTransactionFee:
        initialValues.defaultTransactionFee ?? getTeamDefaultTransactionFee(teamGroup),
    });
  }, [initialValues]);

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setTeams([]);
        setTeamPlans([]);
        setMemberPlans([]);
        setIsLoadingTeamOptions(false);
        return;
      }

      try {
        setIsLoadingTeamOptions(true);

        const token = await currentUser.getIdToken();

        const options = await fetchTeamOptions(token);

        if (!isMounted) return;

        setTeams(options.teams);
        setTeamPlans(options.teamPlans);
        setMemberPlans(options.memberPlans);
      } catch (err) {
        console.error('[AgentProfileForm] Failed to load team options', err);
      } finally {
        if (isMounted) {
          setIsLoadingTeamOptions(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const anniversaryDisplay = useMemo(() => {
    return formatAnniversary(values.startDate);
  }, [values.startDate]);

  const availableTeams = useMemo(() => {
    // Sort: active teams first, then inactive; alphabetical within each group
    return [...teams].sort((a, b) => {
      const aInactive = a.status === 'inactive' ? 1 : 0;
      const bInactive = b.status === 'inactive' ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [teams]);

  const selectedTeam = useMemo(() => {
    if (!values.primaryTeamId) return null;
    return teams.find((team) => team.teamId === values.primaryTeamId) || null;
  }, [teams, values.primaryTeamId]);

  /** The team plan linked to the currently selected team */
  const selectedTeamPlan = useMemo((): TeamPlanOption | null => {
    if (!selectedTeam) return null;
    // Prefer the plan ID stored on the team doc
    if (selectedTeam.teamPlanId) {
      const byId = teamPlans.find(
        (p) => p.teamPlanId.toLowerCase() === selectedTeam.teamPlanId!.toLowerCase()
      );
      if (byId) return byId;
    }
    // Fallback: any plan whose teamId matches
    return teamPlans.find((p) => p.teamId === selectedTeam.teamId) || null;
  }, [selectedTeam, teamPlans]);

  /** True when the selected team has structureType 'no_leader' */
  const teamIsLeaderless = (selectedTeam?.structureType || 'with_leader') === 'no_leader';

  /** True when the selected team plan uses a fixed (flat) commission model */
  const teamIsFixed = (selectedTeamPlan?.commissionModelType || 'tiered') === 'fixed';

  const availableLeaderPlans = useMemo(() => {
    if (!values.primaryTeamId) return [];

    if (selectedTeam?.teamPlanId) {
      const linkedPlan = teamPlans.find(
        (plan) => plan.teamPlanId === selectedTeam.teamPlanId
      );
      if (linkedPlan) {
        return [linkedPlan];
      }
    }

    return teamPlans
      .filter((plan) => plan.teamId === values.primaryTeamId)
      .sort((a, b) => a.planName.localeCompare(b.planName));
  }, [teamPlans, values.primaryTeamId, selectedTeam]);

  const availableMemberPlans = useMemo(() => {
    if (!values.primaryTeamId) return [];
    return memberPlans
      .filter((plan) => plan.teamId === values.primaryTeamId)
      .sort((a, b) => a.planName.localeCompare(b.planName));
  }, [memberPlans, values.primaryTeamId]);

  const requiresLeaderPlanSelection =
    values.agentType === 'team' && values.teamRole === 'leader';

  const teamSetupIsValid =
    values.agentType !== 'team' ||
    (
      Boolean(values.primaryTeamId) &&
      Boolean(values.teamRole) &&
      (
        !requiresLeaderPlanSelection ||
        Boolean(values.defaultPlanId)
      )
    );


  function updateField<K extends keyof AgentProfileFormValues>(
    field: K,
    value: AgentProfileFormValues[K]
  ) {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateAgentType(nextType: AgentType) {
    setValues((prev) => {
      const nextTeamRole = getDefaultTeamRole(nextType);

      return {
        ...prev,
        agentType: nextType,
        progressionMetric: 'companyDollar',
        teamRole: nextTeamRole,
        defaultPlanType: getDefaultPlanType(nextType, nextTeamRole),
        defaultPlanId: nextType === 'independent' ? '' : prev.defaultPlanId,
        primaryTeamId: nextType === 'independent' ? '' : prev.primaryTeamId,
        tiers: prev.commissionMode === 'team_default'
          ? getDefaultTiersForTeamGroup(prev.teamGroup)
          : prev.tiers,
      };
    });
  }

  /** When team group changes and commission mode is team_default, auto-populate tiers */
  function updateTeamGroup(nextGroup: string) {
    setValues((prev) => {
      const isDefault = prev.commissionMode === 'team_default';
      const tiers = isDefault
        ? resolveTeamDefaultTiers(prev.primaryTeamId || '', nextGroup)
        : prev.tiers;
      return {
        ...prev,
        teamGroup: nextGroup,
        tiers,
        defaultTransactionFee: isDefault
          ? getTeamDefaultTransactionFee(nextGroup)
          : prev.defaultTransactionFee,
      };
    });
  }

  /** Toggle commission mode between team_default and custom */
  function updateCommissionMode(nextMode: CommissionMode) {
    setValues((prev) => {
      if (nextMode === 'team_default') {
        const tiers = resolveTeamDefaultTiers(prev.primaryTeamId || '', prev.teamGroup);
        return {
          ...prev,
          commissionMode: 'team_default',
          tiers,
          defaultTransactionFee: getTeamDefaultTransactionFee(prev.teamGroup),
        };
      }
      return {
        ...prev,
        commissionMode: 'custom',
      };
    });
  }

  /** When any tier field is edited, auto-switch to custom mode */
  function handleTierEdit(
    index: number,
    field: keyof AgentTierFormValue,
    value: string | number | null
  ) {
    setValues((prev) => {
      const nextTiers = [...prev.tiers];
      nextTiers[index] = {
        ...nextTiers[index],
        [field]: value,
      } as AgentTierFormValue;

      return {
        ...prev,
        commissionMode: 'custom' as CommissionMode,
        tiers: nextTiers,
      };
    });
  }

  function updateTeamRole(nextRole: TeamRole) {
    setValues((prev) => ({
      ...prev,
      teamRole: nextRole,
      defaultPlanType: getDefaultPlanType(prev.agentType, nextRole),
      defaultPlanId: '',
    }));
  }

  /**
   * Resolve the best default tiers for a given team.
   * Priority: team plan's leaderStructureBands → hardcoded team group template.
   * Can be called with just a teamGroupSlug (teamId = '') to resolve by group.
   */
  function resolveTeamDefaultTiers(teamId: string, teamGroupSlug: string): AgentTierFormValue[] {
    const teamIdLower = teamId.toLowerCase();

    // --- Path A: specific team selected → look up its plan ---
    if (teamId) {
      const team = teams.find((t) => t.teamId.toLowerCase() === teamIdLower);
      if (team?.teamPlanId) {
        const planIdLower = team.teamPlanId.toLowerCase();
        // Exact match by teamPlanId
        const plan = teamPlans.find((p) => p.teamPlanId.toLowerCase() === planIdLower);
        if (plan?.leaderStructureBands && plan.leaderStructureBands.length > 0) {
          return teamPlanBandsToFormTiers(plan.leaderStructureBands);
        }
        // Prefix match: teamPlanId stored on team might be a prefix of the actual plan doc ID
        const planByPrefix = teamPlans.find(
          (p) => p.teamPlanId.toLowerCase().startsWith(planIdLower) && p.teamId.toLowerCase() === teamIdLower
        );
        if (planByPrefix?.leaderStructureBands && planByPrefix.leaderStructureBands.length > 0) {
          return teamPlanBandsToFormTiers(planByPrefix.leaderStructureBands);
        }
      }
      // Direct match by teamId on plan
      const planByTeamId = teamPlans.find((p) => p.teamId.toLowerCase() === teamIdLower);
      if (planByTeamId?.leaderStructureBands && planByTeamId.leaderStructureBands.length > 0) {
        return teamPlanBandsToFormTiers(planByTeamId.leaderStructureBands);
      }
    }

    // --- Path B: no specific team → find any team plan whose team maps to this group ---
    if (teamGroupSlug) {
      // Build a set of teamIds that belong to this group
      const groupTeamIds = new Set<string>();
      for (const [tid, grp] of Object.entries(TEAM_NAME_TO_GROUP)) {
        if (grp === teamGroupSlug) groupTeamIds.add(tid.toLowerCase());
      }
      // Also check teams list for any team whose teamGroup matches
      for (const t of teams) {
        if ((t as any).teamGroup === teamGroupSlug) groupTeamIds.add(t.teamId.toLowerCase());
      }
      // Search team plans for any plan whose teamId belongs to this group
      for (const plan of teamPlans) {
        if (plan.status === 'inactive') continue;
        const planTeamIdLower = plan.teamId.toLowerCase();
        // Direct membership check
        if (groupTeamIds.has(planTeamIdLower)) {
          if (plan.leaderStructureBands && plan.leaderStructureBands.length > 0) {
            return teamPlanBandsToFormTiers(plan.leaderStructureBands);
          }
        }
        // Also check if the plan name matches the group name
        const planNameSlug = plan.planName?.toLowerCase().replace(/[\s-]+/g, '_') || '';
        if (planNameSlug === teamGroupSlug || planNameSlug.includes(teamGroupSlug.replace(/_/g, ' ').toLowerCase())) {
          if (plan.leaderStructureBands && plan.leaderStructureBands.length > 0) {
            return teamPlanBandsToFormTiers(plan.leaderStructureBands);
          }
        }
      }
    }

    // --- Path C: fall back to hardcoded team group template ---
    return getDefaultTiersForTeamGroup(teamGroupSlug);
  }

  /**
   * Resolve the best member default bands for a given team.
   * Uses the same lookup pattern as resolveTeamDefaultTiers but for memberDefaultBands.
   * Returns TeamMemberTierFormValue[] or empty array if none found.
   */
  function resolveTeamMemberDefaultBands(teamId: string, teamGroupSlug: string): TeamMemberTierFormValue[] {
    const teamIdLower = teamId.toLowerCase();

    // Helper to find plan and extract memberDefaultBands
    function extractMemberBands(plan: TeamPlanOption | undefined): TeamMemberTierFormValue[] | null {
      if (plan?.memberDefaultBands && plan.memberDefaultBands.length > 0) {
        return teamPlanMemberBandsToFormTiers(plan.memberDefaultBands);
      }
      return null;
    }

    // --- Path A: specific team selected → look up its plan ---
    if (teamId) {
      const team = teams.find((t) => t.teamId.toLowerCase() === teamIdLower);
      if (team?.teamPlanId) {
        const planIdLower = team.teamPlanId.toLowerCase();
        const plan = teamPlans.find((p) => p.teamPlanId.toLowerCase() === planIdLower);
        const bands = extractMemberBands(plan);
        if (bands) return bands;
        // Prefix match
        const planByPrefix = teamPlans.find(
          (p) => p.teamPlanId.toLowerCase().startsWith(planIdLower) && p.teamId.toLowerCase() === teamIdLower
        );
        const bands2 = extractMemberBands(planByPrefix);
        if (bands2) return bands2;
      }
      // Direct match by teamId
      const planByTeamId = teamPlans.find((p) => p.teamId.toLowerCase() === teamIdLower);
      const bands3 = extractMemberBands(planByTeamId);
      if (bands3) return bands3;
    }

    // --- Path B: no specific team → find any team plan whose team maps to this group ---
    if (teamGroupSlug) {
      const groupTeamIds = new Set<string>();
      for (const [tid, grp] of Object.entries(TEAM_NAME_TO_GROUP)) {
        if (grp === teamGroupSlug) groupTeamIds.add(tid.toLowerCase());
      }
      for (const t of teams) {
        if ((t as any).teamGroup === teamGroupSlug) groupTeamIds.add(t.teamId.toLowerCase());
      }
      for (const plan of teamPlans) {
        if (plan.status === 'inactive') continue;
        const planTeamIdLower = plan.teamId.toLowerCase();
        if (groupTeamIds.has(planTeamIdLower)) {
          const bands = extractMemberBands(plan);
          if (bands) return bands;
        }
        const planNameSlug = plan.planName?.toLowerCase().replace(/[\s-]+/g, '_') || '';
        if (planNameSlug === teamGroupSlug || planNameSlug.includes(teamGroupSlug.replace(/_/g, ' ').toLowerCase())) {
          const bands = extractMemberBands(plan);
          if (bands) return bands;
        }
      }
    }

    return [];
  }

  /** Resolved member default bands for the current team selection (read-only preview) */
  const resolvedMemberDefaults = useMemo(
    () => resolveTeamMemberDefaultBands(values.primaryTeamId || '', values.teamGroup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.primaryTeamId, values.teamGroup, teams, teamPlans]
  );

  /** Resolved leader structure bands for the current team selection (read-only preview) */
  function resolveTeamLeaderBands(teamId: string, teamGroupSlug: string): TeamPlanLeaderBand[] {
    const teamIdLower = teamId.toLowerCase();
    function extractLeaderBands(plan: TeamPlanOption | undefined): TeamPlanLeaderBand[] | null {
      if (plan?.leaderStructureBands && plan.leaderStructureBands.length > 0) {
        return plan.leaderStructureBands;
      }
      return null;
    }
    if (teamId) {
      const team = teams.find((t) => t.teamId.toLowerCase() === teamIdLower);
      // Leaderless teams never show the leader compensation block
      if (team?.structureType === 'no_leader') return [];
      if (team?.teamPlanId) {
        const planIdLower = team.teamPlanId.toLowerCase();
        const plan = teamPlans.find((p) => p.teamPlanId.toLowerCase() === planIdLower);
        const bands = extractLeaderBands(plan);
        if (bands) return bands;
        const planByPrefix = teamPlans.find(
          (p) => p.teamPlanId.toLowerCase().startsWith(planIdLower) && p.teamId.toLowerCase() === teamIdLower
        );
        const bands2 = extractLeaderBands(planByPrefix);
        if (bands2) return bands2;
      }
      const planByTeamId = teamPlans.find((p) => p.teamId.toLowerCase() === teamIdLower);
      const bands3 = extractLeaderBands(planByTeamId);
      if (bands3) return bands3;
    }
    if (teamGroupSlug) {
      const groupTeamIds = new Set<string>();
      for (const [tid, grp] of Object.entries(TEAM_NAME_TO_GROUP)) {
        if (grp === teamGroupSlug) groupTeamIds.add(tid.toLowerCase());
      }
      for (const t of teams) {
        if ((t as any).teamGroup === teamGroupSlug) groupTeamIds.add(t.teamId.toLowerCase());
      }
      for (const plan of teamPlans) {
        if (plan.status === 'inactive') continue;
        if (groupTeamIds.has(plan.teamId.toLowerCase())) {
          const bands = extractLeaderBands(plan);
          if (bands) return bands;
        }
      }
    }
    return [];
  }

  const resolvedLeaderBands = useMemo(
    () => resolveTeamLeaderBands(values.primaryTeamId || '', values.teamGroup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.primaryTeamId, values.teamGroup, teams, teamPlans]
  );

  function updatePrimaryTeamId(nextTeamId: string) {
    setValues((prev) => {
      // Auto-detect team group from the selected team's teamId
      const mappedGroup = TEAM_NAME_TO_GROUP[nextTeamId] || prev.teamGroup;

      // Resolve the team plan for the newly selected team
      const selectedTeamObj = teams.find((t) => t.teamId === nextTeamId);
      const resolvedPlan = selectedTeamObj?.teamPlanId
        ? teamPlans.find((p) => p.teamPlanId === selectedTeamObj.teamPlanId) ||
          teamPlans.find((p) => p.teamId === nextTeamId)
        : teamPlans.find((p) => p.teamId === nextTeamId);

      const planIsFixed = (resolvedPlan?.commissionModelType || 'tiered') === 'fixed';

      if (planIsFixed) {
        // Auto-populate flat split from the team plan's fixedSplit
        const agentPct = resolvedPlan?.fixedSplit?.agentPercent ?? 70;
        const companyPct = resolvedPlan?.fixedSplit?.companyPercent ?? 30;
        return {
          ...prev,
          primaryTeamId: nextTeamId,
          defaultPlanId: '',
          teamGroup: mappedGroup,
          commissionMode: 'flat' as CommissionMode,
          flatAgentPercent: agentPct,
          flatCompanyPercent: companyPct,
          tiers: prev.tiers,
          defaultTransactionFee: getTeamDefaultTransactionFee(mappedGroup),
        };
      }

      // Tiered team — always populate teamMemberOverrideBands from the team plan as the starting template
      const memberBands = resolvedPlan?.memberDefaultBands && resolvedPlan.memberDefaultBands.length > 0
        ? teamPlanMemberBandsToFormTiers(resolvedPlan.memberDefaultBands)
        : prev.teamMemberOverrideBands.length > 0
          ? prev.teamMemberOverrideBands
          : [createEmptyTeamMemberTier(1)];
      return {
        ...prev,
        primaryTeamId: nextTeamId,
        defaultPlanId: '',
        teamGroup: mappedGroup,
        commissionMode: 'team_default' as CommissionMode,
        tiers: resolveTeamDefaultTiers(nextTeamId, mappedGroup),
        teamMemberCompMode: 'custom' as TeamMemberCompMode,
        teamMemberOverrideBands: memberBands,
        defaultTransactionFee: getTeamDefaultTransactionFee(mappedGroup),
      };
    });
  }

  async function handleCreateTeam() {
    setCreateTeamError('');

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('You must be signed in to create a team.');
      }

      if (!newTeamName.trim()) {
        throw new Error('Team name is required.');
      }

      setIsCreatingTeam(true);

      const token = await currentUser.getIdToken();

      const response = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamName: newTeamName.trim(),
          leaderAgentId: agentId || 'unassigned-leader',
          teamPlanId: 'pending-team-plan',
          status: 'active',
          office: newTeamOffice.trim() || null,
          notes: newTeamNotes.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to create team.');
      }

      const options = await fetchTeamOptions(token);

      setTeams(options.teams);
      setTeamPlans(options.teamPlans);
      setMemberPlans(options.memberPlans);

      updatePrimaryTeamId(result.team.teamId);
      setShowCreateTeam(false);
      setNewTeamName('');
      setNewTeamOffice('');
      setNewTeamNotes('');
    } catch (err) {
      setCreateTeamError((err as Error)?.message || 'Failed to create team.');
    } finally {
      setIsCreatingTeam(false);
    }
  }

  function updateTeamMemberTier(
    index: number,
    field: keyof TeamMemberTierFormValue,
    value: string | number | null
  ) {
    setValues((current) => {
      const next = cloneTeamMemberTiers(current.teamMemberOverrideBands);
      next[index] = {
        ...next[index],
        [field]: value as never,
      };
      return {
        ...current,
        teamMemberOverrideBands: next,
      };
    });
  }

  function addTeamMemberTier() {
    setValues((current) => ({
      ...current,
      teamMemberOverrideBands: [
        ...current.teamMemberOverrideBands,
        createEmptyTeamMemberTier(current.teamMemberOverrideBands.length + 1),
      ],
    }));
  }

  function removeTeamMemberTier(index: number) {
    setValues((current) => ({
      ...current,
      teamMemberOverrideBands: current.teamMemberOverrideBands.filter((_, i) => i !== index),
    }));
  }

  function updateTier(
    index: number,
    field: keyof AgentTierFormValue,
    value: string | number | null
  ) {
    setValues((prev) => {
      const nextTiers = [...prev.tiers];
      nextTiers[index] = {
        ...nextTiers[index],
        [field]: value,
      } as AgentTierFormValue;

      return {
        ...prev,
        tiers: nextTiers,
      };
    });
  }

  function addTier() {
    setValues((prev) => ({
      ...prev,
      tiers: [...prev.tiers, createEmptyTier(prev.tiers.length + 1)],
    }));
  }

  function removeTier(index: number) {
    setValues((prev) => {
      if (prev.tiers.length <= 1) return prev;
      return {
        ...prev,
        tiers: prev.tiers.filter((_, i) => i !== index),
      };
    });
  }

  function resetToDefaults() {
    setValues((prev) => {
      const tiers = prev.primaryTeamId
        ? resolveTeamDefaultTiers(prev.primaryTeamId, prev.teamGroup)
        : getDefaultTiersForTeamGroup(prev.teamGroup);
      return {
        ...prev,
        progressionMetric: 'companyDollar',
        teamRole: getDefaultTeamRole(prev.agentType),
        defaultPlanType: getDefaultPlanType(prev.agentType, prev.teamRole),
        commissionMode: 'team_default' as CommissionMode,
        tiers,
        defaultTransactionFee: getTeamDefaultTransactionFee(prev.teamGroup),
      };
    });
  }

  const [similarAgents, setSimilarAgents] = useState<{ agentId: string; displayName: string; similarity: number }[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setSimilarAgents([]);
    setShowDuplicateWarning(false);
    setIsSaving(true);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('You must be signed in to save agent profiles.');
      }

      const token = await currentUser.getIdToken();

      const payload: Record<string, any> = {
        firstName: values.firstName,
        lastName: values.lastName,
        displayName: values.displayName,
        email: values.email || null,
        office: values.office || null,
        status: values.status,
        startDate: values.startDate,
        agentType: values.agentType,
        progressionMetric: 'companyDollar',
        primaryTeamId: values.agentType === 'team' ? values.primaryTeamId || null : null,
        teamRole: values.agentType === 'team' ? values.teamRole : null,
        defaultPlanType: values.defaultPlanType,
        defaultPlanId:
          values.agentType === 'team' && values.teamRole === 'leader'
            ? values.defaultPlanId || null
            : null,
        teamMemberCompMode: 'custom',
        teamMemberOverrideBands:
          values.agentType === 'team' && values.teamRole === 'member'
            ? values.teamMemberOverrideBands.map((tier) => ({
                tierName: tier.tierName,
                fromCompanyDollar: Number(tier.fromCompanyDollar || 0),
                toCompanyDollar:
                  tier.toCompanyDollar === null || String(tier.toCompanyDollar) === ''
                    ? null
                    : Number(tier.toCompanyDollar),
                memberPercent: Number(tier.memberPercent || 0),
                notes: tier.notes || null,
              }))
            : [],
        referringAgentId: values.referringAgentId || null,
        referringAgentDisplayNameSnapshot:
          values.referringAgentDisplayNameSnapshot || null,
        teamGroup: values.teamGroup || null,
        commissionMode: values.commissionMode || 'team_default',
        flatAgentPercent:
          values.commissionMode === 'flat'
            ? (values.flatAgentPercent === '' || values.flatAgentPercent == null ? null : Number(values.flatAgentPercent))
            : null,
        flatCompanyPercent:
          values.commissionMode === 'flat'
            ? (values.flatCompanyPercent === '' || values.flatCompanyPercent == null ? null : Number(values.flatCompanyPercent))
            : null,
        tiers: values.tiers.map((tier) => ({
          tierName: tier.tierName,
          fromCompanyDollar: Number(tier.fromCompanyDollar || 0),
          toCompanyDollar:
            tier.toCompanyDollar === null || String(tier.toCompanyDollar) === ''
              ? null
              : Number(tier.toCompanyDollar),
          agentSplitPercent: Number(tier.agentSplitPercent || 0),
          companySplitPercent: Number(tier.companySplitPercent || 0),
          transactionFee: null,
          capAmount: null,
          notes: tier.notes || null,
        })),
        defaultTransactionFee:
          values.defaultTransactionFee === '' || values.defaultTransactionFee == null
            ? null
            : Number(values.defaultTransactionFee),
        gracePeriodEnabled: values.gracePeriodEnabled ?? false,
        notes: values.notes || null,
      };

      const isEditMode = Boolean(agentId);
      const endpoint = isEditMode
        ? `/api/admin/agent-profiles/${agentId}`
        : '/api/admin/agent-profiles';

      const method = isEditMode ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(forceCreate ? { ...payload, forceCreate: true } : payload),
      });

      const result = await response.json();

      // Handle fuzzy match duplicate warning
      if (result?.requiresConfirmation && result?.similarAgents) {
        setSimilarAgents(result.similarAgents);
        setShowDuplicateWarning(true);
        setIsSaving(false);
        return;
      }

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to save agent profile.');
      }

      setForceCreate(false);

      const savedAgentId = result?.agent?.agentId || agentId;

      if (!isEditMode && savedAgentId) {
        router.push(`/dashboard/admin/agents/${savedAgentId}`);
        router.refresh();
        return;
      }

      setSuccessMessage('Agent profile saved successfully.');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong while saving.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleForceCreate() {
    setForceCreate(true);
    setShowDuplicateWarning(false);
    setSimilarAgents([]);
    // Re-submit with forceCreate flag
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  }

  return (
    <form className="space-y-6" onSubmit={(e) => {
      // If forceCreate was just set, pass it through
      handleSubmit(e);
    }}>
      {/* ── Duplicate Agent Warning ─────────────────────────────────────── */}
      {showDuplicateWarning && similarAgents.length > 0 && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-5 shadow-md">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.194-.833-2.964 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-base font-bold text-amber-800">
                Possible Duplicate Agent Detected
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                The name &quot;{values.displayName}&quot; is similar to existing agent(s).
                Did you mean one of these?
              </p>
              <div className="mt-3 space-y-2">
                {similarAgents.map((match) => (
                  <div
                    key={match.agentId}
                    className="flex items-center justify-between rounded-md border border-amber-300 bg-white px-4 py-2.5"
                  >
                    <div>
                      <span className="font-semibold text-gray-900">{match.displayName}</span>
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {match.similarity}% match
                      </span>
                    </div>
                    <a
                      href={`/dashboard/admin/agents/${match.agentId}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Edit Existing
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleForceCreate}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Create Anyway (Not a Duplicate)
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDuplicateWarning(false); setSimilarAgents([]); }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Basic Info</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">First Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              placeholder="Enter first name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Last Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              placeholder="Enter last name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Display Name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              placeholder="Enter display name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="Enter email"
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Office</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.office}
              onChange={(e) => updateField('office', e.target.value)}
              placeholder="Enter office"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.status}
              onChange={(e) =>
                updateField(
                  'status',
                  e.target.value as AgentProfileFormValues['status']
                )
              }
            >
              <option value="active">Active</option>
              <option value="grace_period">Grace Period</option>
              <option value="inactive">Inactive</option>
              <option value="out">Out</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Team Group</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.teamGroup}
              onChange={(e) => updateTeamGroup(e.target.value)}
            >
              {TEAM_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Used for commission defaults and reporting. Independent of Agent Type.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Anniversary / Employment</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Start Date</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              type="date"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Anniversary</label>
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
              {anniversaryDisplay}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
          <input
            type="checkbox"
            id="gracePeriodEnabled"
            checked={values.gracePeriodEnabled}
            onChange={(e) => updateField('gracePeriodEnabled', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <label htmlFor="gracePeriodEnabled" className="block text-sm font-medium text-amber-900 cursor-pointer">
              Enable 90-Day Grace Period
            </label>
            <p className="text-xs text-amber-700 mt-0.5">
              New agents receive an automatic &quot;A&quot; grade on income, deals, and volume metrics
              for their first 90 days. This gives them time to ramp up before performance grades
              affect their dashboard. Uncheck this once the agent is established.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Commission Setup</h2>

        {/* Default Transaction Fee */}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Default Transaction Fee ($)</label>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2"
              value={values.defaultTransactionFee}
              onChange={(e) => {
                updateField('defaultTransactionFee', e.target.value === '' ? '' : Number(e.target.value));
              }}
              placeholder="e.g. 395"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Agent Type</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={values.agentType}
              onChange={(e) => updateAgentType(e.target.value as AgentType)}
            >
              <option value="independent">Independent</option>
              <option value="team">Team</option>
            </select>
          </div>
          {isIndependentAgentType(values.agentType) && (
            <div>
              <label className="mb-1 block text-sm font-medium">Commission Mode</label>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={values.commissionMode}
                onChange={(e) => updateField('commissionMode', e.target.value as CommissionMode)}
              >
                <option value="team_default">Tiered (Standard)</option>
                <option value="flat">Flat Commission Plan</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {values.commissionMode === 'flat'
                  ? 'Fixed split on every transaction — no tier progression.'
                  : 'Split advances through GCI thresholds over the commission cycle.'}
              </p>
            </div>
          )}
        </div>

        {!isIndependentAgentType(values.agentType) && (
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-4">
            <h3 className="text-sm font-semibold text-blue-900">
              Team Compensation Setup
            </h3>
            <p className="mt-1 text-sm text-blue-800">
              Team agents use the assigned team, role, and plan structure. Inline
              individual tiers do not apply here.
            </p>

            {/* Commission model badge */}
            {values.primaryTeamId && (
              <div className="mt-3 flex items-center gap-2">
                {teamIsFixed ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Fixed Commission
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    Tiered Commission
                  </span>
                )}
                {teamIsLeaderless && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    No Leader
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium">Team</label>
                  <button
                    type="button"
                    className="text-sm font-medium text-blue-600 hover:underline"
                    onClick={() => {
                      setCreateTeamError('');
                      setShowCreateTeam((prev) => !prev);
                    }}
                  >
                    {showCreateTeam ? 'Cancel' : '+ Create Team'}
                  </button>
                </div>

                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={values.primaryTeamId}
                  onChange={(e) => updatePrimaryTeamId(e.target.value)}
                  disabled={isLoadingTeamOptions}
                >
                  <option value="">
                    {isLoadingTeamOptions ? 'Loading teams...' : 'Select a team'}
                  </option>
                  {availableTeams.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.teamName}{team.status === 'inactive' ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {!teamIsLeaderless && (
              <div>
                <label className="mb-1 block text-sm font-medium">Team Role</label>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={values.teamRole || 'member'}
                  onChange={(e) => updateTeamRole(e.target.value as TeamRole)}
                >
                  <option value="leader">Leader</option>
                  <option value="member">Member</option>
                </select>
              </div>
              )}

              {showCreateTeam && (
                <div className="md:col-span-2 rounded-md border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-semibold">Create Team</h4>

                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Team Name</label>
                      <input
                        className="w-full rounded-md border px-3 py-2"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Enter team name"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Office</label>
                      <input
                        className="w-full rounded-md border px-3 py-2"
                        value={newTeamOffice}
                        onChange={(e) => setNewTeamOffice(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium">Notes</label>
                      <textarea
                        className="min-h-24 w-full rounded-md border px-3 py-2"
                        value={newTeamNotes}
                        onChange={(e) => setNewTeamNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  {createTeamError && (
                    <p className="mt-3 text-sm text-red-700">{createTeamError}</p>
                  )}

                  <div className="mt-4 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-md border px-4 py-2 text-sm font-medium"
                      onClick={() => setShowCreateTeam(false)}
                      disabled={isCreatingTeam}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      onClick={handleCreateTeam}
                      disabled={isCreatingTeam || !newTeamName.trim()}
                    >
                      {isCreatingTeam ? 'Creating...' : 'Create Team'}
                    </button>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                {/* ── Fixed Commission Model ─────────────────────────────────── */}
                {teamIsFixed ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                    <h4 className="text-sm font-semibold text-amber-900">Fixed Commission Plan</h4>
                    <p className="mt-1 text-sm text-amber-800">
                      This team uses a flat split on every transaction — no tier progression.
                      The team default is shown below. You may override the split for this agent.
                    </p>
                    {selectedTeamPlan?.fixedSplit && (
                      <p className="mt-2 text-xs text-amber-700">
                        Team default: {selectedTeamPlan.fixedSplit.agentPercent}% Agent / {selectedTeamPlan.fixedSplit.companyPercent}% Company
                      </p>
                    )}
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-amber-900">Agent Split % (this agent)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                          value={values.flatAgentPercent}
                          onChange={(e) => {
                            const v = e.target.value === '' ? '' : Number(e.target.value);
                            const company = typeof v === 'number' ? Math.max(0, 100 - v) : '';
                            setValues((prev) => ({
                              ...prev,
                              commissionMode: 'flat' as CommissionMode,
                              flatAgentPercent: v,
                              flatCompanyPercent: company,
                            }));
                          }}
                          placeholder="e.g. 75"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-amber-900">Company Split % (this agent)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                          value={values.flatCompanyPercent}
                          onChange={(e) => {
                            const v = e.target.value === '' ? '' : Number(e.target.value);
                            const agent = typeof v === 'number' ? Math.max(0, 100 - v) : '';
                            setValues((prev) => ({
                              ...prev,
                              commissionMode: 'flat' as CommissionMode,
                              flatCompanyPercent: v,
                              flatAgentPercent: agent,
                            }));
                          }}
                          placeholder="e.g. 25"
                        />
                      </div>
                    </div>
                    {selectedTeamPlan?.fixedSplit && (
                      <button
                        type="button"
                        className="mt-3 text-xs text-amber-700 underline hover:text-amber-900"
                        onClick={() => {
                          setValues((prev) => ({
                            ...prev,
                            commissionMode: 'flat' as CommissionMode,
                            flatAgentPercent: selectedTeamPlan!.fixedSplit!.agentPercent,
                            flatCompanyPercent: selectedTeamPlan!.fixedSplit!.companyPercent,
                          }));
                        }}
                      >
                        Reset to team default ({selectedTeamPlan.fixedSplit.agentPercent}% / {selectedTeamPlan.fixedSplit.companyPercent}%)
                      </button>
                    )}
                  </div>
                ) : !teamIsLeaderless && values.teamRole === 'leader' ? (
                  /* ── Leader Plan selector (with_leader teams only) ─────────── */
                  <>
                    <label className="mb-1 block text-sm font-medium">Leader Plan</label>
                    <select
                      className="w-full rounded-md border px-3 py-2"
                      value={values.defaultPlanId}
                      onChange={(e) => updateField('defaultPlanId', e.target.value)}
                      disabled={
                        !values.primaryTeamId ||
                        isLoadingTeamOptions ||
                        availableLeaderPlans.length === 0
                      }
                    >
                      <option value="">
                        {!values.primaryTeamId
                          ? 'Select a team first'
                          : availableLeaderPlans.length === 0
                            ? 'No leader plans found'
                            : 'Select a leader plan'}
                      </option>
                      {availableLeaderPlans.map((plan) => (
                        <option key={plan.teamPlanId} value={plan.teamPlanId}>
                          {plan.planName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="rounded-md border border-gray-200 bg-white p-4">
                    {/* ── Team Default Plan Banner ─────────────────────────────── */}
                    {resolvedMemberDefaults.length > 0 && (
                      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-blue-900">
                              Team Default Plan: {selectedTeamPlan?.planName || 'Team Plan'}
                            </p>
                            <p className="mt-0.5 text-xs text-blue-700">
                              {resolvedMemberDefaults.length} tier{resolvedMemberDefaults.length !== 1 ? 's' : ''} available.
                              Load them below to use as a starting point, or keep the current custom tiers.
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {resolvedMemberDefaults.map((t, i) => (
                                <span key={i} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                                  {t.tierName}: {t.memberPercent}%
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            onClick={() => {
                              setValues((prev) => ({
                                ...prev,
                                teamMemberCompMode: 'custom' as TeamMemberCompMode,
                                teamMemberOverrideBands: resolvedMemberDefaults.map((t, i) => ({
                                  tierName: t.tierName,
                                  fromCompanyDollar: t.fromCompanyDollar,
                                  toCompanyDollar: t.toCompanyDollar,
                                  memberPercent: t.memberPercent,
                                  notes: '',
                                })),
                              }));
                            }}
                          >
                            Load Team Default
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-semibold">Member Commission Tiers</h4>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                          onClick={addTeamMemberTier}
                        >
                          + Add Tier
                        </button>
                      </div>
                    </div>
                    <p className="mb-4 text-xs text-gray-500">
                      Edit tiers for this agent. Use &quot;Load Team Default&quot; above to start from the team plan, or manually enter custom tiers. Changes apply to this agent only.
                    </p>

                    {values.teamMemberOverrideBands.map((tier, index) => (
                      <div key={index} className="grid gap-4 rounded-lg border p-4 md:grid-cols-6 mb-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Tier Name</label>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={tier.tierName}
                            onChange={(e) => updateTeamMemberTier(index, 'tierName', e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">From GCI $</label>
                          <input
                            type="number"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={tier.fromCompanyDollar}
                            onChange={(e) =>
                              updateTeamMemberTier(index, 'fromCompanyDollar', Number(e.target.value || 0))
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">To GCI $</label>
                          <input
                            type="number"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={tier.toCompanyDollar ?? ''}
                            onChange={(e) =>
                              updateTeamMemberTier(
                                index,
                                'toCompanyDollar',
                                e.target.value === '' ? null : Number(e.target.value)
                              )
                            }
                            placeholder="No cap"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Member %</label>
                          <input
                            type="number"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={tier.memberPercent}
                            onChange={(e) =>
                              updateTeamMemberTier(index, 'memberPercent', Number(e.target.value || 0))
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={tier.notes}
                            onChange={(e) => updateTeamMemberTier(index, 'notes', e.target.value)}
                          />
                        </div>

                        <div className="md:col-span-6 flex justify-end">
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                            onClick={() => removeTeamMemberTier(index)}
                            disabled={values.teamMemberOverrideBands.length === 1}
                          >
                            Remove Tier
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team Leader Compensation Structure — read-only, shown only when team has a leader plan */}
        {!isIndependentAgentType(values.agentType) && resolvedLeaderBands.length > 0 && (
          <div className="mt-6 rounded-md border border-purple-100 bg-purple-50 p-4">
            <h3 className="mb-1 text-sm font-semibold text-purple-900">Team Leader Compensation Structure</h3>
            <p className="mb-3 text-xs text-purple-700">
              Read-only. This is the leader&apos;s payout structure — your production contributes to the leader&apos;s tier progression.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-purple-100">
                  <tr>
                    <th className="border border-purple-200 px-3 py-2 text-left text-purple-900">Tier Name</th>
                    <th className="border border-purple-200 px-3 py-2 text-left text-purple-900">From GCI $</th>
                    <th className="border border-purple-200 px-3 py-2 text-left text-purple-900">To GCI $</th>
                    <th className="border border-purple-200 px-3 py-2 text-left text-purple-900">Leader %</th>
                    <th className="border border-purple-200 px-3 py-2 text-left text-purple-900">Company %</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedLeaderBands.map((band, i) => (
                    <tr key={i} className="bg-white">
                      <td className="border border-purple-200 px-3 py-2 text-gray-700">Tier {i + 1}</td>
                      <td className="border border-purple-200 px-3 py-2 text-gray-700">${(band.fromCompanyDollar ?? 0).toLocaleString()}</td>
                      <td className="border border-purple-200 px-3 py-2 text-gray-700">
                        {band.toCompanyDollar != null ? `$${band.toCompanyDollar.toLocaleString()}` : 'No max'}
                      </td>
                      <td className="border border-purple-200 px-3 py-2 text-gray-700">{band.leaderPercent}%</td>
                      <td className="border border-purple-200 px-3 py-2 text-gray-700">{band.companyPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Commission flow example — shows how a sample GCI flows through leader → member → company */}
            {(() => {
              const sampleGci = 10000;
              const firstLeaderBand = resolvedLeaderBands[0];
              const firstMemberBand = values.teamMemberOverrideBands?.[0];
              if (!firstLeaderBand || !firstMemberBand) return null;
              const leaderPct = firstLeaderBand.leaderPercent / 100;
              const companyFromLeaderPct = firstLeaderBand.companyPercent / 100;
              const memberPct = firstMemberBand.memberPercent / 100;
              const leaderPool = sampleGci * leaderPct;
              const companyFromLeader = sampleGci * companyFromLeaderPct;
              const memberPayout = leaderPool * memberPct;
              const leaderKeeps = leaderPool - memberPayout;
              return (
                <div className="mt-4 rounded-md border border-purple-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-purple-800">Example: ${sampleGci.toLocaleString()} GCI (Tier 1 rates)</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-purple-100 px-2 py-1 font-medium text-purple-800">
                      GCI ${sampleGci.toLocaleString()}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800">
                      Leader pool {firstLeaderBand.leaderPercent}% = ${leaderPool.toLocaleString()}
                    </span>
                    <span className="text-gray-400">+</span>
                    <span className="rounded bg-gray-100 px-2 py-1 font-medium text-gray-700">
                      Company {firstLeaderBand.companyPercent}% = ${companyFromLeader.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800">
                      Leader pool ${leaderPool.toLocaleString()}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="rounded bg-green-100 px-2 py-1 font-medium text-green-800">
                      You (member) {firstMemberBand.memberPercent}% = ${memberPayout.toLocaleString()}
                    </span>
                    <span className="text-gray-400">+</span>
                    <span className="rounded bg-blue-100 px-2 py-1 font-medium text-blue-800">
                      Leader keeps {(100 - firstMemberBand.memberPercent)}% = ${leaderKeeps.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Flat Commission Plan — only shown when commissionMode is 'flat' and agent is independent */}
        {isIndependentAgentType(values.agentType) && values.commissionMode === 'flat' && (
          <div className="mt-6 rounded-md border border-amber-100 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">Flat Commission Split</h3>
            <p className="mt-1 text-sm text-amber-800">
              Fixed split applied to every transaction — no tier progression, no GCI thresholds.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Agent % <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2"
                  value={values.flatAgentPercent}
                  onChange={(e) =>
                    updateField('flatAgentPercent', e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g. 70"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Company % <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-full rounded-md border px-3 py-2"
                  value={values.flatCompanyPercent}
                  onChange={(e) =>
                    updateField('flatCompanyPercent', e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g. 30"
                />
              </div>
            </div>
          </div>
        )}

        {/* Individual Commission Tiers — only shown for independent agents using tiered plans */}
        {isIndependentAgentType(values.agentType) && values.commissionMode !== 'flat' && (
          <div className="mt-6 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Commission Tiers</h3>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                onClick={addTier}
              >
                + Add Tier
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Tier thresholds represent <strong>Total GCI into the company</strong> (before agent/company split).
            </p>
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-3 py-2 text-left">Tier Name</th>
                  <th className="border px-3 py-2 text-left">From GCI $</th>
                  <th className="border px-3 py-2 text-left">To GCI $</th>
                  <th className="border px-3 py-2 text-left">Agent %</th>
                  <th className="border px-3 py-2 text-left">Company %</th>
                  <th className="border px-3 py-2 text-left">Notes</th>
                  <th className="border px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {values.tiers.map((tier, index) => (
                  <tr key={`${tier.tierName}-${index}`}>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        value={tier.tierName}
                        onChange={(e) => handleTierEdit(index, 'tierName', e.target.value)}
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        type="number"
                        value={tier.fromCompanyDollar}
                        onChange={(e) =>
                          handleTierEdit(index, 'fromCompanyDollar', Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        type="number"
                        value={tier.toCompanyDollar ?? ''}
                        onChange={(e) =>
                          handleTierEdit(
                            index,
                            'toCompanyDollar',
                            e.target.value === '' ? null : Number(e.target.value)
                          )
                        }
                        placeholder="No max"
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        type="number"
                        value={tier.agentSplitPercent}
                        onChange={(e) =>
                          handleTierEdit(index, 'agentSplitPercent', Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        type="number"
                        value={tier.companySplitPercent}
                        onChange={(e) =>
                          handleTierEdit(index, 'companySplitPercent', Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        value={tier.notes}
                        onChange={(e) => handleTierEdit(index, 'notes', e.target.value)}
                      />
                    </td>
                    <td className="border px-3 py-2">
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                        onClick={() => removeTier(index)}
                        disabled={values.tiers.length <= 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Relationships</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Referring Agent ID</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.referringAgentId}
              onChange={(e) => updateField('referringAgentId', e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Referring Agent Name Snapshot
            </label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={values.referringAgentDisplayNameSnapshot}
              onChange={(e) =>
                updateField('referringAgentDisplayNameSnapshot', e.target.value)
              }
              placeholder="Optional"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Notes</h2>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Admin Notes</label>
          <textarea
            className="min-h-28 w-full rounded-md border px-3 py-2"
            value={values.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Enter notes"
          />
        </div>
      </section>

      {(errorMessage || successMessage) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            errorMessage
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      {!isIndependentAgentType(values.agentType) && !teamSetupIsValid && (
        <p className="text-sm text-amber-700">
          {requiresLeaderPlanSelection
            ? 'Team leaders require a team selection and leader plan before saving.'
            : 'Team members require a team selection before saving.'}
        </p>
      )}

      {isIndependentAgentType(values.agentType) && values.commissionMode !== 'flat' && values.tiers.length === 0 && (
        <p className="text-sm text-amber-700">
          Add at least one commission tier before saving this profile.
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm font-medium"
          onClick={() => router.push('/dashboard/admin/agents')}
          disabled={isSaving || !teamSetupIsValid}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={
            isSaving ||
            (isIndependentAgentType(values.agentType) && values.commissionMode !== 'flat' && values.tiers.length === 0) ||
            (!isIndependentAgentType(values.agentType) && !teamSetupIsValid)
          }
        >
          {isSaving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
