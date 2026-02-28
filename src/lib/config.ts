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
 * Back-compat export used by existing imports in API routes.
 * (Your /api/dashboard route imports APP_CONFIG today.)
 */
export const APP_CONFIG = {
  dashboard: {
    allowedYears: DASHBOARD_ALLOWED_YEARS,
    defaultYear: DASHBOARD_DEFAULT_YEAR,
  },
} as const;
