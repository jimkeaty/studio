export type AgentProfileStatus = 'active' | 'inactive' | 'on_leave';

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

  tiers: AgentTier[];
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

  tiers?: AgentTier[];
  gracePeriodEnabled?: boolean;
  notes?: string | null;
};
