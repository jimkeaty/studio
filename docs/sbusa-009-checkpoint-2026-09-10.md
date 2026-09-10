# SBUSA-009 Checkpoint — Accessible Metric Information and Start-Date-Adjusted Pacing

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Director of Agent Development report card now returns a centralized information model for every displayed metric. Each card displays a keyboard- and touch-operable information button with an accessible name. Activating it opens the same reusable dialog pattern and exposes the metric definition, canonical records, evaluation basis, effective start, as-of date, original goal and cadence, weekly pace where meaningful, year-to-date goal and actual, Catch-Up Needed, Ahead By, and last-updated time.

Metrics with no configured goal show **Goal Not Configured** and remain excluded from goal-based scoring. Snapshot, percentage, and threshold measures show **Not Applicable** for pace fields that would be misleading rather than inventing a delta.

## Effective start and pace rules

The Director Goals dialog now lets authorized Administrator/Staff users edit the report-card effective start date through the existing authorized plan-save route. The server validates the date, rejects future or malformed values, and appends a bounded audit entry containing the prior value, next value, timestamp, and editor UID when the setting changes.

The effective measurement start is the later of January 1 for the selected report year and the configured effective start. Pre-effective-start one-on-one completions, Director activity, and Recruiting Pipeline contact activity remain in their historical stores and Activity Log, but are excluded from scorecard calculations. The full historical activity payload remains available for audit display.

For cumulative count metrics, the card now uses full-precision, start-date-adjusted YTD actual versus a prorated annualized target as its primary score basis. The original monthly cadence remains the canonical configuration and is displayed in the information dialog. Weekly pace derives from that native cadence. Catch-up is never negative; a metric ahead of pace shows **Ahead By** instead.

## Validation

| Validation step | Result |
|---|---|
| Start-date pacing behavior suite | Passed: January and prior-year start handling, midyear prorating, leap-year boundary, missing goals, malformed/future dates, behind, exact-boundary, and ahead values |
| Director plus SBUSA-009 source regressions | Passed: 6 tests |
| Full `pnpm run prebuild` safeguard suite | Passed: 200 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-009 files; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Preserved records and scope boundary

No `directorDevelopmentActivities`, `recruitingPipelineActivity`, `oneOnOnes`, agent profile, or recruiting-plan history was deleted, migrated, or rewritten. This checkpoint applies the reusable information and pacing model to the Director report card currently in the queue. Future report-card work can consume the reusable information component and shared pace helper without duplicating calculations or score contribution.

## Rollback

Reverting this checkpoint removes the explanatory dialog, effective-start configuration and audit history, and start-adjusted pacing output. Historical activity and goal records remain intact.

## Next queue action

Proceed automatically to **SBUSA-010**: add Floor Time as a QR check-in type with admin enable/disable and display/print controls; record eligible scans, attempt separately audited Director SMS notification, and preserve all existing attendance QR types.
