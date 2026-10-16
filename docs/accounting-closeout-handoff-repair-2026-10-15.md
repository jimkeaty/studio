# Staff Approval → Accounting Handoff Policy — October 15, 2026

## Reported behavior

A transaction closed by Staff could be present in the canonical transaction ledger but absent from the Accounting Queue.

## Confirmed workflow

The **canonical transaction** is the source of truth. The shared operational editor saves Staff, TC, Admin, and Accounting changes through `PATCH /api/admin/transactions`.

Changing a transaction's status to `closed` in the canonical save path creates or refreshes its **Staff Queue** item. It does **not** create the transaction's `accountingCloseout` record yet. The Accounting Queue is intentionally indexed from that canonical `accountingCloseout` state.

A separate, deliberate **Staff Queue `approve`** action creates the Accounting handoff. This is a required workflow gate—not a missing save.

## Required two-checkpoint flow

The authoritative flow is:

| Checkpoint | Required action | Result |
|---|---|
| 1. Staff review | A file is saved as **Closed**, then Staff opens it from the Staff Queue, checks it, and selects **Approve**. | Only this Staff approval creates the Accounting handoff. |
| 2. Accounting review | Accounting opens the item from the Accounting Queue, verifies payout/check details, and edits the canonical transaction if needed. | Accounting selects **Save & complete Accounting** only when the file is correct. |

The Staff approval handoff remains **idempotent**: an already-open Accounting closeout is retained and is not duplicated. A new Staff-approved handoff sends the existing designated-Accounting notification only when it creates a new open closeout record.

## Safeguards retained

- Transaction data remains in the single canonical `transactions/{transactionId}` document.
- A Closed save alone cannot bypass the Staff checkpoint.
- TC, Admin, and Accounting saves cannot directly bypass the Staff checkpoint into Accounting.
- Staff **Approve** is the only release action from a Closed Staff Queue item to Accounting.
- Accounting remains list-first and opens the canonical transaction editor; no parallel Accounting transaction copy was added.
- Completed and archived Accounting cases are not silently overwritten by ordinary resaves.
- No historical transactions, Accounting records, notifications, or production data were created or changed while diagnosing this defect.

## Validation

- Validate this policy with the targeted Accounting closeout behavior and workflow regression suites, followed by the production build safeguards.

## Operational verification after rollout

1. Staff changes a transaction to **Closed** and saves it.
2. Confirm the transaction appears in the **Staff Queue** and does **not** appear in Accounting yet.
3. Staff opens the Staff Queue item, verifies the file, and selects **Approve**.
4. Confirm the transaction appears once in **Admin → Accounting**.
5. Accounting opens the canonical editor, makes any necessary changes, then selects **Save & complete Accounting** only when review is complete.
6. Confirm that the designated Accounting recipient receives the normal notification after the Staff approval handoff.

Do not create a disposable production transaction just for this test. Verify the next naturally closing file instead.
