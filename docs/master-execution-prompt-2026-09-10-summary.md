# Smart Broker USA Master Execution Prompt — Working Summary

**Source:** `/home/ubuntu/upload/MASTER_EXECUTION_PROMPT_—_SMART_BROKER_USA_DASHBOARD(1).docx`, read September 10, 2026. This is a working implementation summary; the original attached prompt remains authoritative.

## Operating requirements

The prompt establishes a strict first-in-first-out queue from **SBUSA-001** through **SBUSA-017**. Each task must be implemented, tested, defect-corrected, checkpointed, and only then followed by the next task. The prompt requires documented source-of-truth reuse, historical-record preservation, reversible changes, no duplicate systems, and a checkpoint containing task ID, status, changes, verification, assumptions, remaining issues, rollback, and next action. The prompt separately says not to deploy to production, change permissions, delete data, send messages, or make purchases without authorization.

## Locked cross-task business rules

| Area | Locked rule |
|---|---|
| Operational face-to-face eligibility | Only active **CGL** and **Charles Ditch** team members are eligible. SGL and other classifications are excluded. |
| Quarterly strategy meeting | A separate retention campaign for **all active agents**, regardless of team; may coexist with one operational category. |
| Operational precedence | Eligible days 1–90 agents go only to New Agent One-on-Ones. From day 91, a rolling inclusive 60-day no-production-and-no-pending test has precedence over Under One Year. Eligible agents may appear in only one operational category. |
| Report-card status | Keep approved letter thresholds only when already approved; otherwise use Below Minimum, Meets Minimum, and Meets Target or raw percentage with Threshold Not Configured. |
| Report-card pacing | Cumulative metrics use start-date-adjusted YTD pacing. Start is later of January 1 and effective start date. Goals are stored once and derived consistently. |
| Floor Time | Add as a check-in type; valid QR check-in records attendance and separately attempts an SMS notification to the configured Director of Agent Development. It must not automatically change lead routing. |
| Agent lifecycle | Active, Inactive, and Out are mutually exclusive as of the requested date. Effective inactive and departure/end dates drive historical classification. Departed/Lost is an aggregate of Inactive plus Out. |
| Agent selection | Default selectors show Active only; the Transaction Ledger explicitly includes archived agents for historical research, with lifecycle badge. |

## Initial queue

| Order | Task | Title |
|---:|---|---|
| 1 | SBUSA-001 | Audit existing logic and establish regression coverage |
| 2 | SBUSA-002 | Correct face-to-face eligibility, 60-day inactivity logic, and deduplication |
| 3 | SBUSA-003 | Simplify Recruiting and Development report cards |
| 4 | SBUSA-004 | Add monthly CGL attendance percentages |
| 5 | SBUSA-005 | Separate Recruiting Follow-Ups from New-Agent Welcome Calls |
| 6 | SBUSA-006 | Revise call-night metrics |
| 7 | SBUSA-007 | Update the monthly appointment minimum and target |
| 8 | SBUSA-008 | Add a Started stage to the recruiting Kanban pipeline |
| 9 | SBUSA-009 | Add information buttons and start-date-adjusted year-to-date pacing to report cards |
| 10 | SBUSA-010 | Add Floor Time QR check-in and notify the Director of Agent Development |
| 11 | SBUSA-011 | Archive Inactive and Out agents using effective lifecycle dates |
| 12 | SBUSA-012 | Reorganize Director of Agent Development report cards |
| 13 | SBUSA-013 | Remove face-to-face meeting sections from the dashboard |
| 14 | SBUSA-014 | Show agent names in the Inactive Agent Review staff list |
| 15 | SBUSA-015 | Simplify the Agent Performance Roster to the 90-day grace period |
| 16 | SBUSA-016 | Correct the Director’s Live Scorecard order, goals, and deltas |
| 17 | SBUSA-017 | Add Today’s Goals to the top of the agent dashboard |

## Reviewed task requirements

### SBUSA-001

