/**
 * anniversaryCycle.ts
 *
 * Computes the 12-month anniversary-based commission cycle window for an agent.
 *
 * An anniversary cycle runs from the agent's anniversary date in one year to
 * the day before their anniversary date in the following year.
 *
 * Example: agent started June 15.
 *   - Cycle containing 2026-03-01: 2025-06-15 → 2026-06-14
 *   - Cycle containing 2026-07-01: 2026-06-15 → 2027-06-14
 *
 * For agents with no anniversary data (month/day both 0 or missing), the
 * function falls back to the calendar year (Jan 1 → Dec 31).
 */

export interface AnniversaryCycle {
  /** Inclusive start of the commission cycle (UTC midnight) */
  cycleStart: Date;
  /** Inclusive end of the commission cycle (UTC 23:59:59.999) */
  cycleEnd: Date;
  /** Label year — the year in which cycleStart falls */
  cycleYear: number;
}

/**
 * Return the anniversary cycle window that contains `referenceDate`.
 *
 * @param anniversaryMonth  1-based month (1 = January). Pass 0 or null for calendar-year fallback.
 * @param anniversaryDay    Day of month. Pass 0 or null for calendar-year fallback.
 * @param referenceDate     The date to find the cycle for. Defaults to today.
 */
export function getAnniversaryCycle(
  anniversaryMonth: number | null | undefined,
  anniversaryDay: number | null | undefined,
  referenceDate?: Date
): AnniversaryCycle {
  const ref = referenceDate ?? new Date();
  const refUtc = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));

  const month = Number(anniversaryMonth ?? 0);
  const day = Number(anniversaryDay ?? 0);

  // Fallback: calendar year
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    const y = refUtc.getUTCFullYear();
    return {
      cycleStart: new Date(Date.UTC(y, 0, 1)),
      cycleEnd: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
      cycleYear: y,
    };
  }

  // Try the anniversary in the same calendar year as referenceDate
  const refYear = refUtc.getUTCFullYear();
  const annivThisYear = new Date(Date.UTC(refYear, month - 1, day));

  let cycleStart: Date;
  if (refUtc.getTime() >= annivThisYear.getTime()) {
    // referenceDate is on or after this year's anniversary → cycle starts this year
    cycleStart = annivThisYear;
  } else {
    // referenceDate is before this year's anniversary → cycle started last year
    cycleStart = new Date(Date.UTC(refYear - 1, month - 1, day));
  }

  // Cycle ends the day before the next anniversary (i.e., cycleStart + 1 year - 1 day)
  const nextAnniv = new Date(Date.UTC(cycleStart.getUTCFullYear() + 1, month - 1, day));
  const cycleEnd = new Date(nextAnniv.getTime() - 1); // 1 ms before next anniversary = 23:59:59.999 of previous day

  return {
    cycleStart,
    cycleEnd,
    cycleYear: cycleStart.getUTCFullYear(),
  };
}

/**
 * Returns true if `txDate` falls within the given anniversary cycle.
 */
export function isInCycle(txDate: Date, cycle: AnniversaryCycle): boolean {
  const t = txDate.getTime();
  return t >= cycle.cycleStart.getTime() && t <= cycle.cycleEnd.getTime();
}

/**
 * Format a cycle as a human-readable label, e.g. "Jun 15, 2025 – Jun 14, 2026"
 */
export function formatCycleLabel(cycle: AnniversaryCycle): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(cycle.cycleStart)} – ${fmt(cycle.cycleEnd)}`;
}
