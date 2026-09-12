# Staff Closeout to Accounting Queue Handoff Repair — 2026-09-12

## Status

**Implemented, validated, and ready for publication.**

## Root Cause

The unified Staff Queue editor presents **Approve** as the staff-facing closeout action. The Accounting handoff code existed only inside the API branch for an action named **complete**. As a result, a staff user could approve a transaction whose canonical business status was already `closed`, but no `accountingCloseout` record was created and nothing appeared in the Accounting Queue.

This was a workflow mismatch, not a missing Accounting Queue: the server waited for an action the staff editor did not offer.

## Repair

For a linked transaction whose canonical status is `closed`, the Staff Queue route now sends the transaction to Accounting when either of these actions is recorded:

| Staff action | Accounting result |
|---|---|
| `approve` — the unified staff-editor closeout action | Creates the canonical Accounting Queue handoff. |
| `complete` — supported legacy/API action | Creates the same canonical Accounting Queue handoff. |

The existing `handoffClosedTransactionToAccounting` helper remains the only creator of `departmentalProcessing.accounting` and `accountingCloseout`. It is idempotent: an existing open Accounting case is not overwritten. Notification delivery is now sent only for a newly created/reopened handoff, preventing repeat approval clicks from producing duplicate Accounting notifications.

## Preserved Behavior

1. A transaction must still have the canonical business status **Closed** before entering Accounting.
2. Staff approval of non-closed files does not create an Accounting Queue case.
3. Accounting access, required-field checks, assignment, information requests, and completion controls remain unchanged.
4. No historical transactions, Accounting Queue cases, role permissions, or notifications were changed while applying this code repair.

## Validation

| Check | Result |
|---|---|
| Targeted Accounting closeout regression | Passed: 4 tests |
| Full prebuild safeguard suite | Passed: 240 tests |
| Clean production build | Passed |
| Changed-file type diagnostics | None; repository typecheck retains only the documented generated-route baseline |

## Rollback

Revert the corresponding commit. Existing Accounting Queue records are retained because the repair only changes future Staff approval/complete handoff behavior.
