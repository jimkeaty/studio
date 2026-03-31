/**
 * Canonical deal-source normalization.
 *
 * Used in:
 *   - Manual entry (Add Transaction form)
 *   - Bulk import (/api/admin/import)
 *   - Transaction POST / PATCH routes
 *
 * All variants of the same concept map to a single canonical value.
 */

const ALIAS_MAP: Record<string, string> = {
  // Boomtown
  boomtown: 'boomtown',
  'boom town': 'boomtown',
  bt: 'boomtown',

  // Referral
  referral: 'referral',
  ref: 'referral',
  'agent referral': 'referral',
  'client referral': 'referral',

  // Sphere of Influence
  sphere: 'sphere',
  'sphere of influence': 'sphere',
  soi: 'sphere',

  // Sign Call
  'sign call': 'sign_call',
  sign: 'sign_call',
  'sign_call': 'sign_call',
  signcall: 'sign_call',

  // Company Generated
  'company gen': 'company_gen',
  company: 'company_gen',
  'company_gen': 'company_gen',
  'company generated': 'company_gen',
  'company lead': 'company_gen',

  // Social Media
  social: 'social',
  'social media': 'social',

  // Open House
  'open house': 'open_house',
  oh: 'open_house',
  'open_house': 'open_house',
  openhouse: 'open_house',

  // FSBO
  fsbo: 'fsbo',
  'for sale by owner': 'fsbo',

  // Expired Listing
  expired: 'expired_listing',
  'expired listing': 'expired_listing',
  'expired_listing': 'expired_listing',

  // Pass-Through (normalize all variants)
  'pass through': 'pass_through',
  'pass-through': 'pass_through',
  passthrough: 'pass_through',
  'pass_through': 'pass_through',
  'passthru': 'pass_through',
  'pass thru': 'pass_through',

  // Other
  other: 'other',
  unknown: 'other',
  na: 'other',
  'n/a': 'other',
};

export function normalizeDealSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (!s) return null;

  // Direct alias match
  if (ALIAS_MAP[s]) return ALIAS_MAP[s];

  // Partial match (for strings like "company generated lead" or "sign call - yard")
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (s.includes(alias)) return canonical;
  }

  // Return the original trimmed value if no match (preserves custom sources)
  return raw.trim();
}

/** Canonical source labels for UI display */
export const CANONICAL_SOURCES = [
  { value: 'boomtown', label: 'Boomtown' },
  { value: 'referral', label: 'Referral' },
  { value: 'sphere', label: 'Sphere of Influence' },
  { value: 'sign_call', label: 'Sign Call' },
  { value: 'company_gen', label: 'Company Generated' },
  { value: 'social', label: 'Social Media' },
  { value: 'open_house', label: 'Open House' },
  { value: 'fsbo', label: 'FSBO' },
  { value: 'expired_listing', label: 'Expired Listing' },
  { value: 'pass_through', label: 'Pass-Through' },
  { value: 'other', label: 'Other' },
] as const;
