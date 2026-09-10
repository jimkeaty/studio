# SBUSA-002 Checkpoint — Canonical Operational 1:1 Eligibility

**Status:** Completed and validated locally on September 10, 2026.

## Canonical eligibility rule

`src/lib/agent-development/operationalMeetingEligibility.ts` is now the sole calculation for operational one-on-one eligibility in the Director of Agent Development report card. The service reads normalized active-agent and transaction inputs and assigns a qualifying operational agent to exactly one category, in this fixed order:

1. **New Agent 90 Day:** active CGL or Charles Ditch Team agent on days 1–90, inclusive.
2. **No Production or Pending in Last 60 Days:** active CGL or Charles Ditch Team agent with no qualifying closed or pending transaction dated in the inclusive 60-day Central-time window.
3. **Under One Year:** active CGL or Charles Ditch Team agent on days 91–365 with qualifying activity in the 60-day window.

The no-production category takes precedence over Under One Year. Active agents outside CGL and Charles Ditch Team do not receive an operational category. All active agents, regardless of team group, remain eligible for the separate quarterly strategy meeting requirement.

## Shared consumers

The Director report card now uses the canonical result for metrics, missing-agent detail lists, counts, and the authenticated **Export 1:1 List** CSV. The pre-existing all-active roster response remains intact for attendance and other unrelated selectors; SBUSA-002 narrows operational coaching assignments only.

## Activity definition

Closed activity is based on `closedDate` or `closingDate`. Pending activity is based on `contractDate`, `underContractDate`, or `pendingDate`. Co-agent participation counts. Duplicate transaction activity is collapsed by transaction ID. The business date defaults to Central time and the inclusive lookback begins 59 days before the as-of date.

## Validation

The executable `operational-meeting-eligibility-behavior.test.ts` covers day-90 and day-91 boundaries, no-production precedence, active CGL/Charles scope, SGL exclusion from operational categories, quarterly all-active coverage, co-agent activity, inclusive window boundaries, duplicate prevention, and the Central-time midnight boundary.

`pnpm run prebuild` and a clean production build completed successfully. Typecheck has no diagnostics in files changed for SBUSA-002; the repository retains its established generated Next route-context baseline separately.

## Rollback

Reverting this checkpoint removes the eligibility service, report-card integration, export action, and related regressions together. No production records or historical meeting assignments were rewritten by this task.

## Next queue action

Proceed automatically to **SBUSA-003** after this checkpoint is published, following the locked master execution prompt order.
