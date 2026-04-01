export type AgentProfileStatus = 'active' | 'grace_period' | 'inactive' | 'out';

/**
 * Team grouping for reporting and commission defaults.
 * Independent from the compensation-plan team (primaryTeamId).
 */
export type AgentTeamGroup =
  | 'referral_group'
  | 'cgl'
  | 'sgl'
  | 'charles_ditch_team'
  | 'independent'
  | string; // allows custom / future teams

/** Whether the agent uses team-default commission tiers, a custom tiered structure, or a flat fixed split. */
export type CommissionMode = 'team_default' | 'custom' | 'flat';

export type AgentType = 'independent' | 'team';

export type ProgressionMetric = 'companyDollar';

export type TeamRole = 'leader' | 'member';

export type PlanAssignmentType = 'individual' | 'teamMember' | 'teamLeader';

export type TeamMemberCompMode = 'teamDefault' | 'custom';

export type AgentTier = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  agentSplitPercent: number;
  companySplitPercent: number;
  transactionFee?: number | null;
  capAmount?: number | null;
  notes?: string | null;
};

export type TeamMemberOverrideBand = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
  notes?: string | null;
};

export type AgentProfile = {
  agentId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  office: string | null;
  status: AgentProfileStatus;
  startDate: string;
  anniversaryMonth: number;
  anniversaryDay: number;

  agentType: AgentType;
  progressionMetric: ProgressionMetric;

  primaryTeamId: string | null;
  teamRole: TeamRole | null;
  defaultPlanType: PlanAssignmentType;
  defaultPlanId: string | null;
  teamMemberCompMode: TeamMemberCompMode;
  teamMemberOverrideBands: TeamMemberOverrideBand[];

  referringAgentId: string | null;
  referringAgentDisplayNameSnapshot: string | null;

  /** Reporting / grouping team (separate from compensation team) */
  teamGroup: AgentTeamGroup | null;
  /** Whether using team-default tiers, custom tiers, or a flat fixed split */
  commissionMode: CommissionMode;
  tiers: AgentTier[];
  /** Flat commission plan: fixed agent split percentage (no tiers, no progression) */
  flatAgentPercent: number | null;
  /** Flat commission plan: fixed company split percentage */
  flatCompanyPercent: number | null;
  /** Default per-transaction fee for this agent */
  defaultTransactionFee: number | null;
  gracePeriodEnabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfileInput = {
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string | null;
  office?: string | null;
  status: AgentProfileStatus;
  startDate: string;

  agentType: AgentType;
  progressionMetric?: ProgressionMetric;

  primaryTeamId?: string | null;
  teamRole?: TeamRole | null;
  defaultPlanType?: PlanAssignmentType;
  defaultPlanId?: string | null;
  teamMemberCompMode?: TeamMemberCompMode;
  teamMemberOverrideBands?: TeamMemberOverrideBand[];

  referringAgentId?: string | null;
  referringAgentDisplayNameSnapshot?: string | null;

  teamGroup?: AgentTeamGroup | null;
  commissionMode?: CommissionMode;
  tiers?: AgentTier[];
  flatAgentPercent?: number | null;
  flatCompanyPercent?: number | null;
  defaultTransactionFee?: number | null;
  gracePeriodEnabled?: boolean;
  notes?: string | null;
  forceCreate?: boolean; // Skip fuzzy duplicate check
};
