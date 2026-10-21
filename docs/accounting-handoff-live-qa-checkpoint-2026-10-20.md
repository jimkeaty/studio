# Staff-to-Accounting Live QA Checkpoint — 2026-10-20

## Purpose

Validate the production two-checkpoint closeout workflow without touching a customer transaction:

1. A closed transaction must remain in the Staff Queue until Staff approves it.
2. Staff approval must create the canonical Accounting closeout record atomically.
3. Accounting must be able to review and complete the file while the transaction itself remains `Closed`.
4. The normal designated-Accounting notification path must be dispatched according to the recipient's notification preferences.

## Production Build Under Test

- **Commit:** `59ac8b5` — `fix: await accounting closeout notifications`
- **Live build marker:** `59ac8b5-master`
- **Release method:** normal automatic Firebase App Hosting rollout from `main`; no manual deployment was used.

## Controlled QA Record

- **Canonical transaction ID:** `H6vUOLK5Yr6cpoFFHsNg`
- **Label:** `QA Accounting Handoff Test - Oct 20, 2026`
- **Customer data:** none; the client name was explicitly a do-not-contact QA placeholder.
- **Financial values:** zero-dollar internal test only.

## Live Results

| Checkpoint | Result | Evidence |
|---|---|---|
| Normal TC intake | Passed | The QA record was created through the production TC intake path. |
| TC approval | Passed | The record reached its required closed-file Staff Queue checkpoint. |
| Staff approval → Accounting | Passed | The Staff Queue API returned HTTP 200 with `accountingHandoff.verified: true` and Accounting status `new`. |
| Accounting Queue visibility | Passed | The live Accounting Queue visibly listed the QA record as a **Closed** transaction ready for Accounting review. |
| Canonical QA field save | Passed | The Admin update route returned `persistenceVerified: true` after the three QA-only completion fields were saved. |
| Accounting approval | Passed | The Accounting API returned HTTP 200 and status `completed`; the canonical transaction remained `closed`. |
| QA cleanup | Passed | The QA record was archived with an explicit reason. It no longer appears in active Accounting views and remains recoverable in the archive-only ledger view. |

The only initially missing Accounting fields were the QA close date, zero transaction fee, and in-house answer. They were set only on the QA record before Accounting completion. No customer transaction was edited.

## Notification Result and Boundary

The repaired Staff approval route now awaits the Accounting notification dispatcher before returning its success response. It records a dispatch receipt only after the dispatcher finishes:

- `accountingCloseout.notificationPending`
- `accountingCloseout.notificationDispatchedAt`
- `accountingCloseout.notificationRecipientCount`

The QA retry found one designated Accounting recipient with a linked Firebase user profile. The normal alert dispatch completed and the canonical record stored a dispatch receipt for one recipient.

However, that recipient's **global in-app notification preference is disabled**. Therefore no bell/in-app notification was expected or written, even though the normal dispatch ran. This is a configuration preference, not a Staff-to-Accounting queue failure.

If the Accounting user should receive bell notifications, they must enable **In-app notifications** under **My Preferences → Notification Settings**. Email and SMS remain independently controlled by their own preferences and provider availability; this QA check did not claim delivery on either external channel.

## Implementation Safeguards

- A closed file enters Accounting only through the required Staff Queue approval checkpoint.
- The Staff Queue approval update, canonical Accounting handoff, and handoff audit event are written in one Firestore transaction. A failed transaction leaves both sides unchanged.
- A successful Staff handoff cannot report completion while its Accounting closeout is missing.
- The Accounting Queue reads the canonical `transactions/{transactionId}.accountingCloseout` state; it is not a competing transaction copy.
- Accounting completion changes departmental Accounting status only. It does **not** alter the transaction's business status from `Closed`.
- Test coverage includes atomic commit/rollback behavior, closed-file gating, status normalization, queue visibility, field completeness, and awaited notification dispatch.

## Validation Performed

- Focused Accounting workflow and notification regression suites: passed.
- Production build: passed.
- Full project typecheck remains non-zero because of pre-existing unrelated repository diagnostics; the changed Accounting files introduced no relevant TypeScript diagnostics.
- Live production API and visible queue checks: passed.
