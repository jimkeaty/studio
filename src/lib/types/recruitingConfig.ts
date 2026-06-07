/**
 * Recruiting Incentive Program Configuration
 * Stored in Firestore: `recruitingIncentiveConfig/{orgId}`
 *
 * Each brokerage/org can define its own recruiting incentive program.
 * The backend reads this config instead of using hardcoded constants.
 */
export interface RecruitingIncentiveConfig {
  /** Firestore document ID — same as orgId */
  id: string;
  /** Human-readable program name (e.g. "Keaty Recruiting Incentive Program") */
  programName: string;
  /** Whether the program is currently active */
  enabled: boolean;
  /**
   * GCI threshold the recruit must reach within their anniversary window
   * to trigger a payout to their referrer.
   * Default: 40000
   */
  gciThreshold: number;
  /**
   * Dollar amount paid to the referring agent when a Tier 1 recruit qualifies.
   * Default: 500
   */
  tier1PayoutAmount: number;
  /**
   * Dollar amount paid to the upline agent (Tier 1's referrer) when a
   * Tier 2 recruit qualifies. Set to 0 to disable Tier 2 payouts.
   * Default: 500
   */
  tier2PayoutAmount: number;
  /**
   * Number of tiers deep the incentive applies.
   * 1 = direct recruits only, 2 = direct + their recruits.
   * Max supported: 2
   * Default: 2
   */
  tierDepth: 1 | 2;
  /**
   * How the qualification window is measured.
   * 'anniversary' = 12-month rolling window from each recruit's hire date (resets annually)
   * 'calendar' = January 1 – December 31 each year
   * Default: 'anniversary'
   */
  windowType: 'anniversary' | 'calendar';
  /**
   * Length of each qualification window in months.
   * Default: 12
   */
  windowMonths: number;
  /**
   * Whether the payout recurs every year the recruit re-qualifies,
   * or is a one-time payment per recruit.
   * Default: true (recurring)
   */
  recurring: boolean;
  /** Optional description shown to agents */
  description?: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** UID of admin who last updated */
  updatedByUid: string;
}

/**
 * Default config used when no org-specific config exists.
 * Matches the current Keaty hardcoded values.
 */
export const DEFAULT_RECRUITING_CONFIG: Omit<RecruitingIncentiveConfig, 'id' | 'updatedAt' | 'updatedByUid'> = {
  programName: 'Recruiting Incentive Program',
  enabled: true,
  gciThreshold: 40_000,
  tier1PayoutAmount: 500,
  tier2PayoutAmount: 500,
  tierDepth: 2,
  windowType: 'anniversary',
  windowMonths: 12,
  recurring: true,
  description: 'Earn $500 for each agent you recruit who closes $40,000 in GCI within their anniversary year. Renews every year they stay active and productive.',
};
