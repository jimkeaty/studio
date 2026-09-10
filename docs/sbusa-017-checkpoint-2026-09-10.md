# SBUSA-017 Checkpoint — Today’s Goals

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

The agent dashboard now places **Today’s Goals** immediately after the hero area and before secondary analytics. The responsive section contains exactly four cards:

| Card | Goal period | Actual source | Goal source |
|---|---|---|---|
| Calls to Make Today | Central business day | Canonical `daily_activity` range response | Saved plan `calculatedTargets.calls.daily`, with a saved weekly target converted only when the daily field is absent |
| Engagements for Today | Central business day | Canonical `daily_activity` range response | Saved plan `calculatedTargets.engagements.daily`, with the same safe weekly fallback |
| Appointments to Set Today | Central business day | Canonical merged `daily_activity` and appointment-pipeline range response | Saved plan `calculatedTargets.appointmentsSet.daily`, with the same safe weekly fallback |
| Appointments Held This Week | Monday through the current Central business date | Canonical merged `daily_activity` and held appointment-pipeline range response | Saved plan `calculatedTargets.appointmentsHeld.weekly`, with a saved daily target converted only when weekly is absent |

Each card shows Goal, Completed, and a truthful remaining/ahead state. Remaining never becomes negative. A configured zero remains a configured zero; an unavailable target is labeled **Goal Not Set**, not silently substituted with zero. Direct action links point to the existing Activity Tracker. A successful canonical daily-activity save emits a browser refresh event so the cards update without requiring a page reload.

## Preservation and scope

This task adds presentation and reads only. It does not create a competing activity store, alter business-plan goals, change appointment pipeline records, alter commission calculations, or send any message. The pre-existing Today’s Focus helper remains in the source for backward compatibility but is no longer mounted on the dashboard; the mounted top-level experience is the new canonical Today’s Goals section.

## Validation

| Validation step | Result |
|---|---|
| Focused SBUSA-017 regression | Passed: 4 tests for top placement, Central day/week boundaries, four-card coverage, goal-state behavior, canonical APIs, and refresh signal. |
| Typecheck | No SBUSA-017 changed-file diagnostics. Repository retains only its documented generated Next route-context baseline. |
| Full `pnpm run prebuild` safeguard suite | Passed: 227 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route-manifest output. |
| Working-tree integrity | Generated build stamp restored and `git diff --check` passed before publication. |

## Rollback and manual follow-up

Reverting this checkpoint removes the new dashboard component and refresh event without modifying goals or activity history. Recommended manual follow-up, not performed here because the queue disallows deliberate production operations without explicit authorization, is to sign in as an active agent, verify all four cards against that agent’s saved plan and Activity Tracker, record an activity, and confirm the card refreshes and the direct links land on the tracker.

## Next action

SBUSA-017 is the final task in the approved SBUSA-001 through SBUSA-017 queue. The consolidated completion report is documented in `docs/sbusa-master-queue-completion-2026-09-10.md`.
