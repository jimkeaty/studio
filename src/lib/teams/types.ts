export type TeamStatus = 'active' | 'inactive';

export type ThresholdMetric = 'companyDollar';

export type TeamStructureModel = 'leaderFirst';

/**
 * Whether this team has a designated leader who receives a leader-side split.
 *
 * - `with_leader`  — classic team structure: leader takes a cut before member payout
 * - `no_leader`    — leaderless team (CGL, SGL, Referral Group, etc.):
 *                    commission splits are agent vs. company only; no leader fields apply
 */
export type TeamStructureType = 'with_leader' | 'no_leader';

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
  /** Only required when structureType === 'with_leader' */
  leaderAgentId: string | null;
  teamPlanId: string;
  status: TeamStatus;
  /** Defaults to 'with_leader' for backward compatibility */
  structureType: TeamStructureType;
  office: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

export type TeamInput = {
  teamName: string;
  /** Required when structureType === 'with_leader'; omit or pass null for no_leader teams */
  leaderAgentId?: string | null;
  teamPlanId: string;
  status?: TeamStatus;
  /** Defaults to 'with_leader' when omitted */
  structureType?: TeamStructureType;
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
  memberDefaultBands: MemberPlanBand[];
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
  memberDefaultBands: MemberPlanBand[];
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
