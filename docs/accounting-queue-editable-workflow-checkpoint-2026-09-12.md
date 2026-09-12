# Accounting Queue Editable Workflow Checkpoint — September 12, 2026

## Authorized Operating Decision

Jim requested that the Accounting Queue become a transaction list rather than a set of expanded read-only cards. An authorized Accounting, Staff, TC, or Admin user must be able to select a queue transaction, open the established full transaction editor, correct commission or other transaction data, save through the canonical version-safe transaction route, and then complete the Accounting closeout. Jim also directed that manual **Take case** and case-assignment behavior be removed, while new closeout notifications go to Lainie Harrington as the designated Accounting user and remain subject to her notification preferences.

## Implemented Design

| Area | Change |
|---|---|
| Queue presentation | Replaced expanded, read-only queue cards with a searchable Accounting transaction table. It displays the address, client(s), agent(s), lead source, close date, sale price, GCI, Agent Take Home, status, missing-required-field indicator, and an **Open & edit** action. |
| Transaction editing | Each row opens `/dashboard/transactions/new?edit={transactionId}&accountingCloseout=1`, which is the existing full transaction editor and canonical Admin/Staff/TC save path. It retains source-aware splits, explicit manual overrides, flat-dollar GCI, team snapshots, pass-through treatment, document persistence, and stale-version protection. |
| Completion | Accounting mode provides **Save changes** and **Save & complete Accounting**. Completion is attempted only after the canonical save succeeds; required closeout values cannot be bypassed. An editable `isInHouse` field was added because Accounting completion requires it and it previously was not editable in the form. |
| Access | Active Accounting, Staff, TC, TC Admin, and Office Admin users can access the Accounting workflow. Agents remain blocked from closed-file editing. Staff and TC can now open a selected closed Accounting transaction without being limited by agent ownership checks. |
| Assignment | Removed exposed manual case-taking and assignment actions. The transaction remains one shared closeout record rather than becoming a user-owned case. |
| Notification | Added one configurable designated Accounting recipient setting in **Staff & Users**. Only an active Accounting user can be selected. New handoffs call the designated-recipient resolver and the dispatcher still honors the recipient’s in-app, email, SMS, and event preferences. The legacy active Accounting/Office Admin recipient group remains only as a safety fallback if no designation exists. |

## Validation

| Check | Result |
|---|---|
| Focused source regressions | 15/15 passed, including queue visibility, list-to-editor navigation, no-manual-assignment, staff/TC authorization, in-house completion field, and designated-recipient controls. |
| Full prebuild safeguard suite | 244/244 tests passed. |
| Production build | Passed. The build compiled successfully and generated all 296 static pages. |
| Typecheck | Retains the established nonzero baseline from generated Next route-context/historic diagnostics. The only matched line concerned the pre-existing `staff-users/[userId]/relink` generated route type; there were no diagnostics for the changed Accounting Queue, full editor, recipient helper, transaction route, or staff-user setting implementation. |

## Production Configuration After Rollout

The live Staff User record for **Lainie Harrington** was verified read-only as an active `accounting` user with a linked Firebase account. After the published build becomes live, set `receivesAccountingCloseoutNotifications` to `true` only on Lainie’s existing Staff & Users record. That operation configures the designated notification recipient; it does not send a test notification, change any transaction, or assign any Accounting case.

## Boundaries and Rollback

This change does not close, reopen, take, assign, or alter `123 Main Test` or any other Accounting case. It makes its already-persisted New case accessible through the correct workflow. Rollback is a code revert of this checkpoint’s commit; it does not require rewriting canonical transactions. If needed, removing the designation flag restores the existing active Accounting/Office Admin notification fallback without affecting closeout records.
