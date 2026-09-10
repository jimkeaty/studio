# SBUSA-005 Checkpoint — Recruiting Follow-Ups and New-Agent Onboarding Separation

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The Director of Agent Development report card now treats two workflows as distinct:

| Workflow | Canonical records | Report-card treatment |
|---|---|---|
| Recruiting prospect follow-ups | `recruitingPipelineActivity` entries of type `call`, `email`, `text`, or `meeting` | Separate Today, This Week, and This Month metrics with independently configurable daily, weekly, and monthly goals. |
| New-agent welcome and onboarding activity | `directorDevelopmentActivities` entries of type `new_agent_welcome_call` and `new_agent_follow_up` | Separate New Agent Welcome Calls and New-Agent Onboarding Follow-Ups metrics. |

The pipeline-history count deliberately does not filter by a candidate's current pipeline stage. Completed contacts remain countable for every valid candidate record, including any legacy test-agent-style classifications that may exist in historical pipeline data. No test-agent classification was found in the current supported pipeline-status list, so no new status or duplicate store was introduced.

## Configurable goals

The Goals dialog now exposes **Recruiting Prospect Follow-Ups / Day**, **/ Week**, and **/ Month**. Each defaults to zero, which leaves the metric visible but unscored until an approved target is configured. This implements configurability without inventing a prospecting standard.

The existing new-agent follow-up label was clarified to **New-Agent Onboarding Follow-Up**. Its data type and historical records remain unchanged. The Director Activity Log continues to accept and display both welcome calls and onboarding follow-ups, while recruiting prospect contacts continue to be entered through the Recruiting Pipeline activity workflow.

## Preserved history and behavior

No recruiting candidate, pipeline activity, Director activity, welcome call, onboarding follow-up, or goal record was migrated, reclassified, deleted, or duplicated. The pipeline activity route still updates the candidate's existing `lastContactedAt` and next-follow-up fields. The report-card change is read-only aggregation of the established source systems.

## Validation

| Validation step | Result |
|---|---|
| Focused Director plus SBUSA-005 regressions | Passed: 6 tests |
| SBUSA-005 source regression | Passed: prospect/contact source separation, configured goals, and preserved welcome/onboarding labels |
| Full `pnpm run prebuild` safeguard suite | Passed: 192 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-005 files; repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Assumptions and open issues

The established `recruitingPipelineActivity.createdAt` timestamp represents the completed prospect contact date because the existing activity record does not have a separate occurred-on field. This checkpoint counts only calls, emails, texts, and meetings; notes and stage-change events are preserved but do not inflate follow-up metrics. The report operates over the selected report-card year and Central-time report period already used by the Director card.

## Rollback

Reverting this checkpoint removes only the new read-only aggregation, goal fields, labels, and regression coverage. It does not alter the Recruiting Pipeline or Director activity histories.

## Next queue action

Proceed automatically to **SBUSA-006**: score valid call nights per month rather than call-night hours, preserve duration and flag short events, and remove Call Night Hours from Director display/scoring.
