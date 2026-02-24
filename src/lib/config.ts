// src/lib/config.ts

/**
 * Centralized application configuration.
 */
export const APP_CONFIG = {
    /**
     * An array of years for which dashboard data is allowed to be fetched.
     * This enforces the "2025-first" stabilization strategy.
     */
    ALLOWED_DASHBOARD_YEARS: [2025],

    /**
     * The default year to display on the dashboard when it first loads.
     */
    DEFAULT_DASHBOARD_YEAR: 2025,
};
