export type EffectiveLifecycleStatus = 'active' | 'inactive' | 'out';

export type LifecycleInput = {
  status?: string | null;
  inactiveDate?: unknown;
  /** Canonical confirmed brokerage departure date. */
  endDate?: unknown;
  /** Legacy synonym retained for historical imports; never silently discarded. */
  departureDate?: unknown;
};

export type LifecycleClassification = {
  status: EffectiveLifecycleStatus;
  asOfDate: string;
  inactiveDate: string | null;
  departureDate: string | null;
  applicableDate: string | null;
  isArchived: boolean;
  source: 'effective_date' | 'legacy_status' | 'current_status';
  dateConflict: boolean;
  conflictMessage: string | null;
  missingEffectiveDate: boolean;
};

const ARCHIVED_STATUSES = new Set(['inactive', 'out', 'terminated', 'churned']);
export function lifecycleYmd(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }
  if (typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

/**
 * Resolves lifecycle from the business-effective date, not the later time a
 * user changed a profile status. `endDate` is the canonical departure field;
 * legacy `departureDate` is read for compatibility. When both differ, the
 * earliest departure date keeps headcount conservative and flags correction.
 */
export function classifyAgentLifecycle(input: LifecycleInput, asOfDate: string): LifecycleClassification {
  const inactiveDate = lifecycleYmd(input.inactiveDate);
  const endDate = lifecycleYmd(input.endDate);
  const legacyDepartureDate = lifecycleYmd(input.departureDate);
  const departureDates = [endDate, legacyDepartureDate].filter((value): value is string => Boolean(value));
  const dateConflict = departureDates.length > 1 && new Set(departureDates).size > 1;
  const departureDate = departureDates.length ? [...departureDates].sort()[0] : null;
  const normalizedStatus = String(input.status || 'active').trim().toLowerCase();

  if (departureDate && departureDate <= asOfDate) {
    return {
      status: 'out', asOfDate, inactiveDate, departureDate, applicableDate: departureDate,
      isArchived: true, source: 'effective_date', dateConflict,
      conflictMessage: dateConflict ? 'Both end and departure dates are populated differently; correct the lifecycle dates.' : null,
      missingEffectiveDate: false,
    };
  }
  if (inactiveDate && inactiveDate <= asOfDate) {
    return {
      status: 'inactive', asOfDate, inactiveDate, departureDate, applicableDate: inactiveDate,
      isArchived: true, source: 'effective_date', dateConflict,
      conflictMessage: dateConflict ? 'Both end and departure dates are populated differently; correct the lifecycle dates.' : null,
      missingEffectiveDate: false,
    };
  }
  if (ARCHIVED_STATUSES.has(normalizedStatus) && !((inactiveDate && inactiveDate > asOfDate) || (departureDate && departureDate > asOfDate))) {
    return {
      status: 'inactive', asOfDate, inactiveDate, departureDate, applicableDate: inactiveDate || departureDate,
      isArchived: true, source: 'legacy_status', dateConflict,
      conflictMessage: dateConflict ? 'Both end and departure dates are populated differently; correct the lifecycle dates.' : null,
      missingEffectiveDate: true,
    };
  }
  return {
    status: 'active', asOfDate, inactiveDate, departureDate, applicableDate: null,
    isArchived: false, source: 'current_status', dateConflict,
    conflictMessage: dateConflict ? 'Both end and departure dates are populated differently; correct the lifecycle dates.' : null,
    missingEffectiveDate: false,
  };
}

export function isLifecycleActive(input: LifecycleInput, asOfDate: string) {
  return classifyAgentLifecycle(input, asOfDate).status === 'active';
}

export function lifecyclePopulation<T extends LifecycleInput>(profiles: T[], asOfDate: string) {
  return profiles.reduce((totals, profile) => {
    const lifecycle = classifyAgentLifecycle(profile, asOfDate);
    totals[lifecycle.status] += 1;
    return totals;
  }, { active: 0, inactive: 0, out: 0 });
}
