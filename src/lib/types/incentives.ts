import type { TimestampLike } from './timestamp';

/**
 * Defines the relationship between a recruited agent and their referrer.
 * Stored in the `agent_referrals` collection.
 */
export interface AgentReferral {
  id: string; // Document ID is the recruitedAgentId
  recruitedAgentId: string;
  referrerAgentId: string;
  createdAt: TimestampLike;
  createdByUid: string;
  updatedAt: TimestampLike;
  updatedByUid: string;
  status: 'active' | 'disputed' | 'removed';
  note?: string;
}

/**
 * Tracks the qualification status of a recruited agent.
 * This is the canonical document stored in Firestore.
 * Stored in the `referral_qualifications` collection.
 */
export interface ReferralQualification {
  id: string; // Document ID is the recruitedAgentId
  recruitedAgentId: string;
  hireDate: TimestampLike;
  windowEndsAt: TimestampLike;
  thresholdCompanyGciGross: number;
  companyGciGrossInWindow: number; // IMPORTANT: This is the CLOSED GCI amount.
  status: 'in_progress' | 'qualified' | 'expired';
  qualifiedAt: TimestampLike | null;
  lastComputedAt: TimestampLike;
  computedByUid: string;
}

/**
 * Progress for a single anniversary-year window.
 */
export interface AnniversaryYearProgress {
  /** Year number (1 = first year, 2 = second year, etc.) */
  yearNumber: number;
  /** Start of this anniversary window */
  windowStart: Date;
  /** End of this anniversary window */
  windowEnd: Date;
  /** GCI closed within this window */
  closedGci: number;
  /** GCI pending within this window */
  pendingGci: number;
  /** Whether the recruit qualified in this window */
  qualified: boolean;
  /** Whether this window has expired (end date is in the past) */
  expired: boolean;
  /** Whether this is the current active window */
  isCurrent: boolean;
  /** Payout earned for this year (based on config) */
  payoutEarned: number;
}

/**
 * Represents the computed progress for a single recruited agent across all years.
 * This is an in-memory object, calculated on-the-fly for UI display.
 */
export interface QualificationProgress {
  status: 'in_progress' | 'qualified' | 'expired' | 'missing_data';
  /** Current anniversary window GCI (closed) */
  closedCompanyGciGrossInWindow: number;
  /** Current anniversary window GCI (pending) */
  pendingCompanyGciGrossInWindow: number;
  /** How much more GCI is needed in the current window */
  remainingToThreshold: number;
  /** Progress % toward threshold in current window */
  progressPercentage: number;
  /** End of the current anniversary window */
  windowEndsAt: Date | null;
  /** Days remaining in current window */
  timeRemainingDays: number | null;
  qualifiedAt: Date | null;
  /** Payout for the current anniversary year (0 or configured amount) */
  annualPayout: number;
  /** History of all anniversary years since hire */
  anniversaryYears: AnniversaryYearProgress[];
  /** Total lifetime payouts earned across all years */
  totalLifetimePayouts: number;
  /** Number of years this recruit has qualified */
  qualifiedYearsCount: number;
}

/**
 * A combined data structure for displaying downline information in the UI.
 * This is an enriched, in-memory object, not a direct Firestore document.
 */
export interface DownlineMember {
  agentId: string;
  displayName: string;
  tier: 1 | 2;
  hireDate: Date | null;
  qualificationProgress: QualificationProgress | null;
  referrerId?: string;
  uplineId?: string;
  referrerDisplayName?: string;
}

/**
 * Summary of the referring agent's total recruiting incentive income.
 */
export interface RecruitingSummary {
  tier1Count: number;
  tier2Count: number;
  qualifiedCount: number;
  totalRecruits: number;
  /** Qualified Tier 1 recruits in current window */
  tier1QualifiedCount: number;
  /** Qualified Tier 2 recruits in current window */
  tier2QualifiedCount: number;
  /** Annual income from Tier 1 recruits (current window) */
  tier1AnnualIncome: number;
  /** Annual income from Tier 2 recruits (current window — same payout credited to upline) */
  tier2AnnualIncome: number;
  /** Total projected annual income from all recruits */
  totalAnnualIncome: number;
  /** Total lifetime income earned across all years */
  totalLifetimeIncome: number;
}
