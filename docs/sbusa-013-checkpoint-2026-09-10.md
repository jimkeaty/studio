# SBUSA-013 Checkpoint — Remove Face-to-Face Meeting Dashboard Sections

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-013 removes the dedicated **Face-to-Face Meetings** tab from Recruiting & Agent Development. The dashboard no longer imports or renders the `FaceToFaceRecruitingMeetings` component, its tab value, card, counts, goals dialog, history table, or dashboard-only component link. The tab layout is reduced from five to four columns so the remaining controls retain usable desktop and mobile spacing.

## Preservation boundary

This is strictly a dashboard-presentation removal. The following historical systems remain in place and were not deleted, rewritten, or disabled:

| Preserved system | Reason retained |
|---|---|
| `/api/broker/face-to-face-meetings` | Continues to read canonical recruiting-plan goals and historical meeting records. |
| `FaceToFaceRecruitingMeetings` component | Retains the historical record view and audit-preserving implementation rather than destroying records or code paths. |
| `directorDevelopmentActivities` records | Face-to-face records continue to preserve the `in_person_relationship_meeting` activity type and existing activity history. |
| `recruitingPipelineActivity` linked follow-ups | Existing follow-ups retain `sourceFaceToFaceMeetingId`, date, and action provenance. |
| New Agent 1:1s | Continue as `weekly_new_agent_one_on_ones` in the SBUSA-012 Agent Development report-card section using the shared operational eligibility calculation. |

No face-to-face meeting record, recruiting plan, goal history, pipeline activity, one-on-one completion, or report-card history was removed.

## Validation

| Validation step | Result |
|---|---|
| Existing face-to-face plus focused SBUSA-013 regressions | Passed: 7 tests covering dashboard removal, route/component preservation, recruiting-plan history, linked pipeline history, and retained New Agent 1:1 metric. |
| Full `pnpm run prebuild` safeguard suite | Passed: 213 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route-manifest output. |
| Typecheck | No SBUSA-013 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and open items

The task explicitly required removing dashboard presentation while preserving historical records. Therefore the dormant historical component and authenticated route remain intentionally available in source, but no dashboard navigation reaches them. This avoids destructive deletion and supports later read-only migration or audit needs without recreating data.

## Rollback

Reverting this checkpoint restores the dedicated Face-to-Face Meetings tab, import, and component placement. It does not affect the preserved API, historical meetings, plan-goal history, linked pipeline activities, or New Agent 1:1 scorecard metric.

## Next queue action

Proceed automatically to **SBUSA-014**: show agent names in the Inactive Agent Review staff list using canonical lifecycle data while preserving archive behavior and historical records.
