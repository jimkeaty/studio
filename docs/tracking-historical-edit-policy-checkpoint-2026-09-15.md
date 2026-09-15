# Historical Tracking Edit Policy Checkpoint — September 15, 2026

## Decision

The prior 45-day restriction on agent tracking is removed. Agents may now create, correct, move, and delete their own historical appointment tracking records for any date. The Daily Tracker also no longer displays a 45-day edit-lock notice.

## Scope

| Area | Result |
|---|---|
| Appointment creation | `/api/appointments` accepts any valid historical or future appointment date. Required appointment data remains `date`, `contactName`, and `category`. |
| Appointment correction | `/api/appointments/[id]` allows an owner to correct appointment content or move it to any date, including dates older than 45 days. |
| Appointment deletion | An owner may delete an historical appointment without a time-window rejection. |
| Daily tracker | The tracker’s obsolete `edit_window_expired` response handling and “Edits locked after 45 days” message are removed. It now states that tracking can be added or corrected for any date. |
| Preserved security | Authentication, agent ownership checks, and admin impersonation target-ownership checks remain unchanged. Removing the date window does not allow one agent to edit or delete another agent’s appointments. |

## Validation

The targeted source regression passed 3/3 checks for historical create, correction/move/delete, ownership preservation, and tracker UI messaging. The complete prebuild safeguard suite passed 247/247 tests. The production build compiled successfully and generated all 296 static pages.

The repository typecheck retains its established generated Next/historic baseline. There were no diagnostics involving the changed appointment routes, Daily Tracker page, or the new tracking-lock regression.

## Rollback

This is a policy and validation change only; it does not modify or delete historical tracking records. If the date-window policy must be restored, revert this checkpoint’s code commit. No data rewrite is needed.
