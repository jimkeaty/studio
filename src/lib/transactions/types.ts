import type { AgentType } from '@/lib/agents/types';

export type TransactionCalculationModel =
  | 'individual'
  | 'teamMember'
  | 'teamLeader';

export type TransactionSplitSnapshot = {
  primaryTeamId: string | null;
  teamPlanId: string | null;
  memberPlanId: string | null;

  grossCommission: number;

  agentSplitPercent: number | null;
  companySplitPercent: number | null;
  agentNetCommission: number | null;

  leaderStructurePercent: number | null;
  leaderStructureGross: number | null;

  memberPercentOfLeaderSide: number | null;
  memberPaid: number | null;
  leaderRetainedAfterMember: number | null;

  companyRetained: number;
};

export type TransactionCreditSnapshot = {
  leaderboardAgentId: string;
  leaderboardAgentDisplayName: string;

  progressionMemberAgentId: string | null;
  progressionLeaderAgentId: string | null;
  progressionTeamId: string | null;

  progressionCompanyDollarCredit: number;
};

export type ResolvedTransactionCalculation = {
  calculationModel: TransactionCalculationModel;
  agentType: AgentType;
  splitSnapshot: TransactionSplitSnapshot;
  creditSnapshot: TransactionCreditSnapshot;
};

export type ResolveTransactionInput = {
  agentId: string;
  agentDisplayName: string;
  commission: number;
};
