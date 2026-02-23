import type { Timestamp } from 'firebase/firestore';

/**
 * Defines the relationship between a recruited agent and their referrer.
 * Stored in the `agent_referrals` collection.
 */
export interface AgentReferral {
  id: string; // Document ID is the recruitedAgentId
  recruitedAgentId: string;
  referrerAgentId: string;
  createdAt: Timestamp;
  createdByUid: string;
  updatedAt: Timestamp;
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
  hireDate: Timestamp;
  windowEndsAt: Timestamp;
  thresholdCompanyGciGross: number;
  companyGciGrossInWindow: number; // IMPORTANT: This is the CLOSED GCI amount.
  status: 'in_progress' | 'qualified' | 'expired';
  qualifiedAt: Timestamp | null;
  lastComputedAt: Timestamp;
  computedByUid: string;
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
  referrerId?: string; // Tier 1 referrer
  uplineId?: string; // Tier 2 upline
}

/**
 * Represents the computed progress for a single recruited agent. This is an
 * in-memory object, calculated on-the-fly for UI display.
 */
export interface QualificationProgress {
  status: 'in_progress' | 'qualified' | 'expired' | 'missing_data';
  closedCompanyGciGrossInWindow: number;
  pendingCompanyGciGrossInWindow: number;
  remainingToThreshold: number; // Based on CLOSED GCI only
  progressPercentage: number; // Based on CLOSED GCI only
  windowEndsAt: Date | null;
  timeRemainingDays: number | null;
  qualifiedAt: Date | null;
  annualPayout: 500 | 0;
}
