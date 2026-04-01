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

// ── Co-Agent Support ──────────────────────────────────────────────────────────

/** Role of the second agent participating in the same side of the transaction. */
export type CoAgentRole = 'co_list' | 'co_buyer' | 'referral' | 'other';

/**
 * Represents a second internal agent participating in the same side of a transaction.
 *
 * Commission calculation order:
 *   1. Side gross commission is split by primaryAgentSplitPercent / coAgentSplitPercent
 *   2. Each agent's own company commission structure (tiers / fixed) is applied
 *      independently to their respective share.
 *
 * Side credit is proportional: sideCredit = splitPercent / 100
 * (e.g. 40% split → 0.4 side credit for this co-agent)
 */
export type CoAgentParticipant = {
  agentId: string;
  agentDisplayName: string;
  role: CoAgentRole;
  /** Percentage of the side gross commission allocated to this co-agent (0–100) */
  splitPercent: number;
  /** Fractional side credit (splitPercent / 100). e.g. 0.4 for a 40% split */
  sideCredit: number;
  /** Commission calculation result for this co-agent's share */
  splitSnapshot: TransactionSplitSnapshot | null;
  creditSnapshot: TransactionCreditSnapshot | null;
};
