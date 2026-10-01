# Transaction Fee Excluded From Gross Commission Checkpoint

**Date:** 2026-10-01  
**Policy correction:** A transaction/compliance fee is not commission revenue. It must never increase Gross Commission Income (GCI), affect a commission tier, or be split between the agent and brokerage.

## Correct business rule

> **Gross Commission = commission base × commission percentage**
>
> The commission base is the explicit saved `commissionBasePrice` when one exists (for example, sale price less seller concessions); otherwise it is sale price for pending/closed files, and list price only for an unsold active listing estimate.

Transaction fee handling is separate:

| Fee payer | GCI / internal split | Agent take-home |
|---|---|---|
| Agent | No effect on GCI or split | Deduct fee after the agent split is calculated |
| Buyer | No effect on GCI or split | No agent deduction |
| Seller / seller closing-cost pool | No effect on GCI or split | No agent deduction |

A qualifying shortage or home-warranty payment retains its pre-existing separate behavior. This release changes **transaction-fee treatment only**.

## Critter Creek expected correction

Canonical transaction: **TBD 00 Critter Creek** (`oiAwbKjolhjdcBsgLz29`)

| Item | Correct value |
|---|---:|
| Sale price / commission base | $93,000 |
| Listing commission rate | 2.5% |
| Gross commission (GCI) | **$2,325.00** |
| Agent split (80%) | **$1,860.00** |
| Brokerage retained (20%) | **$465.00** |
| Buyer-paid transaction fee | $150.00, separate settlement charge |

The current production snapshot was read-only audited before this correction work and showed the $150 buyer-paid fee incorrectly added to GCI. The production record has not yet been rewritten in this checkpoint; its update will be made only through the version-protected canonical transaction save after the deployed code exposes the current version token.

## Implementation

1. Added `src/lib/transactions/percentageGrossCommission.ts`, a shared policy helper that deliberately accepts no transaction-fee inputs.
2. Updated the unified transaction editor so its automatic GCI calculation uses this helper rather than adding `txComplianceFeeAmount` for buyer- or seller-paid fees.
3. Preserved the established separate agent-paid fee deduction in the take-home calculation.
4. Corrected the in-app Commission Calculation training article, including examples that previously treated a buyer-paid or seller-pool transaction fee as GCI.
5. Fixed transaction read serialization so legacy JavaScript-Date `updatedAt` values become ISO version tokens. This allows the unified editor to retain its required Firestore write precondition instead of making an unversioned correction.

### Deployment hotfix

The first deployed version of this release exposed a missing import for `normalizeTransactionVersion` in the editor-load route. The full production build completed, but the authenticated production readback correctly caught the runtime failure before any transaction data was changed. The import was restored, protected by a regression assertion, rebuilt successfully, and released as an immediate follow-up hotfix.

## Regression coverage

- Extended commission-base behavior tests with the Critter Creek transaction-fee case: $2,325 stays $2,325 even if a $150 buyer-paid fee is present.
- Added transaction-version serialization behavior tests for JavaScript Dates and Firestore Timestamp-like values.
- Extended form and transaction-save regression tests to require the no-transaction-fee gross-commission policy and the returned version token.
- Registered both behavior tests in the full prebuild gate.

## Validation

| Check | Result |
|---|---|
| Focused transaction fee, commission base, form, and version tests | Passed: 51 tests |
| Full prebuild gate | Passed: 255 tests |
| Production Next.js build | Passed; compiled successfully |
| Production record mutation at this checkpoint | None |

## Deployment and correction sequence

1. Publish this release to `main`; App Hosting deploys automatically.
2. Confirm the public build marker and version-token response on the unified editor.
3. Re-read Critter Creek and issue a version-protected canonical transaction update to `$2,325` GCI with the matching 80/20 split.
4. Re-read the transaction and its relevant rollup fields; do not touch unrelated transactions.

## Rollback

Revert the release commit. The change is isolated to transaction-fee treatment in automatic percentage-based GCI calculation, training content, and version-token serialization.
