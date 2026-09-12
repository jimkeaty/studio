import { normalizeDealSource } from '@/lib/normalizeDealSource';
import type { MemberPlanBand } from '@/lib/teams/types';

type StoredMemberPlanBand = MemberPlanBand & { notes?: string | null };

/**
 * Legacy custom member bands can contain source-specific rules in their notes,
 * for example "Sphere lead" or "Company generated lead". Source-tagged bands
 * overlap normal tier ranges by design, so selecting the first matching dollar
 * range would apply the wrong commission split. This helper keeps those legacy
 * tags usable until the profile editor stores an explicit source field.
 */
function bandSource(notes: string | null | undefined): 'sphere' | 'company_gen' | null {
  const text = String(notes || '').toLowerCase();
  if (/\bsphere\b|sphere of influence|\bsoi\b/.test(text)) return 'sphere';
  if (/company[ -]?gen|company generated|company lead|\bboomtown\b|\bbt\b/.test(text)) return 'company_gen';
  return null;
}

/**
 * Select only bands explicitly tagged for the transaction's normalized lead
 * source. If custom bands have no source tags, preserve the legacy behavior.
 * If a source is unknown or no matching source tag exists, return no custom
 * bands so the canonical team/default/agent-tier fallback can apply instead
 * of silently applying a sphere or company-lead exception to another lead.
 */
export function selectSourceSpecificMemberBands(
  bands: StoredMemberPlanBand[] | null | undefined,
  rawDealSource: string | null | undefined,
): StoredMemberPlanBand[] {
  const candidates = Array.isArray(bands) ? bands : [];
  const tagged = candidates.filter((band) => bandSource(band.notes) !== null);
  if (tagged.length === 0) return candidates;

  const dealSource = normalizeDealSource(rawDealSource);
  if (dealSource !== 'sphere' && dealSource !== 'company_gen') return [];

  return tagged.filter((band) => bandSource(band.notes) === dealSource);
}
