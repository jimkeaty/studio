# TC Approval No-Referral Repair — 2026-10-05

## Reported symptom

A Transaction Coordinator could not approve an ordinary transaction without a referral. The TC Queue returned a `referral is not defined` error, making the approval appear to require referral data.

## Root cause

This was **not** a required-field validation rule and no referral fee was required.

In `PATCH /api/admin/tc/[id]`, the normalized `referral` value was declared inside the automatic commission-calculation branch. The approval payload, however, always used `referral` while serializing outbound referral fields. An approval following the explicit commission-override branch therefore attempted to reference a block-scoped value that did not exist, causing the reported error even when no referral was attached.

## Repair

- Moved `resolveOutboundReferral(intake, rawGci)` into shared TC approval scope immediately after canonical GCI resolution.
- Retained the existing normalization policy: a file with no active outbound referral resolves to `active: false`, no referral percent or dollar amount, and an unchanged net commission base.
- Kept referral deductions unchanged for transactions that do have an active outbound referral.
- Added `scripts/tc-approval-no-referral-behavior.test.ts` and registered it in the production prebuild safeguards.

## Validation

- Focused no-referral behavior test: passed (2 assertions).
- TC routing, TC commission-persistence, and co-agent/outbound-referral regressions: passed (15 assertions).
- Full prebuild safeguards: **268/268 passed**.
- Production Next.js build: passed.

## Production-data boundary

No Firestore transaction, TC intake, commission, referral, queue status, or notification was modified during diagnosis or testing. The deployment changes only the code path used on future TC approval attempts.
