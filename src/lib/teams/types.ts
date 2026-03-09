export type TeamStatus = 'active' | 'inactive';

export type ThresholdMetric = 'companyDollar';

export type TeamStructureModel = 'leaderFirst';

export type TeamMembershipRole = 'leader' | 'member';

export type TeamThresholdBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  leaderPercent: number;
  companyPercent: number;
};

export type TeamTierCreditRules = {
  memberGetsFullCompanyDollar: boolean;
  leaderGetsFullCompanyDollar: boolean;
  teamGetsFullCompanyDollar: boolean;
};

export type TeamAnniversaryCycleRules = {
  cycleType: 'anniversary';
};

export type Team = {
  teamId: string;
  teamName: string;
  leaderAgentId: string;
  teamPlanId: string;
  status: TeamStatus;
  office: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type TeamInput = {
  teamName: string;
  leaderAgentId: string;
  teamPlanId: string;
  status?: TeamStatus;
  office?: string | null;
  notes?: string | null;
};

export type TeamMembership = {
  membershipId: string;
  teamId: string;
  agentId: string;
  role: TeamMembershipRole;
  memberPlanId: string | null;
  effectiveStart: string;
  effectiveEnd: string | null;
  activeFlag: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type TeamMembershipInput = {
  teamId: string;
  agentId: string;
  role: TeamMembershipRole;
  memberPlanId?: string | null;
  effectiveStart: string;
  effectiveEnd?: string | null;
  activeFlag?: boolean;
  notes?: string | null;
};

export type TeamPlan = {
  teamPlanId: string;
  teamId: string;
  planName: string;
  status: TeamStatus;
  thresholdMetric: ThresholdMetric;
  thresholdMarkers: number[];
  structureModel: TeamStructureModel;
  leaderStructureBands: TeamThresholdBand[];
  tierCreditRules: TeamTierCreditRules;
  anniversaryCycleRules: TeamAnniversaryCycleRules;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type TeamPlanInput = {
  teamId: string;
  planName: string;
  status?: TeamStatus;
  thresholdMetric?: ThresholdMetric;
  thresholdMarkers: number[];
  structureModel?: TeamStructureModel;
  leaderStructureBands: TeamThresholdBand[];
  tierCreditRules?: TeamTierCreditRules;
  anniversaryCycleRules?: TeamAnniversaryCycleRules;
  notes?: string | null;
};

export type MemberPlanBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
};

export type MemberPlan = {
  memberPlanId: string;
  teamId: string;
  agentId: string;
  planName: string;
  status: TeamStatus;
  thresholdMetric: ThresholdMetric;
  thresholdMarkers: number[];
  payoutBands: MemberPlanBand[];
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type MemberPlanInput = {
  teamId: string;
  agentId: string;
  planName: string;
  status?: TeamStatus;
  thresholdMetric?: ThresholdMetric;
  thresholdMarkers: number[];
  payoutBands: MemberPlanBand[];
  notes?: string | null;
};
