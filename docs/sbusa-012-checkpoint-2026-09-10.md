# SBUSA-012 Checkpoint — Director Report Cards Under Production

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-012 reorganizes the existing Director of Agent Development scorecard as the continuation of the established Production report-card layout in **Admin Report Cards**. The single Director component now renders after the existing Unified Recruiting and Agent KPI Production report cards; its earlier top placement was removed.

The Director API now returns presentation-only `section` and `order` metadata with each existing enriched metric. It retains the single canonical `enrichedMetrics` array for actuals, goals, SBUSA-009 information panels, start-date-adjusted pacing, and overall-score calculation. Section rendering does not create a second metric collection or a second score computation.

| Production section | Existing metrics rendered once | Preservation rule |
|---|---|---|
| **Agent Development** | New Agent 1:1 coverage and other approved operational 1:1 categories, New-Agent Onboarding Follow-Ups, Valid Call Nights, Buyer & Seller Workshops, Team Appointments, and existing custom KPIs | The approved combined Buyer & Seller Workshops metric remains combined; no historical workshop data was split or reset. |
| **Recruiting Activity** | Recruiting Workshops, YPN Events Attended, Qualifying Networking Events, In-Person Relationship Meetings, New Agent Welcome Calls, and daily/weekly/monthly Recruiting Prospect Follow-Ups | Welcome calls remain separate from recruiting follow-ups and retain their distinct canonical sources from SBUSA-005. |

Both sections use the existing responsive GoalCard design, `MetricInformationButton`, configured goals, actuals, start-date-adjusted YTD display where applicable, detail/delta text, and existing grade states. The single Overall Score still averages the existing `enrichedMetrics` entries exactly once.

## Canonical sources and score ownership

No calculation, goal, history, or score ownership changed. One-on-one coverage continues to use the shared SBUSA-002 eligibility and completion logic. Call-night, appointment, attendance, recruiting follow-up, welcome-call, and report-card pacing systems remain their respective earlier canonical sources. The section taxonomy is serialized only after each existing metric is calculated and before it is rendered.

## Validation

| Validation step | Result |
|---|---|
| SBUSA-012 focused Production-layout regression | Passed: section presence, required taxonomy, shared information-card pattern, no legacy slice-based rendering, one component instance, and placement after Unified Production cards. |
| Existing Director and SBUSA-009 safeguards with SBUSA-012 coverage | Passed: 10 tests. |
| Full `pnpm run prebuild` safeguard suite | Passed: 210 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route manifest output. |
| Typecheck | No SBUSA-012 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and open items

The application has one approved combined Buyer & Seller Workshops metric, so SBUSA-012 presents it in Agent Development rather than inventing separate historical buyer and seller records. In-Person Relationship Meetings remain visible in Recruiting Activity because they support current-agent retention and external recruiting, while their established activity semantics are unchanged. Custom KPIs remain visible in Agent Development as a safe fallback rather than silently disappearing; their scoring behavior is unchanged.

## Rollback

Reverting this checkpoint removes the presentation taxonomy, responsive section layout, updated placement, and related regression coverage. It does not delete or alter report-card plans, goals, metric actuals, historical activity, one-on-one completion records, recruiting activity, or score data.

## Next queue action

Proceed automatically to **SBUSA-013**: remove dedicated face-to-face meeting sections from dashboard presentation while preserving historical meeting records and retaining New Agent One-on-Ones as an Agent Development report-card metric.
