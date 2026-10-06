# Co-Agent Split Validation Checkpoint — 2026-10-06

## Purpose

Prevent a co-agent transaction from persisting or calculating on an invalid participant allocation while retaining valid whole-percent, decimal, zero-percent, and legacy transaction behavior.

## Verified finding

The transaction form already showed a live total and attempted to keep the counterpart percentage synchronized. However, the enforcement was not centralized across every transaction write boundary. The allocator also used falsy defaults such as `value || 50`, which could turn a valid `0%` allocation into `50%`.

This review did **not** change any payout policy, referral policy, team tier policy, sales-volume credit policy, or existing transaction data.

## Implemented safeguards

- Added `src/lib/transactions/coAgentSplitValidation.ts` as the one shared co-agent split validator.
- Allows valid `0%`–`100%` values, including decimal allocations, when the two shares total 100% within the established tolerance.
- When only one percentage is supplied, safely derives the missing counterpart as the mathematical complement.
- Retains the long-standing 50/50 default only if both values are absent.
- Restores populated legacy nested split values when empty top-level aliases exist.
- Rejects non-numeric, negative, above-100, and non-100-total pairs before a transaction write or payout calculation.
- Treats string `"false"` as inactive rather than accidentally activating a co-agent calculation.
- Replaced the old falsy `|| 50` conversion in the unified editor so a valid 0% is not changed to 50%.
- Added the shared validator at all identified co-agent transaction write/calculate boundaries:
  - agent transaction edit
  - Admin/Staff/TC/Accounting canonical operational edit
  - Staff Queue edit
  - TC intake creation, TC update, and TC approval
  - legacy admin transaction creation route
  - shared co-agent allocation builder

## Validation results

- Focused co-agent/regression suite: **24/24 passed**.
  - Includes 0/100 and 100/0 allocations, decimals, single-field complement resolution, legacy nested recovery, invalid-pair rejection, no-referral allocation behavior, co-agent removal, and TC team commission persistence.
- Full production build: **passed**.
  - Registered prebuild regressions: **270/270 passed**.
- TypeScript changed-file diagnostics: **no diagnostics** for changed files.
  - Repository-wide TypeScript still reports its known pre-existing generated/legacy route diagnostics outside this change.

## Production data boundary

No production records were read, changed, recalculated, or bulk repaired as part of this safeguard. The change only protects future saves and approvals after the automatic App Hosting rollout completes.

## Rollback boundary

Revert the release commit for this checkpoint. This is code-only; no Firestore migration or historical-data rewrite is involved.
