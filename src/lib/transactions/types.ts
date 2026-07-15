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

  /**
   * Outbound referral fee deducted from the top of GCI before agent/broker split.
   * referralFeePercent: the % applied to grossCommission (e.g. 25)
   * referralFeeDollar: the calculated dollar amount paid to the outside broker
   * netAfterReferral: grossCommission - referralFeeDollar (the base for agent/broker split)
   */
  referralFeePercent: number | null;
  referralFeeDollar: number | null;
  netAfterReferral: number | null;

  agentSplitPercent: number | null;
  companySplitPercent: number | null;
  agentNetCommission: number | null;

  /**
   * Transaction/listing compliance fee deducted from the agent's net commission
   * when the agent is paying the fee out of their own commission.
   * agentNetCommission already has this amount subtracted when this field is set.
   * null / 0 when the fee is paid by buyer, seller, or not applicable.
   */
  agentFeeDeduction?: number | null;

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
  /**
   * Optional: the date of the transaction (closedDate or contractDate).
   * When provided, the anniversary cycle is computed relative to this date
   * rather than today, ensuring correct tier lookup for past-dated transactions.
   */
  transactionDate?: string | Date | null;
  /**
   * Optional outbound referral fee taken off the top of GCI before agent/broker split.
   * When provided, the agent/broker split is calculated on (commission - referralFeeDollar).
   * referralFeePercent: e.g. 25 (for 25%)
   * referralFeeDollar: explicit dollar override (takes precedence over percent if both provided)
   */
  referralFeePercent?: number | null;
  referralFeeDollar?: number | null;
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
