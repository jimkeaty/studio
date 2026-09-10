# SBUSA-008 Checkpoint — Verified Recruiting Started Stage

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Recruiting Pipeline now distinguishes a planned date from an actual verified start. A candidate moves to the visible **Started** stage only when one of the following establishes verification:

| Verification evidence | Result |
|---|---|
| `actualStartDate` is a valid date on or before the business date | Started |
| Exactly one matching active `agentProfiles` record is found by a linked profile identifier or normalized candidate name | Started |
| Scheduled start date has passed, but neither verification source exists | Remains Scheduled Start with a verification warning |

The prior read-time auto-promotion based solely on a passed `expectedStartDate` was removed. The pipeline now exposes a read-only `startVerification` result so the board can render the appropriate status and warning without rewriting candidate records during a GET request.

## Interface and historical preservation

The pipeline form now has a separate **Actual Start Date** field. Future actual-start dates are rejected. Manual selection of Started is also rejected unless the route can verify an actual start date or active profile.

The Kanban now includes the **Started** stage and retains Started candidates until a deliberate archive rule is implemented later. Existing historical records already marked Started remain visible as legacy Started records even when no new verification data exists. No candidate, pipeline history event, expected start date, or lifecycle record was deleted or migrated.

When a scheduled start has passed without verification, both the Kanban card and table flag it as requiring verification rather than silently moving it. This corrects the original defect and leaves the underlying evidence auditable.

## Validation

| Validation step | Result |
|---|---|
| Start-verification behavior suite | Passed: scheduled-date warning, actual-date verification, active-profile verification, ambiguous-name safety, legacy Started retention, and future-date rejection |
| Recruiting Pipeline plus SBUSA-008 source regressions | Passed: 4 tests |
| Full `pnpm run prebuild` safeguard suite | Passed: 198 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-008 files; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

Name-based lifecycle matching is permitted only where it produces exactly one active profile. Ambiguous names never verify a Started transition. A linked `agentProfileId` is authoritative when present and should be populated by an existing onboarding or profile-linking workflow when available. This task deliberately does not introduce a bulk reconciliation of past candidates.

## Rollback

Reverting this checkpoint restores the former date-only automatic promotion behavior and removes the actual-start input and verification warnings. It does not delete any candidate, activity history, or profile data.

## Next queue action

Proceed automatically to **SBUSA-009**: establish reusable accessible metric information controls, centralize report-card calculation explanations and goal cadence, and apply start-date-adjusted YTD basis to cumulative reporting without duplicating score contribution.
