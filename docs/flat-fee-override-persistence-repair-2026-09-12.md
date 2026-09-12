# Flat-Fee Calculation and Authorized Override Persistence Repair — 2026-09-12

## Status

**Implemented, validated, and ready for publication.** This repair addresses the broader queued issue where a transaction could retain an old agent/company dollar snapshot after an authorized staff, TC, Admin, or Accounting user changed the exact flat-dollar commission, while ensuring explicit manual split changes persist.

## Root Cause

The Admin Ledger save route persisted a `flat_dollar` commission method and updated the transaction GCI, but its canonical split refresh was limited to a narrower team-snapshot path. For an ordinary non-team transaction, a changed flat GCI could therefore coexist with a stale profile-derived `splitSnapshot` dollar allocation. Staff and TC queue paths already had a fuller recalculation and direct-split merge pattern; the Admin Ledger did not consistently use it.

## Repair

The Admin Ledger now:

1. Treats changes to GCI, flat-dollar method/amount, percentage, commission base, sale price, source, referral, assigned agent, and relevant transaction dates as commission-calculation triggers.
2. Rebuilds the canonical `splitSnapshot`, `creditSnapshot`, agent type, and calculation model through `resolveTransactionCalculation` when no explicit manual commission override exists.
3. Applies the authorized direct agent/broker percentage or dollar edit **after** automatic recalculation, preserving the entered operational correction and the agent-paid transaction-fee deduction.
4. Continues to preserve explicit manual overrides, pass-through economics, and team three-way snapshots.

The unified editor’s paired-percentage behavior remains in force: an authorized user adjusting one percentage receives the complementary percentage so the save payload remains at 100%; clearing both percentages remains the supported manual-dollar override path.

## Validation

| Check | Result |
|---|---|
| Targeted flat-dollar safeguard | Passed: 4 tests |
| Full prebuild safeguard suite | Passed: 240 tests |
| Clean production build | Passed |
| Changed-file type diagnostics | None; the repository-wide typecheck retains only the documented generated-route baseline |

## Preservation and Rollback

No production transaction record, commission plan, team plan, payout, or accounting workflow was changed while implementing this code repair. The change is limited to the Admin Ledger save path plus source-regression coverage. Rollback is the corresponding commit revert; existing transaction snapshots are not rewritten by a rollback.

## Relationship to the Critter Creek Repair

The previously published Critter Creek source-aware CGL repair remains awaiting confirmation that its repository-triggered live build has deployed before the version-protected 00 Critter Creek transaction correction is applied. This broader flat-fee repair is independent and can proceed through validation and publication without changing that record.
