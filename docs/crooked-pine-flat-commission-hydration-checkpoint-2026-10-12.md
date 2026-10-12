# Crooked Pine flat-commission hydration repair — 2026-10-12

## Reported symptom

For **125 Crooked Pine**, staff could enter the correct exact-dollar gross commission of **$7,847.00** and see the correct derived agent net of **$6,277.60** before saving. On refresh, the editor instead displayed **$2.90** GCI, **$0.58** broker GCI, and **$2.32** agent net.

## Read-only record and UI evidence

- The canonical transaction record retained the correct saved values: exact-dollar GCI **$7,847.00**, broker GCI **$1,569.40**, and agent net **$6,277.60**.
- The live editor loaded the transaction in `flat_dollar` mode but filled the exact-dollar buyer-agent field from the legacy `sellerPayingBuyerAgent` value of **2.9**. In that record, **2.9** is the historic percentage, not a dollar payment.
- Flat-mode hydration then treated `2.9` as the authoritative dollar amount and recalculated the visible split to `$0.58 / $2.32`. Saving from that broken presentation would have risked overwriting the correct canonical values.

## Repair

The unified transaction editor now:

1. Resolves a flat-dollar transaction's exact commission from the saved financial snapshot in the ordered canonical fields: `commissionFlatAmount`, `gci`, `splitSnapshot.grossCommission`, and `commission`.
2. Hydrates the buyer or listing seller-payment field with that saved dollar amount only when the file itself is a saved flat-dollar transaction.
3. Leaves a legacy percentage field available only for its proper percentage/cooperating-offer purpose; it can no longer masquerade as the exact-dollar GCI.
4. Retains the existing version-protected canonical save routes and the prior flat-to-percentage recovery behavior.

## Validation

- Focused flat-commission hydration and persistence regressions: **25 / 25 passed**.
- Full `pnpm build`, including the full prebuild regression suite: **passed**.
- Changed-file TypeScript diagnostics: no diagnostics for this repair; full typecheck continues to carry known pre-existing Next-generated route-context and historical diagnostics.

## Data boundary

No production transaction was changed for this repair. The canonical 125 Crooked Pine record already retained the correct `$7,847.00 / $1,569.40 / $6,277.60` financial values. Production verification after the automatic App Hosting rollout must be read-only: reopen the editor and confirm it renders those existing values before any staff save is attempted.

## Rollback

Revert only the repair commit if necessary. Do not rewrite transaction data as part of a code rollback.
