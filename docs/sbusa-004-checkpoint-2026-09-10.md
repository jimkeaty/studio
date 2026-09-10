# SBUSA-004 Checkpoint — Monthly CGL Attendance Percentages

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

Attendance Management now displays separate monthly **Optional Training**, **Team Huddle**, and **Role Play / New Agent IDS** CGL attendance measures. Each measure shows the attendance numerator, eligible-opportunity denominator, raw percentage, and eligible CGL-agent count. If no eligible opportunity exists, the display shows **No Data** rather than assigning a zero percentage or a grade.

No attendance threshold was invented. Every populated measure explicitly states **Threshold not configured** until an approved threshold is separately defined. This keeps monthly attendance reporting distinct from Director scoring.

## Canonical calculation

The shared `src/lib/attendance/cglMonthlyAttendance.ts` calculation reads only existing records:

| Input | Canonical source | Use in calculation |
|---|---|---|
| CGL classification and lifecycle status | `agentProfiles` | Includes current `teamGroup: cgl`; applies the lifecycle cutoff only for an inactive/out lifecycle state. |
| CGL team-entry and exit dates | `teamMemberships` | Uses the matching `primaryTeamId` membership's `effectiveStart` and optional `effectiveEnd`. |
| Scheduled opportunities | `SCHEDULED_ATTENDANCE_EVENTS` | Counts Tuesday/Thursday huddles and training, plus Wednesday role-play/IDS, through the current Central business date. |
| Attendance numerator | `agentAttendance` | Counts a recorded attendance once per eligible agent, event type, and date; duplicate QR/roster records cannot inflate the numerator. |

An agent is eligible only from the later of the month start, brokerage start, and CGL membership effective start. The calculation excludes all dates after an effective inactive, departure, or membership-end date. It does not silently infer a missing CGL entry date from profile edits. Instead, the affected profile is excluded and Attendance Management shows a data-quality notice, preserving the integrity of the percentage.

## User interface and preserved behavior

The reporting surface is **Attendance & Office Coverage**, not the Director report card. The new authenticated `GET /api/broker/cgl-attendance?month=YYYY-MM` route is read-only and does not modify profiles, memberships, attendance records, permissions, or existing exports.

Training rosters, QR check-ins, schedules, agent attendance history, floor-time controls, and the Director Activity Log remain intact. The training-roster checkbox was relabeled from a false claim of scorecard credit to its actual behavior: adding the training session to the Director Activity Log. SBUSA-003's exclusion of routine attendance from Director scoring remains in force.

## Validation

| Validation step | Result |
|---|---|
| CGL eligibility behavior test | Passed: team-entry exclusion, lifecycle and membership-end cutoffs, duplicate suppression, No Data, and threshold neutrality |
| SBUSA-003/004 source regressions | Passed: canonical collection use, numerator/denominator/percentage display, No Data, no invented threshold, and no reintroduced Director attendance scoring |
| Full `pnpm run prebuild` safeguard suite | Passed: 190 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-004 files after correction; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

The calculation uses the existing `teamMemberships.effectiveStart` as the authoritative CGL team-entry date. A current CGL profile with no matching membership or no effective start is intentionally excluded rather than estimated. Historical reporting for agents who are no longer classified as CGL is not inferred from a current non-CGL profile; the task is a current CGL monthly attendance report and preserves historical raw attendance records for future history-aware reporting.

## Rollback

Reverting this checkpoint removes the read-only summary route, shared calculation, Attendance Management display, and its regressions. No historical attendance, profile, team-membership, activity, or configuration record was migrated, deleted, or changed.

## Next queue action

Proceed automatically to **SBUSA-005**: separate recruiting prospect follow-ups from new-agent welcome/onboarding calls while preserving history and making recruiting follow-up goals configurable rather than invented.
