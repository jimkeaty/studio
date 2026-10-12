# Crooked Pine hidden cooperating-commission validation repair — 2026-10-12

## Reported symptom

After the prior flat-dollar hydration repair, **125 Crooked Pine** displayed the correct financial values but pressing **Save Changes** returned:

> Cannot save — required field missing: `cooperatingAgentCommissionPercent` — Cooperating agent commission percent must be less than or equal to 100.

## Root cause

This is a buyer-side transaction with a saved flat-dollar GCI of **$7,847.00**. The unified editor correctly hydrated the buyer-side `sellerPayingBuyerAgent` field with that exact dollar amount for the flat commission.

Separately, the editor also hydrated the hidden **listing-only** `cooperatingAgentCommissionPercent` field from the same legacy buyer-side value. Browser-side schema validation ran before the save payload removed that listing-only field. It therefore incorrectly treated `$7,847` as a cooperating-agent percentage and rejected the save as greater than 100.

No field was missing. No referral or cooperating-agent percentage is required for this buyer-side file.

## Repair

The unified editor now:

1. Validates `cooperatingAgentCommissionPercent` only when the transaction is a **listing or dual** file and the dedicated cooperating-agent method is explicitly **percentage**.
2. Clears listing-only cooperating-agent form values during hydration for buyer/referral files instead of mirroring their buyer-side exact-dollar GCI.
3. Continues to remove cooperating-agent controls from buyer/referral save payloads.
4. Preserves the buyer-side $7,847 flat commission, derived $1,569.40 brokerage share, and $6,277.60 agent net already verified on Crooked Pine.

## Validation

- Focused cooperating-commission, form-validation, flat-dollar recovery, and persistence regression suites: **59 / 59 passed**.
- Full production `pnpm build`, including the prebuild regression suite: **passed**; prebuild reported **276 / 276** safeguards passed.
- Changed-file TypeScript diagnostics: no diagnostics for this repair. The full typecheck continues to report known pre-existing Next-generated route-context and historical issues outside this change.

## Production data boundary

No production record was updated during diagnosis or validation. The repair affects client-side form hydration and validation only. After the automatic App Hosting rollout, the correct production readback is to reopen 125 Crooked Pine and confirm that the existing values still render as `$7,847.00` GCI, `$1,569.40` broker GCI, and `$6,277.60` agent net; then an authorized staff member may save intended operational changes through the existing version-protected canonical route.

## Rollback

Revert only the repair commit if necessary. Do not rewrite Crooked Pine or any other transaction as part of a code rollback.
