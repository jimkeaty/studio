# SBUSA-006 Checkpoint — Valid Monthly Call Nights

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Director report card now scores **Valid Call Nights — This Month** rather than total call-night hours. A valid call night is an existing `call_night` activity with recorded duration of **at least 180 minutes**.

| Valid call nights this month | Status | Score contribution |
|---|---|---|
| 0 | Below Minimum | 0% |
| 1 | Meets Minimum | 50% |
| 2 or more | Meets Target | 100% |

The former **Call Night Hours** scorecard metric and its visible goal input were removed. The legacy `callNightHours` plan field remains normalized and saved for backward compatibility, but it no longer contributes to scoring or display.

## Preserved records and review visibility

No `directorDevelopmentActivities` record was modified or deleted. Call-night duration remains stored in the existing `durationHours` field and is still required when a call night is logged.

The Activity Log now labels each recorded call night as either **Valid call night** or **Short event (under 180 minutes)**. Short events remain visible with their actual duration, but do not count toward the monthly minimum or target. This prevents data loss and makes the reason for any score difference auditable.

## Validation

| Validation step | Result |
|---|---|
| Focused Director plus SBUSA-006 regressions | Passed: 6 tests |
| SBUSA-006 source regression | Passed: valid-count threshold, short-event handling, duration preservation, and Call Night Hours exclusion |
| Full `pnpm run prebuild` safeguard suite | Passed: 194 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-006 files; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

The task's approved thresholds are one valid call night for minimum and two valid call nights for target, each evaluated within the current report-card month. Historical call-night records lacking a positive duration are preserved and correctly treated as short/non-qualifying rather than estimated.

## Rollback

Reverting this checkpoint restores the prior hour-based display and scorecard measures. It does not modify or remove historical call-night records, durations, or Director activity history.

## Next queue action

Proceed automatically to **SBUSA-007**: unify 1:1 assignment/completion rules around one canonical eligibility and completion source, preserve generated lists and history, and eliminate conflicting duplicate logic only where safe.
