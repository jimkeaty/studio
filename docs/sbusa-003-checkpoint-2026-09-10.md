# SBUSA-003 Checkpoint — Simplified Director Report Card

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Director of Agent Development report card no longer scores or displays the following routine activity and director-entered attendance measures:

| Removed from scorecard | Removed from Goals dialog |
|---|---|
| Sales Meetings | Sales Meetings / Month |
| Team Huddles | Team Huddles / Month |
| Role Play / New Agent IDS sessions | Role Play / New Agent IDS / Month |
| Training Sessions | Training Sessions Led / Month |
| Training, huddle, role-play/IDS, and sales-meeting attendance counts | N/A |

The Director scorecard calculation now excludes these metrics before the overall score is calculated. Existing stored goal values are intentionally retained for backward compatibility; they are no longer presented as configurable Director scorecard targets.

## Systems deliberately preserved

Routine activity types remain valid in `directorDevelopmentActivities`, including `sales_meeting`, `huddle`, `role_play_ids`, and `training_session`. They remain available in the Director Activity Log and its activity selector, preserving historical records and valid administrative activity logging.

The canonical `agentAttendance` system remains unchanged. Its scheduled QR attendance, training roster, floor-time controls, historical records, attendance management views, and associated routes remain intact. The existing operational one-on-one eligibility CSV export also remains unchanged. No production data, activity history, attendance record, export path, or role permission was deleted or rewritten.

## Validation

The new registered regression `scripts/sbusa-003-director-scorecard-regression.test.mjs` verifies that routine metrics and Goals-dialog labels are absent from the Director scorecard while the raw activity types, Activity Log, and `agentAttendance` storage remain present. The existing attendance regression was narrowed only where it had required the now-approved Director attendance scorecard display; it continues to protect QR schedules, attendance views, roster controls, floor-time integrity, and routine event preservation.

| Validation step | Result |
|---|---|
| Focused Director and SBUSA-003 regression tests | Passed: 6 tests |
| Attendance and SBUSA-003 regression tests | Passed: 9 tests |
| Full `pnpm run prebuild` safeguard suite | Passed: 187 tests |
| Production build | Completed after successful compile, static-page generation, and route manifest output |
| Typecheck | No SBUSA-003 file diagnostics; repository retains the known generated Next route-context baseline |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

The scope removes **Director scoring and display** only. It does not alter required versus optional attendance definitions, QR check-in behavior, underlying event schedules, or future attendance reporting. A later queue task, SBUSA-004, is responsible for distinct monthly CGL training, huddle, and role-play attendance percentages based on agent-recorded attendance and eligible opportunities; this checkpoint does not pre-implement that reporting.

## Rollback

Reverting this checkpoint restores the prior Director scorecard metrics and Goals-dialog inputs. The rollback is code-only: routine activity and attendance records were never migrated, deleted, or modified.

## Next queue action

Proceed automatically to **SBUSA-004**: monthly CGL training, huddle, and role-play attendance percentages based on agent-recorded attendance, lifecycle/team effective dates, eligible opportunities, and approved thresholds.
