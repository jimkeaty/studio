# Operational Transaction Save Integrity Checkpoint — 2026-10-12

## Purpose

Prevent Staff, TC, Admin, and agent transaction edits from being falsely reported as saved, silently overwritten by a stale queue wrapper, or followed by an editor retry using an old transaction version.

## Confirmed problem boundaries

The prior workflow had the right core protection in several places—Firestore version preconditions—but acknowledged some successful writes using an earlier in-memory or pre-side-effect snapshot. In particular:

- The canonical Admin transaction route read its response before its TC-queue synchronization side effect could update the canonical transaction version.
- The agent route returned its request/update summary rather than the fully final canonical document.
- Direct Staff Queue and TC Queue edits could report queue success without returning a read-back canonical transaction receipt.
- A reopened TC approval could calculate from an older intake wrapper and then write it over a more recent canonical Staff/Admin transaction correction.

These were consistency and user-feedback problems. They did **not** justify silently dropping the existing Firestore concurrency protections; those protections remain required.

## Safeguards implemented

### One canonical source of truth

The `transactions/{id}` document remains the authoritative record for ledger, agent, Staff, TC, and Accounting views. Queue documents are workflow indexes and cannot become a competing financial source.

### Version-protected operational saves

- Admin, Staff, TC, and agent transaction paths retain their existing `lastUpdateTime` Firestore write preconditions when a caller supplies the loaded transaction version.
- A stale save returns a clear `409` response instructing the user to refresh, rather than overwriting a later authorized edit.
- The Admin canonical save now stores `updatedAt` as a consistent ISO value that the editor can reuse as its next version token.

### Verified save receipts

- Admin and agent transaction edits now re-read the final canonical transaction after all route side effects and return it with `persistenceVerified: true`.
- Direct Staff Queue transaction and document writes re-read the linked canonical transaction before returning success.
- Direct TC Queue edits write and verify the linked canonical transaction **before** updating the queue wrapper, then return the verified transaction when one exists.
- The unified transaction editor now treats a response without `ok`, `persistenceVerified`, and a canonical `transaction` as a failed save. It does not show a false “Changes saved” message.

### Stale TC approval prevention

When TC approves a queue item that already links to a canonical transaction, the approval uses the current canonical transaction as the calculation base rather than a stale wrapper. The final canonical approval update is guarded using the just-read Firestore version. If another authorized edit occurs first, TC receives a refresh-required conflict instead of overwriting it.

## Expected user behavior

1. Staff, TC, Admin, or an agent opens a transaction and saves an authorized correction.
2. The server applies the version-protected canonical write.
3. Any related queue synchronization is completed.
4. The server reads the final canonical document back.
5. Only then does the UI present a successful save and adopt the fresh version for the next edit.
6. If another authorized user saved first, the editor clearly asks the current user to refresh; it does not save over that newer record.

> A conflict warning is intentional protection, not a failed persistence mechanism. The system cannot safely guarantee “last click wins” without risking the loss of another authorized person’s work.

## Validation

- Focused save-integrity, TC queue lifecycle, cooperating-commission, percentage-recovery, and commission-base hydration tests passed.
- Full prebuild regression suite passed: **279/279** tests, plus the referral-income persistence test.
- Production build passed: Next.js compiled successfully and generated **297/297** static pages.
- Full `tsc --noEmit` continues to have the repository’s known baseline generated/historic diagnostics; filtering found **no diagnostics in the files changed by this checkpoint**.

## Production data boundary

No production transaction records were created, modified, approved, reopened, or corrected while implementing this safeguard. A live deployment and an authorized save/read-back verification are still required after the automatic App Hosting rollout completes.

## Rollback boundary

Revert this checkpoint commit to restore the former response behavior. Do not remove Firestore version preconditions as a workaround for save conflicts.
