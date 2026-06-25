// src/lib/config.ts
// Centralized runtime configuration (App Hosting safe)

/**
 * Comma-separated list of allowed dashboard years.
 * Example: DASHBOARD_ALLOWED_YEARS=2025
 */
export const DASHBOARD_ALLOWED_YEARS: number[] = (() => {
  const raw =
    process.env.DASHBOARD_ALLOWED_YEARS ||
    process.env.NEXT_PUBLIC_DASHBOARD_ALLOWED_YEARS ||
    '2025';

  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
})();

/**
 * Default year used when UI/API does not specify one.
 */
export const DASHBOARD_DEFAULT_YEAR: number = (() => {
  const raw =
    process.env.DASHBOARD_DEFAULT_YEAR ||
    process.env.NEXT_PUBLIC_DASHBOARD_DEFAULT_YEAR ||
    String(DASHBOARD_ALLOWED_YEARS[0] ?? 2025);

  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 2025;
})();

/**
 * The company's canonical timezone for all date-boundary calculations.
 * Using America/Chicago (CDT/CST) so that "today" rolls over at midnight
 * local time rather than midnight UTC, preventing tomorrow's goal from
 * appearing on today's dashboard when agents are active after 7 PM CDT.
 */
export const COMPANY_TIMEZONE = 'America/Chicago';

/**
 * Returns today's date string (YYYY-MM-DD) in the company timezone.
 * Use this instead of `new Date()` whenever you need the current calendar
 * date for goal proration, activity queries, or any "as-of today" logic.
 */
export function todayInCompanyTz(): { year: number; month: number; day: number; dateStr: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(new Date()); // YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day, dateStr };
}

/**
 * Returns a UTC midnight Date object for today in the company timezone.
 * This is the correct "asOf" date to use for proration calculations.
 * Rolls over at midnight America/Chicago, not midnight UTC.
 */
export function todayUtcInCompanyTz(): Date {
  const { year, month, day } = todayInCompanyTz();
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Back-compat export used by existing imports in API routes.
 * (Your /api/dashboard route imports APP_CONFIG today.)
 */
export const APP_CONFIG = {
  dashboard: {
    allowedYears: DASHBOARD_ALLOWED_YEARS,
    defaultYear: DASHBOARD_DEFAULT_YEAR,
  },
} as const;
