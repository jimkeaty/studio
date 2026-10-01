# Critter Creek Commission Base Display Checkpoint

**Date:** 2026-10-01  
**Scope:** Correct the Listing Commission summary in the unified transaction editor so pending and closed listings show the saved sale-price-aware commission base rather than a stale list-price estimate.

> **Correction — 2026-10-01:** The transaction-fee interpretation in this checkpoint was superseded after business clarification. A transaction/compliance fee is never GCI and is never part of an agent/broker commission split. See `docs/transaction-fee-excluded-from-gross-commission-checkpoint-2026-10-01.md` for the controlling policy and Critter Creek correction sequence.

## Production read-only findings

Authenticated production inspection of `transactions/oiAwbKjolhjdcBsgLz29` (**TBD 00 Critter Creek**) confirmed:

| Item | Saved value |
|---|---:|
| Status / representation side | Closed / Listing |
| List price | $95,000 |
| Sale price | $93,000 |
| Commission base price | $93,000 |
| Seller-paid listing commission | 2.5% |
| Listing-side commission from the commission base | $2,325.00 |
| Buyer-paid transaction compliance fee | $150.00 |
| Saved GCI / split snapshot gross commission | $2,475.00 |
| Agent / company split | 80% / 20% |
| Agent payout / company retained | $1,980.00 / $495.00 |

The saved financial calculation and commission base were not using the $95,000 list price. The editor's top Listing Commission summary alone calculated its display from `listPrice`, which presented **$2,375 estimated GCI** after the file was closed.

The $2,475 saved GCI is distinct from the 2.5% listing-side commission: it is the $2,325 listing commission plus the $150 buyer-paid transaction fee, following the existing product rule that a direct buyer-paid fee adds to GCI before split.

## Repair

1. Imported and used the canonical `resolveCommissionBase()` helper in the Listing Commission summary.
2. The summary now follows the shared priority order:
   - explicit `commissionBasePrice` (including a seller-concession adjustment),
   - sale price for pending/closed listings,
   - list price only for active/coming-soon/temporary-off-market listings with no sale price.
3. A pending or closed listing now says **Listing-side Commission** and identifies the commission base. An active listing without a sale price continues to say it is an estimate from list price.
4. The cooperating-agent offer remains separate from listing-side GCI and internal broker/agent splits.
5. No production transaction record, queue item, notification, or rollup was changed in this work.

## Regression coverage

- Added `scripts/commission-base-display-behavior.test.ts` with direct cases for:
  - a closed listing using sale price rather than list price;
  - an explicit concession-adjusted commission base taking priority;
  - an active listing falling back to list price only when no sale price exists.
- Extended `scripts/critter-creek-source-commission-regression.test.mjs` to require that the editor summary uses `resolveCommissionBase()` and prevents the old `listPrice × commission%` summary formula.
- Registered the behavior test in the full prebuild gate.

## Validation

| Check | Result |
|---|---|
| Focused resolver, Critter Creek, and form regressions | Passed: 48 tests |
| Full prebuild gate | Passed: 253 tests |
| Production Next.js build | Passed; compiled successfully |
| Production mutation | None |

## Rollback

Revert the release commit. The change is isolated to presentation of the Listing Commission summary and its tests; it does not modify calculation persistence, transaction data, splits, fees, queues, or rollups.
