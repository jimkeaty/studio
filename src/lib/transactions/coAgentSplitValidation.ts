export const CO_AGENT_SPLIT_TOLERANCE = 0.01;

export type CoAgentSplitValidation = {
  active: boolean;
  valid: boolean;
  primaryPercent: number | null;
  coAgentPercent: number | null;
  error: string | null;
};

type CoAgentSplitSource = Record<string, any>;

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function toPercentage(value: unknown): number | null {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCoAgentEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}

function firstNonBlank(...values: unknown[]): unknown {
  return values.find(hasValue);
}

/**
 * Validates one transaction's co-agent commission allocation before any payout,
 * volume, referral, or rollup calculation. A missing side is safely derived from
 * the other side; when both sides are absent, legacy/new files retain the 50/50
 * default. Explicit values must be finite percentages from 0–100 and total 100.
 */
export function validateCoAgentSplit(source: CoAgentSplitSource): CoAgentSplitValidation {
  if (!isCoAgentEnabled(source.hasCoAgent)) {
    return {
      active: false,
      valid: true,
      primaryPercent: null,
      coAgentPercent: null,
      error: null,
    };
  }

  const coAgent = source.coAgent as CoAgentSplitSource | null | undefined;
  const primaryRaw = firstNonBlank(
    source.primaryAgentSplitPercent,
    coAgent?.primarySplitPercent,
    coAgent?.primarySplitPct,
  );
  const coAgentRaw = firstNonBlank(
    source.coAgentSplitPercent,
    coAgent?.splitPercent,
    coAgent?.coAgentSplitPct,
    source.coListingAgentSplit,
  );

  let primaryPercent = toPercentage(primaryRaw);
  let coAgentPercent = toPercentage(coAgentRaw);

  if ((hasValue(primaryRaw) && primaryPercent === null) || (hasValue(coAgentRaw) && coAgentPercent === null)) {
    return {
      active: true,
      valid: false,
      primaryPercent,
      coAgentPercent,
      error: 'Primary and co-agent split percentages must be valid values from 0 to 100 and total 100%.',
    };
  }

  if (primaryPercent === null && coAgentPercent === null) {
    primaryPercent = 50;
    coAgentPercent = 50;
  } else if (primaryPercent === null && coAgentPercent !== null) {
    primaryPercent = 100 - coAgentPercent;
  } else if (coAgentPercent === null && primaryPercent !== null) {
    coAgentPercent = 100 - primaryPercent;
  }

  if (
    primaryPercent === null ||
    coAgentPercent === null ||
    primaryPercent < 0 ||
    primaryPercent > 100 ||
    coAgentPercent < 0 ||
    coAgentPercent > 100 ||
    Math.abs(primaryPercent + coAgentPercent - 100) >= CO_AGENT_SPLIT_TOLERANCE
  ) {
    return {
      active: true,
      valid: false,
      primaryPercent,
      coAgentPercent,
      error: 'Primary and co-agent split percentages must be valid values from 0 to 100 and total 100%.',
    };
  }

  return {
    active: true,
    valid: true,
    primaryPercent,
    coAgentPercent,
    error: null,
  };
}
