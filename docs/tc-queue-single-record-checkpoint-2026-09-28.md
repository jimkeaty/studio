# TC Queue — Single Record Per Transaction Checkpoint

**Date:** 2026-09-28  
**Scope:** Prevent duplicate TC Queue rows when a TC-managed transaction is edited; reopen an approved file for review and put it at the top of the queue.

## Business rule implemented

- Each canonical transaction has **one durable TC workflow record**.
- An agent edit of a TC-managed transaction updates that existing queue record; it does not append another queue row.
- If the existing TC record was `approved`, `rejected`, or `archived`, the edit changes its workflow state to `submitted`, marks it as reopened, and updates its queue activity time so it sorts to the top.
- The original `submittedAt` history, TC assignment, and checklist completion state are preserved. The review marker is cleared because the changed file needs a new review.
- Authorized Admin/Staff corrections use the same lifecycle. Direct administrative TC submissions linked to a transaction also refresh the existing wrapper.
- New TC-managed transactions now use their canonical transaction ID as the TC intake ID, preventing future parallel wrapper creation.

## Historic duplicate handling

No existing Firestore data was deleted, merged, or bulk rewritten.

The TC Queue read API now groups legacy wrappers by canonical transaction ID and returns one row for the active/current workflow. It favors the highest workflow state (`submitted` then `in_review`) and then current activity, so an old approved wrapper does not appear alongside a reopened record in the active queue.

## User-visible change

The TC Queue table labels the timing column **Last Changed**. It sorts by the most recent queue activity, and reopened files display **Reopened for review**.

## Files changed

- `src/lib/transactions/tcQueueLifecycle.ts`
- `src/app/api/agent/transactions/[txId]/route.ts`
- `src/app/api/admin/transactions/route.ts`
- `src/app/api/admin/tc/route.ts`
- `src/app/api/tc/route.ts`
- `src/app/dashboard/admin/tc/page.tsx`
- `scripts/tc-queue-lifecycle-behavior.test.ts`
- `scripts/tc-queue-routing-regression.test.mjs`
- `package.json`

## Validation

- Behavioral lifecycle test: passed. It verifies an approved record reopens without creating a second wrapper, while preserving assignment, original submission time, and checklist progress.
- TC queue routing regression: 7/7 passed.
- Focused transaction persistence/form regressions: passed (52 assertions total).
- Full production build: passed.
- Prebuild suite: **252/252 passed**.
- Changed-file TypeScript diagnostics: none. Repository-wide `tsc --noEmit` still reports the known pre-existing generated-route typing errors; it is not treated as a clean global typecheck.

## Production boundary

No production transaction, TC checklist, assignment, or notification was altered during validation. Release visibility must be confirmed after the normal repository-triggered App Hosting rollout completes.
