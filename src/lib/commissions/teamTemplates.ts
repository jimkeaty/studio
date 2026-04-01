/**
 * Default commission tier templates keyed by team group.
 * These are the starting tiers auto-populated when an agent selects a team group
 * and has commissionMode === 'team_default'.
 *
 * Each template is an array of AgentTier-shaped objects.
 * The admin can always override by switching to 'custom' mode.
 *
 * Tier thresholds represent Total GCI into the company (before agent/company split).
 * fromCompanyDollar / toCompanyDollar are the persisted field names for backward
 * compatibility, but the UI labels them as "From GCI" / "To GCI".
 */

export type CommissionTierTemplate = {
  tierName: string;
  /** Total GCI into the company — lower bound of this tier */
  fromCompanyDollar: number;
  /** Total GCI into the company — upper bound (null = no cap) */
  toCompanyDollar: number | null;
  agentSplitPercent: number;
  companySplitPercent: number;
  notes: string;
};

/**
 * Standard 5-tier independent / default structure used by most groups.
 */
const STANDARD_TIERS: CommissionTierTemplate[] = [
  {
    tierName: 'Tier 1',
    fromCompanyDollar: 0,
    toCompanyDollar: 45000,
    agentSplitPercent: 55,
    companySplitPercent: 45,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 45000,
    toCompanyDollar: 90000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 90000,
    toCompanyDollar: 180000,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    notes: '',
  },
  {
    tierName: 'Tier 4',
    fromCompanyDollar: 180000,
    toCompanyDollar: 240000,
    agentSplitPercent: 80,
    companySplitPercent: 20,
    notes: '',
  },
  {
    tierName: 'Tier 5',
    fromCompanyDollar: 240000,
    toCompanyDollar: null,
    agentSplitPercent: 90,
    companySplitPercent: 10,
    notes: '',
  },
];

/**
 * Referral Group — typically a flat referral split.
 */
const REFERRAL_GROUP_TIERS: CommissionTierTemplate[] = [
  {
    tierName: 'Referral Split',
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    agentSplitPercent: 50,
    companySplitPercent: 50,
    notes: 'Flat referral split',
  },
];

/**
 * CGL (Company Generated Leads) — lower agent split, company retains more.
 */
const CGL_TIERS: CommissionTierTemplate[] = [
  {
    tierName: 'CGL Standard',
    fromCompanyDollar: 0,
    toCompanyDollar: null,
    agentSplitPercent: 40,
    companySplitPercent: 60,
    notes: 'Company generated lead split',
  },
];

/**
 * SGL (Self Generated Leads) — higher agent split.
 */
const SGL_TIERS: CommissionTierTemplate[] = [
  {
    tierName: 'Tier 1',
    fromCompanyDollar: 0,
    toCompanyDollar: 45000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 45000,
    toCompanyDollar: 90000,
    agentSplitPercent: 65,
    companySplitPercent: 35,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 90000,
    toCompanyDollar: 180000,
    agentSplitPercent: 75,
    companySplitPercent: 25,
    notes: '',
  },
  {
    tierName: 'Tier 4',
    fromCompanyDollar: 180000,
    toCompanyDollar: null,
    agentSplitPercent: 85,
    companySplitPercent: 15,
    notes: '',
  },
];

/**
 * Charles Ditch Team — team-specific structure.
 */
const CHARLES_DITCH_TIERS: CommissionTierTemplate[] = [
  {
    tierName: 'Tier 1',
    fromCompanyDollar: 0,
    toCompanyDollar: 60000,
    agentSplitPercent: 50,
    companySplitPercent: 50,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 60000,
    toCompanyDollar: 120000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 120000,
    toCompanyDollar: null,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    notes: '',
  },
];

/**
 * Map of team group slug → default tiers.
 * Falls back to STANDARD_TIERS for unknown groups.
 */
const TEAM_TEMPLATES: Record<string, CommissionTierTemplate[]> = {
  referral_group: REFERRAL_GROUP_TIERS,
  cgl: CGL_TIERS,
  sgl: SGL_TIERS,
  charles_ditch_team: CHARLES_DITCH_TIERS,
  independent: STANDARD_TIERS,
};

/**
 * Returns the default commission tiers for a given team group.
 * Always returns a deep clone so callers can mutate freely.
 */
export function getTeamDefaultTiers(
  teamGroup: string | null | undefined
): CommissionTierTemplate[] {
  const key = (teamGroup || 'independent').toLowerCase().trim();
  const template = TEAM_TEMPLATES[key] || STANDARD_TIERS;
  return template.map((t) => ({ ...t }));
}

/**
 * Returns the default transaction fee for a given team group.
 */
export function getTeamDefaultTransactionFee(
  teamGroup: string | null | undefined
): number {
  const key = (teamGroup || 'independent').toLowerCase().trim();
  if (key === 'referral_group') return 0;
  return 395;
}

/**
 * All known team group options for the dropdown.
 * `leaderless: true` marks groups where no team leader split applies —
 * commission is agent vs. company only (CGL, SGL, Referral Group).
 */
export const TEAM_GROUP_OPTIONS = [
  { value: 'referral_group', label: 'Referral Group', leaderless: true },
  { value: 'cgl', label: 'CGL', leaderless: true },
  { value: 'sgl', label: 'SGL', leaderless: true },
  { value: 'charles_ditch_team', label: 'Charles Ditch Team', leaderless: false },
  { value: 'independent', label: 'Independent', leaderless: false },
] as const;

/**
 * Set of team group slugs that are leaderless (agent vs. company split only).
 * CGL, SGL, and Referral Group have no team leader — commission splits
 * involve only the agent and the company/broker.
 *
 * Use this to suppress leader-related UI and commission logic.
 */
export const LEADERLESS_TEAM_GROUPS = new Set<string>([
  'cgl',
  'sgl',
  'referral_group',
]);

/**
 * Map from team name (as stored in teams collection) to team group slug.
 * Used to auto-populate teamGroup when a primary team is selected.
 */
export const TEAM_NAME_TO_GROUP: Record<string, string> = {
  'cgl-team': 'cgl',
  'new-cgl': 'cgl',
  'sgl-team': 'sgl',
  'charles-ditch-team': 'charles_ditch_team',
  'cd-team': 'charles_ditch_team',
};
