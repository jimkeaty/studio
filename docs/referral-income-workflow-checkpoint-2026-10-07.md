# Referral Income Workflow Checkpoint — 2026-10-07

## Business policy implemented

A `closingType: referral` record means **Keaty receives a referral fee for an agent’s referral**. It is a referral-income record, not a represented buyer/listing side.

| Metric | Policy |
|---|---|
| Property sides | `0` |
| Dollar volume | `$0` |
| External property sale price | Context only; never Keaty GCI |
| Expected external gross commission | Context used to calculate the expected Keaty referral fee |
| Expected Keaty referral fee | Used for the pre-payment commission/split preview |
| Actual referral fee received | Authoritative GCI once entered |
| Agent payout | The received/expected Keaty fee is split under the referring agent’s normal plan |
| Company GCI / company retained | Included once the referral file is closed |
| Tier progression | Included once the referral file is closed |
| Reporting date | The date Keaty actually receives the fee (`referralFeeReceivedDate`), falling back safely for legacy records |

This applies whether the referred-to agent is outside Keaty or inside Keaty. The referral-income file does **not** treat the fee as an outbound deduction from itself. Ordinary buyer/listing/dual transactions retain the existing separate outbound-referral deduction behavior.

## New referral-income fields

- `referralExpectedExternalGrossCommission`
- `referralFeePercent`
- `referralExpectedFee`
- `referralActualFeeReceived`
- `referralFeeReceivedDate`

## User workflow

1. Select **Referral** as the transaction side.
2. Enter the outside deal’s expected gross commission and Keaty’s referral percentage.
3. Smart Broker calculates the expected referral fee to Keaty and uses that amount for the normal agent/broker payout preview.
4. When Keaty receives the check, enter the actual received amount and the received date, then close the referral record.
5. The closed referral contributes the actual received fee to agent income, company GCI, and tier progression, while remaining at zero volume and zero sides.

Example: outside gross commission `$19,500` × Keaty referral fee `25%` = expected Keaty GCI `$4,875`. The `$4,875`—not the outside `$650,000` sale price or `$19,500` outside commission—is run through the referring agent’s normal split.

## Implementation boundaries

- `src/lib/transactions/referralIncome.ts` is the canonical normalizer.
- Agent, Admin, Staff Queue, TC update/approval, and direct creation routes normalize referral income before commission calculation or persistence.
- `resolveProductionCredit` returns zero sides and zero volume for referral-income records.
- Agent dashboard, leaderboard, command metrics, and rollup rebuild preserve referral fee GCI and payout while excluding property-side counts/volume.
- Rollup year and tier-cycle eligibility use the Keaty fee received date for referral income.
- Existing outbound-referral deduction behavior for property-side files is unchanged.

## Validation

- Focused referral-income behavior tests: **4/4 passed**.
- Referral persistence boundary regression: **passed**.
- Related transaction, co-agent, commission-base, and save-persistence regressions: **passed**.
- Production build: **passed**.
  - Prebuild regression suite: **270/270 passed**, plus the newly registered referral-income tests.
  - Next.js optimized build compiled and generated **297/297** static pages.
- Full TypeScript diagnostics still contain pre-existing generated-route and historical errors elsewhere in the codebase. No new changed-file error remained after the referral receipt-date fix; the build is the authoritative release validation for this repository.

## Data and rollout boundary

No production transaction was created, edited, closed, or recalculated during implementation or validation. The existing 106 Jared Drive / Sammy Cart example was not modified. Deployment remains automatic after the commit is pushed to `main`.
