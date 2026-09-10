export type GoalCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'snapshot' | 'threshold';

export type StartDatePacing = {
  effectiveStartDate: string;
  asOfDate: string;
  nativeGoal: number | null;
  nativeCadence: GoalCadence;
  weeklyPace: number | null;
  ytdGoal: number | null;
  ytdActual: number | null;
  catchUpNeeded: number | null;
  aheadBy: number | null;
  pct: number | null;
};

function parseYmd(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function ymd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysInclusive(start: string, end: string) {
  return Math.max(0, Math.floor((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000) + 1);
}

export function resolveReportCardEffectiveStart(year: number, configuredStartDate: string | null | undefined, asOfDate: string) {
  const yearStart = `${year}-01-01`;
  const candidate = typeof configuredStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(configuredStartDate)
    ? configuredStartDate
    : yearStart;
  return candidate > yearStart ? candidate : yearStart;
}

/**
 * Converts a monthly cumulative goal into a full-precision start-date-adjusted
 * target. Snapshot, threshold, and unconfigured metrics intentionally return
 * Not Applicable fields rather than inventing an artificial pace.
 */
export function calculateStartDatePacing(input: {
  year: number;
  configuredStartDate?: string | null;
  asOfDate: string;
  actual: number;
  nativeGoal: number | null | undefined;
  nativeCadence: GoalCadence;
  cumulative: boolean;
}): StartDatePacing {
  const effectiveStartDate = resolveReportCardEffectiveStart(input.year, input.configuredStartDate, input.asOfDate);
  const validGoal = Number(input.nativeGoal);
  const nativeGoal = Number.isFinite(validGoal) && validGoal > 0 ? validGoal : null;
  const normalizedActual = Math.max(0, Number.isFinite(input.actual) ? input.actual : 0);

  if (!input.cumulative || !nativeGoal || effectiveStartDate > input.asOfDate) {
    return {
      effectiveStartDate,
      asOfDate: input.asOfDate,
      nativeGoal,
      nativeCadence: input.nativeCadence,
      weeklyPace: nativeGoal && input.nativeCadence === 'monthly' ? nativeGoal * 12 / 52 : null,
      ytdGoal: null,
      ytdActual: null,
      catchUpNeeded: null,
      aheadBy: null,
      pct: null,
    };
  }

  const annualGoal = input.nativeCadence === 'monthly'
    ? nativeGoal * 12
    : input.nativeCadence === 'weekly'
      ? nativeGoal * 52
      : input.nativeCadence === 'annual'
        ? nativeGoal
        : null;
  if (!annualGoal) {
    return {
      effectiveStartDate,
      asOfDate: input.asOfDate,
      nativeGoal,
      nativeCadence: input.nativeCadence,
      weeklyPace: null,
      ytdGoal: null,
      ytdActual: null,
      catchUpNeeded: null,
      aheadBy: null,
      pct: null,
    };
  }

  const daysInYear = daysInclusive(`${input.year}-01-01`, `${input.year}-12-31`);
  const elapsedDays = daysInclusive(effectiveStartDate, input.asOfDate);
  const ytdGoal = annualGoal * (elapsedDays / daysInYear);
  const difference = normalizedActual - ytdGoal;
  return {
    effectiveStartDate,
    asOfDate: input.asOfDate,
    nativeGoal,
    nativeCadence: input.nativeCadence,
    weeklyPace: input.nativeCadence === 'monthly' ? nativeGoal * 12 / 52 : input.nativeCadence === 'weekly' ? nativeGoal : null,
    ytdGoal,
    ytdActual: normalizedActual,
    catchUpNeeded: Math.max(0, -difference),
    aheadBy: Math.max(0, difference),
    pct: ytdGoal > 0 ? (normalizedActual / ytdGoal) * 100 : null,
  };
}

export function isValidReportCardEffectiveStart(value: unknown, year: number, asOfDate: string) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value <= asOfDate && ymd(parseYmd(value)) === value && value <= `${year}-12-31`;
}
