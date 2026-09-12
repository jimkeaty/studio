# 123 Main Test — Accounting Closeout Validation Checkpoint

## Scope and authorization

Jim Keaty authorized one production workflow test for **Madelyn Lamartiniere’s `123 Main Test`** transaction only. The authorized operation was to move the transaction from Pending to Closed, approve its linked Staff Queue item, and verify that the same canonical transaction enters Accounting. No other transaction, commission plan, team plan, or Accounting case was changed for this checkpoint.

| Record | Identifier | Result |
|---|---|---|
| Canonical transaction | `i3QKmQYYXqumF18Rn64c` | Closed on 2026-09-12 |
| Linked Staff Queue item | `019HmfszQtTgaiHBmr45` | Approved |
| Accounting workflow | Nested `accountingCloseout` on the canonical transaction | Created exactly once with status `new` |

## Verified production workflow

The production transaction was saved with normalized `dealSource=boomtown`, GCI of $9,000, a 60% agent / 40% brokerage split, a $395 agent-paid fee, and $5,005 Agent Take Home. The live UI had already been observed switching the configured plan correctly between Sphere (80% agent / 20% brokerage) and BoomTown/company-generated (60% agent / 40% brokerage) before the closing test.

The version-protected transaction update saved `status=closed` and `closedDate=2026-09-12` at `2026-09-12T13:32:28.574Z`. The authorized Staff Queue approval saved at `2026-09-12T13:33:13.685Z`. A read-only canonical transaction readback then confirmed that the existing handoff path persisted both `accountingCloseout.status='new'` and `departmentalProcessing.accounting.status='new'` at `2026-09-12T13:33:13.946Z`, with the Accounting snapshot attached to the same transaction. This proves the Staff-to-Accounting handoff persisted; it does not create a duplicate financial transaction record.

## Defect found and repair

The prior `GET /api/admin/accounting-closeout?status=all` response was empty despite the persisted `accountingCloseout.status='new'` record. The issue was visibility only: the listing route scanned `transactions` where `status='closed'` with a hard `limit(1000)`. A valid recent closeout can fall outside that arbitrary historical sample.

The repair instead queries the canonical Accounting handoff index, `accountingCloseout.status`, for the complete defined workflow-state set: `new`, `in_progress`, `needs_information`, `completed`, and `archived`. The route continues to return only records whose canonical transaction remains Closed, preserving the department-workflow invariant. The response is then filtered by the requested queue status and ordered by handoff activity as before.

## Validation evidence

| Check | Result | Interpretation |
|---|---|---|
| Focused Accounting tests | 5 passed, 0 failed | Covers canonical closeout workflow, required snapshot fields, completion controls, and the new direct-handoff-index query. |
| Full prebuild safeguard suite | 241 passed, 0 failed | Preserves transaction-save, commission, source, pass-through, team, tier, and Accounting regression coverage. |
| Production build | Passed | `next build` compiled successfully, generated all static pages, and completed build traces. |
| Type check | Known baseline remains nonzero | Existing generated Next route-context and historic diagnostics remain; the output contained no diagnostic for `api/admin/accounting-closeout/route.ts` or the new regression. |

## Persistence and recovery safeguards

The repository knowledge base at `docs/transaction-save-and-commission-recovery-knowledge-base.md` records the canonical persistence contract for Agent, Staff, TC, Admin, and Accounting transaction operations. The reusable local **Smart Broker Team Commission Recovery** skill and its transaction-save runbook have also been validated for use when a future source-aware commission, override, team-split, or save-persistence issue is reported.

These safeguards cover the canonical operational paths and authorized editable fields. They do not prove that every unrelated screen, browser/device condition, or future code change can never fail. A reported issue should be diagnosed read-only first, repaired in the shared canonical path, protected by a targeted regression, and applied to production one record at a time only with authorization.

## Deployment and final production readback

The automatic App Hosting rollout for commit `2f13099` completed successfully. The public build marker reported `2f13099-master`, and authenticated, cache-busted, read-only requests to both `GET /api/admin/accounting-closeout?status=new` and `GET /api/admin/accounting-closeout?status=all` each returned **exactly one** matching item for transaction `i3QKmQYYXqumF18Rn64c`.

| Production verification | Observed result |
|---|---|
| Canonical transaction status | `closed` |
| Accounting status | `new` |
| Accounting handoff timestamp | `2026-09-12T13:33:13.946Z` |
| Queue visibility | One matching record in both New and All responses |
| Accounting Queue screen | Renders one New case for `123 main test` with the expected transaction, source, commission, fee, broker, and Agent Take Home values |
| Required closeout data | `inHouse` is still missing; this is a normal completion prerequisite, not a failed handoff |

No Accounting action was taken during the verification. The test record remains a real, open New Accounting case, as intended.

## Release and rollback boundary

The publication contains only the Accounting Queue query repair, its regression, its prebuild registration, and the two documentation checkpoints. It excludes local `.manus-notes/`, generated build artifacts, credentials, and the external skill directory.

If rollback is required, revert the release commit to restore the prior listing behavior; do **not** rewrite or remove the canonical `accountingCloseout` state from `123 Main Test`. The handoff has already persisted correctly and the transaction remains a genuine open Accounting case. No Accounting take, assignment, notes, completion, or reopen action is authorized by this workflow test.
