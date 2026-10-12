# Settlers Trace Percentage-Commission Recovery Checkpoint — 2026-10-12

## Request

Staff could not correct **201 Settlers Trace #4405** from a stale exact-dollar/flat commission mode to its intended percentage commission. The stated financial inputs were:

- Sale price / commission base: **$182,000**
- Gross commission rate: **3.00%**
- Expected GCI: **$5,460.00**
- Stated agent net at a 75% split: **$4,095.00**

## Root cause

A transaction that had previously been saved with `commissionCalculationMethod = flat_dollar` could retain its old `commissionFlatAmount`, GCI, and manual-GCI flag after an authorized editor selected percentage mode. Some operational routes cleared the flat flag but did not recalculate the gross commission before downstream split logic evaluated the stale value. In the agent route, the persisted manual-GCI flag could also continue to suppress the calculation.

## Repair

Added `normalizePercentageCommissionMethod`, a single recovery helper that runs only when an authorized save explicitly selects percentage mode. It:

1. Clears the former flat amount;
2. Clears the stale manual-GCI override;
3. Resolves the current commission base using the canonical base-price policy;
4. Calculates the percentage gross commission, including any existing shortage/warranty adjustments; and
5. Writes the resulting amount consistently to both `gci` and `commission`.

The helper is applied to the unified editor flow and the agent, Admin Ledger, Staff Queue, TC update, TC approval, and new TC-intake paths. New TC intakes also persist the commission-method metadata explicitly.

For the stated example, the helper returns **$5,460.00** (`$182,000 × 3%`). A $4,095.00 agent amount follows only if the active saved split is 75%; team, referral, and authorized manual-split rules remain authoritative where applicable.

## Validation

- Focused recovery behavior tests: **3/3 passed**.
- Focused recovery, flat-dollar, persistence, and version regressions: **17/17 passed**.
- Full prebuild regression suite: **273/273 passed**.
- Production build: **passed**.
- Changed-file TypeScript diagnostics: **none**. The repository's known historical/generated full-typecheck diagnostics remain outside this change.

## Production data boundary

No production transaction was edited in this implementation or validation. **201 Settlers Trace #4405** remains unchanged until an authorized user saves the correction through the deployed normal transaction editor. The repair preserves normal stale-version protection and does not bypass the canonical transaction-save path.

## Release / rollback

- Release: commit the files in this checkpoint with the percentage-recovery helper and tests, then push to `main` for the normal automatic App Hosting rollout.
- Rollback: revert the release commit. This only affects future saves; it does not rewrite historical transactions.
