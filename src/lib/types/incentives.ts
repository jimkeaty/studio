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
 * Stored in the `referral_qualifications` collection.
 */
export interface ReferralQualification {
  id: string; // Document ID is the recruitedAgentId
  recruitedAgentId: string;
  hireDate: Timestamp;
  windowEndsAt: Timestamp;
  thresholdCompanyGciGross: number;
  companyGciGrossInWindow: number;
  status: 'in_progress' | 'qualified' | 'expired';
  qualifiedAt: Timestamp | null;
  lastComputedAt: Timestamp;
  computedByUid: string;
}

/**
 * A combined data structure for displaying downline information in the UI.
 */
export interface DownlineMember {
  agentId: string;
  displayName: string;
  tier: 1 | 2;
  hireDate: Date | null;
  qualificationProgress: QualificationProgress | null;
}

/**
 * Represents the computed progress for a single recruited agent.
 */
export interface QualificationProgress {
  status: 'in_progress' | 'qualified' | 'expired' | 'missing_data';
  companyGciGrossInWindow: number;
  remainingToThreshold: number;
  progressPercentage: number;
  windowEndsAt: Date | null;
  timeRemainingDays: number | null;
  qualifiedAt: Date | null;
  annualPayout: 500 | 0;
}
