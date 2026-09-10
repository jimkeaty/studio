# SBUSA-016 Checkpoint — Director Live Scorecard

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-016 corrects the Director’s Live Scorecard inside the Agent Performance Roster. The scorecard now defaults to **canonical start date, newest first**. Ties resolve by name, while profiles without a start date appear last and display **“Missing — correct profile.”** This naturally places active first-90-day agents near the top without adding a conflicting manual grace or grade sort.

The scorecard now displays the required coaching measures for every table row:

| Measure | Actual | Goal source and period | Delta |
|---|---:|---|---|
| Engagements | Year-to-date qualifying daily activity | Existing agent plan’s daily target multiplied by the same KPI elapsed-workday clock | Actual minus goal |
| Appointments Held | Year-to-date qualifying daily activity | Existing agent plan’s daily held-appointment target multiplied by the same KPI elapsed-workday clock | Actual minus goal |
| Calls | Year-to-date qualifying daily activity | Existing agent plan’s daily calls target multiplied by the same KPI elapsed-workday clock | Actual minus goal |

The same Calls measure, actual/goal context, and delta state are available in the mobile card layout. Delta presentation is now unambiguous: **Behind By** for negative values, **On Goal** for zero, **Ahead By** for positive values, and **Goal Not Set** when the source plan truly lacks a target. No missing goal is converted into zero.

## Canonical sources and lifecycle behavior

The route continues to use `daily_activity` for actuals and the existing per-agent plan document at `dashboards/{year}/agent/{uid}/plans/plan` for goals. No additional goal store or activity calculation was created. The roster now applies the shared effective-date lifecycle classifier before rendering, so effective Inactive and Out agents are excluded while future-dated lifecycle changes do not remove an agent early.

## Validation

| Validation step | Result |
|---|---|
| SBUSA-016 focused regression | Passed: 4 tests covering start-date ordering, missing dates last, lifecycle exclusion, agent-plan Calls goals, aligned Engagements/Appointments Held goals, and clear delta labels. |
| Related roster and lifecycle safeguards | Passed: 18 tests, including agent-facing goal reconciliation, lifecycle boundaries, grace handling, and historical behavior. |
| Full `pnpm run prebuild` safeguard suite | Passed: 223 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route-manifest output. |
| Typecheck | No SBUSA-016 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and rollback

Calls uses the same KPI elapsed-workday YTD clock already used by Engagements and Appointments Held, preserving matching goal and actual periods. The former grade-first sort remains available through the table controls, but it is no longer the default order. Reverting this checkpoint restores the former presentation and omits Calls from the scorecard; it does not alter plans, daily activity, lifecycle records, or historical performance data.

## Next queue action

Proceed automatically to **SBUSA-017**: add Today’s Goals cards at the top of the logged-in agent dashboard using canonical saved goals, business-day/week boundaries, qualifying activity, remaining/ahead states, and direct tracking links.
