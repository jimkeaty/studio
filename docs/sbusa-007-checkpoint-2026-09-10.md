# SBUSA-007 Checkpoint — Centralized Monthly Appointment Thresholds

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Director report card now evaluates **Team Appointments — This Month** with one centralized, approved threshold rule:

| Monthly appointment total | Status | Score contribution |
|---|---|---|
| Below 100 | Below Minimum | 0% |
| 100–119 | Meets Minimum | 50% |
| 120 or more | Meets Target | 100% |

The shared `src/lib/agent-development/teamAppointmentThresholds.ts` module is the sole definition of the 100 minimum and 120 target. It normalizes invalid negative totals to zero and returns a consistent actual, target, status, and score contribution.

## Source and preservation rules

The canonical source remains existing `directorDevelopmentActivities` records with `activityType: team_appointments`. The report uses the selected report-card month's total only. It does not create, modify, migrate, or delete appointment activities.

The former editable **Team Appointments / Month** field was removed from the Director Goals dialog, preventing a per-plan value from overriding the approved shared thresholds. The legacy `teamAppointments` goal field remains normalized and saved only for backward compatibility; it no longer drives display or scoring.

## Validation

| Validation step | Result |
|---|---|
| Appointment threshold behavior suite | Passed: 99, 100, 119, and 120 boundary behavior plus negative-value safety |
| Director plus SBUSA-007 source regressions | Passed: 6 tests |
| Full `pnpm run prebuild` safeguard suite | Passed: 196 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-007 files; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

This task applies to the Director's `team_appointments` activity measure, not the separate individual-agent appointment tracker or business-plan goals. The approved status bands have no configurable override by design.

## Rollback

Reverting this checkpoint restores the prior configurable appointment target display. Existing activity history is unchanged in either direction.

## Next queue action

Proceed automatically to **SBUSA-008**: add a visible Started stage after Scheduled Start; retain Scheduled Start until an actual start date or active lifecycle status verifies the start; preserve Started records until a later archive rule.
