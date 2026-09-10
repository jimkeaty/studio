# SBUSA-015 Checkpoint — 90-Day Grace Period Roster

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-015 simplifies the Agent Performance Roster's new-agent tracker to the **current active 90-day grace-period cohort**. The prior presentation blended day 0–90 grace monitoring with a broader day 91–365 first-year tracker. The roster now shows a clearly named **New Agent 90-Day Grace Period** section only for agents whose canonical `isGracePeriod` value is true.

The simplified section retains the operational milestones that matter during grace: days elapsed and remaining, 60-day no-pending warning, 90-day no-close warning, closed and pending deals, engagements, activity recency, View, and Notes. It uses existing grace summary counts for At Risk, No Deal Yet, and On Track.

## Preservation boundary

| Preserved element | SBUSA-015 treatment |
|---|---|
| Canonical grace data | Reuses existing `isGracePeriod`, grace elapsed/remaining days, status, and 60/90-day warnings from `/api/broker/agent-roster-metrics`. |
| First-year API fields | `isFirstYearAgent`, `trackerPriority`, and first-year summary fields remain in the response for compatibility; they are no longer used by the simplified grace display. |
| Established-agent performance | The main roster, Active—No Deals Yet list, team filters, grades, coaching notes, and plan reset actions remain intact. |
| Historical data | No agent profile, activity, transaction, plan, grade, or lifecycle record was changed or deleted. |

## Validation

| Validation step | Result |
|---|---|
| SBUSA-015 focused regression | Passed: 3 tests covering active 90-day cohort filtering, retained 60/90-day milestones, preserved canonical API fields, and established-agent views. |
| Full `pnpm run prebuild` safeguard suite | Passed: 219 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route-manifest output. |
| Typecheck | No SBUSA-015 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and rollback

The approved simplification is treated as a presentation change: day 91–365 agent data remains available in the established roster rather than being deleted or reclassified. Reverting this checkpoint restores the former first-year tracker presentation without affecting API data, lifecycle status, or historical performance.

## Next queue action

Proceed automatically to **SBUSA-016**: correct the Director Live Scorecard order, approved goals, and delta presentation without duplicate calculations or historical rewrites.
