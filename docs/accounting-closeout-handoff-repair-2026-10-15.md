# Accounting Closeout Handoff Repair — October 15, 2026

## Reported behavior

A transaction closed by Staff could be present in the canonical transaction ledger but absent from the Accounting Queue.

## Confirmed cause

The **canonical transaction** is the source of truth. The shared operational editor saves Staff, TC, Admin, and Accounting changes through `PATCH /api/admin/transactions`.

Before this repair, changing a transaction's status to `closed` in that canonical save path created or refreshed a **Staff Queue** item, but it did **not** create the transaction's `accountingCloseout` handoff. The Accounting Queue is intentionally indexed from that canonical `accountingCloseout` state.

A separate Staff Queue `approve` or `complete` action did create the Accounting handoff. That meant a Staff member could successfully save a file as Closed, leave the Staff Queue before that second action, and never have the file appear in Accounting.

## Repair

The Accounting handoff now happens as part of a successful authorized Closed-file save:

| Path | New behavior |
|---|---|
| Shared Admin/Staff/TC/Accounting editor | A canonical save that changes a file to `closed` immediately creates or repairs its Accounting handoff. |
| Direct Staff Queue save | A Staff Queue save that makes the canonical transaction Closed routes it to Accounting even before a later approve click. |
| Direct TC update | A TC update that makes the linked canonical transaction Closed routes it to Accounting. |
| TC approval | An intake approved with an already-Closed canonical transaction routes it to Accounting. |

The handoff remains **idempotent**: an already-open Accounting closeout is retained and is not duplicated. A new handoff sends the existing designated-Accounting notification only when it creates a new open closeout record.

## Safeguards retained

- Transaction data remains in the single canonical `transactions/{transactionId}` document.
- The existing Staff Queue `approve` / `complete` handoff remains as a safe fallback.
- Accounting remains list-first and opens the canonical transaction editor; no parallel Accounting transaction copy was added.
- Completed and archived Accounting cases are not silently overwritten by ordinary resaves.
- No historical transactions, Accounting records, notifications, or production data were created or changed while diagnosing this defect.

## Validation

- Accounting closeout behavior suite: **7 passed**.
- Accounting workflow and visibility regressions: **21 passed**.
- Full production build and prebuild safeguards: **280 passed**; Next.js production compilation succeeded.
- The repository-wide TypeScript check still reports existing unrelated generated/historical diagnostics, but it reports **no diagnostics in the five changed files**.

## Operational verification after rollout

1. Staff changes a transaction to **Closed** and saves it.
2. Open **Admin → Accounting**.
3. Confirm the transaction appears without needing a separate **Approve** action.
4. Refresh the Accounting Queue once; the same transaction should still appear once, not twice.
5. Confirm that the designated Accounting recipient receives the normal notification according to their saved preferences.

Do not create a disposable production transaction just for this test. Verify the next naturally closing file instead.
