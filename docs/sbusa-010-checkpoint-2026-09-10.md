# SBUSA-010 Checkpoint — Floor Time QR Check-In and Director Notification Audit

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

Attendance & Office Coverage now includes a **Floor Time QR Code** alongside Team Huddle, Optional Training, Optional Sales Meeting, and Role Play / New Agent IDS. Authorized users can enable or disable the code, select an active staff recipient for the Director of Agent Development notification, print the current code, and deliberately rotate it. The code is rendered through the existing QR architecture and opens the authenticated attendance screen on mobile or desktop.

A valid Floor Time QR scan requires an active authenticated agent and the current enabled code identifier. It creates an immutable `agentAttendance` presence record with canonical agent identity, local business date, `America/Chicago` timezone, QR code identifier, source, timestamp, and audit UID. It is intentionally distinct from a secure, location-verified floor-time shift: the QR presence record has zero duration and cannot create false shift credit, open a shift, or replace the existing arrival-and-departure workflow.

## Notification safety and audit behavior

The scan flow records the attendance record first, then creates a separate `attendanceNotificationAttempts` audit record. The notification recipient is an authorized configuration setting, not a hard-coded source phone number. The selected recipient is recorded by UID, display-name reference, and role reference; raw phone numbers are never returned to the interface.

The default operational message is:

> Floor Time check-in: [Agent Name] checked in at [Local Time] on [Date]. Please verify or activate floor-time leads for this agent.

The delivery wrapper reuses the existing Twilio configuration without embedding credentials in source. It records `pending`, `sent`, `delivered` when the provider reports it, or `failed`, together with provider identifier when available and a sanitized failure reason. A provider failure or absent recipient does **not** erase or duplicate the attendance record. There was no existing safe retry queue, so this checkpoint records the outcome without introducing uncontrolled retries.

Duplicate scans for the same active agent and current QR code are blocked within the new conservative **15-minute** documented deduplication window. Rotating the code produces a new identifier, so an old/reused code cannot create a valid check-in. No workflow changes lead routing automatically.

## Scope and preservation

No existing Team Huddle, Optional Training, Optional Sales Meeting, Role Play / IDS, secure Floor Time, office-location, or training-roster behavior was deleted or repurposed. The existing rule set has no Floor Time QR schedule or CGL/Charles Ditch restriction; the approved behavior therefore permits any active authenticated agent to record QR presence. Secure location verification remains the sole source for qualifying shift-duration credit.

## Validation

| Validation step | Result |
|---|---|
| Floor Time QR behavior suite | Passed: 15-minute deduplication boundary, agent/code identity separation, and secure-shift source separation |
| Existing attendance plus SBUSA-010 source regressions | Passed: 10 tests |
| Full `pnpm run prebuild` safeguard suite | Passed: 203 tests |
| Production build | Completed after successful compile, 296 static-page generation, and route manifest output |
| Typecheck | No diagnostics in SBUSA-010 files; the repository retains the known generated Next route-context baseline separately |
| Working-tree integrity | `git diff --check` passed; generated build stamp restored |

## Rollback

Reverting this checkpoint removes the Floor Time QR settings, scan action, recipient configuration, notification audit records for future scans, and UI controls. It leaves historical attendance records, secure floor-time shifts, existing QR attendance data, and office location settings intact.

## Next queue action

Proceed automatically to **SBUSA-011**: archive Inactive and Out agents using effective lifecycle dates, remove them from active selectors and current operational reporting, and preserve immutable historical lookup and transaction references.