Audit and document canonical sources for agent start/lifecycle/team classification, qualifying production and pending activity, meeting assignments, quarterly completion, attendance, recruiting and welcome contacts, appointments, call-night timing, report-card dates/goals/periods, agent dashboard goals and activity routes, QR architecture, floor-time schedules, Director notification route, SMS outcomes, all agent selectors, lifecycle history, scheduled and actual starts, and recruiting pipeline status. Identify duplicated calculations and add practical regression coverage. No intentional UI behavior change.

### SBUSA-002

Create one canonical meeting-eligibility calculation used by cards, detail, counts, exports, and report cards. It must enforce active CGL/Charles eligibility, all-active quarterly strategy eligibility, day 1–90 new-agent precedence, a rolling inclusive 60-day pending/production lookback, no-production precedence, and no duplicate operational assignment. Rename the user-facing no-production label to clearly say **Last 60 Days**. Required tests include boundaries, classifications, activity combinations, duplicates, missing data, and business-timezone boundaries.

### SBUSA-003

Remove routine Sales Meetings, Huddles, Role-Play, Training Sessions, and director-entered training-attendance counts from Director scoring and display while preserving the underlying events, agent attendance, history, exports, and valid uses.

### SBUSA-004

Show distinct monthly CGL training, huddle, and role-play attendance percentages based on agent-recorded attendance over eligible opportunities. Exclude before team entry and after inactive date. Show numerator, denominator, percentage, No Data where there are no eligible opportunities, and existing thresholds only when approved.

### SBUSA-005

Separate recruiting prospect contacts—including an existing test-agent classification if present—from new-agent welcome/onboarding calls. Rename terminology consistently, preserve history, and make daily/weekly/monthly recruiting follow-up goals configurable rather than invented.

### SBUSA-006

Score valid call nights per month rather than hours: 0 is Below Minimum, 1 Meets Minimum, 2+ Meets Target. A valid event is at least 180 minutes. Preserve duration data and flag short events; remove Call Night Hours from Director display/scoring.

### SBUSA-007

Use centralized appointment thresholds: minimum **100/month**, target **120/month**. Display Below Minimum under 100; Meets Minimum for 100–119; Meets Target at 120+.

### SBUSA-008

Add a visible **Started** stage after Scheduled Start. Passing a scheduled date alone retains Scheduled Start with verification warning; actual start date or active status moves the card to Started. Keep Started agents visible until a later archive rule. Validate Dylan Poncho only from canonical data.

### SBUSA-009

Use a reusable accessible information control for every applicable report-card metric. Explain definition, canonical source, period, effective start, original/native goal cadence, weekly pace, prorated YTD goal, YTD actual, catch-up/ahead, and refresh time. Centralize calculations and goal configuration, and use the start-date-adjusted YTD basis for cumulative counts.

### SBUSA-010

Floor Time becomes a QR check-in type with admin enable/disable and code display/print. A valid eligible scan records attendance, then independently attempts transactional SMS to the configured Director; check-in and delivery are separately audited. Existing attendance QR types must remain intact.

### SBUSA-011

Default Agents and ordinary selectors show Active only. Create deliberate searchable Departed/Lost archive with distinct Inactive/Out badges and dates. Active/Inactive/Out must reconcile; archive is historical and non-destructive. Transaction Ledger retains archived-agent lookup exception.

### SBUSA-012

Move Ethan’s applicable Director report cards under Production using the same card, information, goal, YTD, and delta patterns from SBUSA-009. Sections: Agent Development (new-agent one-on-ones, call nights, buyer/seller workshops, team appointments) and Recruiting Activity (recruiting workshops, YPN, networking, welcome calls, recruiting follow-ups). Do not duplicate score contribution.

### SBUSA-013

Remove dedicated face-to-face tabs, cards, sections, navigation, counts, and dependent dashboard-only links. Preserve historical meeting records and New Agent One-on-Ones as an Agent Development report-card metric.

### SBUSA-014–017

The prompt also requires: agent names in Inactive Agent Review lists; a 90-day grace-period simplification of the Agent Performance Roster; corrected Director Live Scorecard ordering/goals/deltas; and top-of-agent-dashboard Today’s Goals cards for calls, engagements, appointments-to-set, and weekly appointments-held. The final quality gate requires complete automated tests, focused manual testing, role/access validation, source-to-report reconciliation, historical-preservation review, deployment status, rollback, and a consolidated final report.
