# SBUSA-001 Checkpoint — Audit Existing Logic and Establish Regression Coverage

**Task status:** Complete

**Queue position:** SBUSA-001 of 17

**Date:** September 10, 2026

## Changes made

1. Read the complete attached Smart Broker USA master execution prompt and recorded the locked cross-task rules and queue order in `docs/master-execution-prompt-2026-09-10-summary.md`.
2. Added `docs/sbusa-001-audit-2026-09-10.md`, documenting existing canonical collections, readers and writers, duplicated calculations, lifecycle-selector conflicts, and follow-on reuse rules.
3. Added `scripts/sbusa-001-baseline-regression.test.mjs` and registered it in `pnpm run prebuild`.

## Audit conclusions

| Area | Current source / issue | Required follow-on action |
|---|---|---|
| Operational one-on-one eligibility | Meeting records and eligibility calculations are not centralized; no-production currently uses calendar-year activity. | SBUSA-002 creates one Central-time, rolling-60-day eligibility service. |
| DAD scorecard | Routine attendance/training items and call-night hours are currently scored. | SBUSA-003, SBUSA-006, SBUSA-012, and SBUSA-016 preserve records while changing score/display treatment. |
| Agent selectors | The normal Admin selector appends inactive and out agents; legacy rollup selection lacks lifecycle filtering. | SBUSA-011 changes ordinary defaults to Active-only and keeps the Transaction Ledger archive exception. |
| Attendance and floor time | `agentAttendance` is the existing shared record, with secure floor time and event QR attendance. | SBUSA-010 extends this record with Floor Time QR and independent SMS-attempt audit; it must not introduce a second store. |
| Recruiting pipeline | A past expected start automatically becomes Started. | SBUSA-008 requires verified actual start or active status before the Started transition. |
| Goals and pacing | Recruiting and DAD goals have multiple write/read surfaces and calendar pacing. | SBUSA-009 centralizes goal definitions and start-date-adjusted pacing. |

## Verification

| Check | Result |
|---|---|
| Focused SBUSA-001 plus lifecycle, pipeline, DAD, and attendance regressions | **22/22 passed** |
| Full safeguard suite | **175/175 passed** |
| Clean production build | **Passed** |
| Typecheck | No SBUSA-001 diagnostics; existing generated route-context baseline remains |

## Assumptions and remaining risks

1. `agentProfiles` remains the canonical lifecycle source, with team membership and member plans resolved separately when a task requires team classification.
2. Historical records remain immutable by default. Later lifecycle and scorecard work must use date-effective calculations rather than rewriting prior values.
3. Some future baseline tests deliberately capture current behavior that is scheduled to change, such as auto-started pipeline candidates and inactive-agent selector inclusion. The relevant later task must replace those assertions in the same checkpoint that changes behavior.

## Rollback

This task added documentation and test coverage only. Reverting its checkpoint removes the audit documents and the baseline test registration; it does not require a data rollback.

## Next automatic action

Begin **SBUSA-002**: centralize operational one-on-one eligibility, apply the locked active CGL/Charles team rule, use an inclusive rolling 60-day production-and-pending lookback, enforce category precedence, and remove duplicate operational assignment.
