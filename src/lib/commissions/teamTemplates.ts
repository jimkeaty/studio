/**
 * Default commission tier templates keyed by team group.
 * These are the starting tiers auto-populated when an agent selects a team group
 * and has commissionMode === 'team_default'.
 *
 * Each template is an array of AgentTier-shaped objects.
 * The admin can always override by switching to 'custom' mode.
 */

export type CommissionTierTemplate = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  agentSplitPercent: number;
  companySplitPercent: number;
  transactionFee: number | null;
  capAmount: number | null;
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
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 45000,
    toCompanyDollar: 90000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 90000,
    toCompanyDollar: 180000,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 4',
    fromCompanyDollar: 180000,
    toCompanyDollar: 240000,
    agentSplitPercent: 80,
    companySplitPercent: 20,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 5',
    fromCompanyDollar: 240000,
    toCompanyDollar: null,
    agentSplitPercent: 90,
    companySplitPercent: 10,
    transactionFee: 395,
    capAmount: null,
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
    transactionFee: 0,
    capAmount: null,
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
    transactionFee: 395,
    capAmount: null,
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
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 45000,
    toCompanyDollar: 90000,
    agentSplitPercent: 65,
    companySplitPercent: 35,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 90000,
    toCompanyDollar: 180000,
    agentSplitPercent: 75,
    companySplitPercent: 25,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 4',
    fromCompanyDollar: 180000,
    toCompanyDollar: null,
    agentSplitPercent: 85,
    companySplitPercent: 15,
    transactionFee: 395,
    capAmount: null,
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
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 2',
    fromCompanyDollar: 60000,
    toCompanyDollar: 120000,
    agentSplitPercent: 60,
    companySplitPercent: 40,
    transactionFee: 395,
    capAmount: null,
    notes: '',
  },
  {
    tierName: 'Tier 3',
    fromCompanyDollar: 120000,
    toCompanyDollar: null,
    agentSplitPercent: 70,
    companySplitPercent: 30,
    transactionFee: 395,
    capAmount: null,
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
 */
export const TEAM_GROUP_OPTIONS = [
  { value: 'referral_group', label: 'Referral Group' },
  { value: 'cgl', label: 'CGL' },
  { value: 'sgl', label: 'SGL' },
  { value: 'charles_ditch_team', label: 'Charles Ditch Team' },
  { value: 'independent', label: 'Independent' },
] as const;
