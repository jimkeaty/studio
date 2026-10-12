# Settlers Trace Percentage Save Recovery — 2026-10-12

## Scope

Follow-up repair for **201 Settlers Trace #4405**: Staff could switch an incorrectly saved flat-dollar commission back to percentage mode and see the correct math, but the former flat-rate/manual-split state could still take precedence during persistence.

## Root cause

The percentage-recovery helper cleared the stale flat-dollar GCI and recalculated GCI correctly, but a historical `commissionOverridden` flag and the full form's old split fields could still be treated as authoritative by operational save routes.

That created a conflict:

- the editor showed the recovered percentage math;
- the save path preserved the historical flat/manual allocation instead of allowing the profile-based split to replace it.

This was not a required-field validation issue. It was an override-precedence issue.

## Repair

1. When an existing flat-dollar transaction is explicitly changed to percentage mode, the shared recovery helper now clears only that prior flat-rate split override metadata.
2. The unified editor treats a flat-to-percentage change as a deliberate profile recalculation: it clears the stale local override state before recalculating GCI and the agent/broker split.
3. Admin Ledger, Staff Queue, TC Queue, and agent save paths honor an explicit `commissionOverridden: false` recovery instruction:
   - automatic calculation is allowed to run;
   - stale direct split fields do not overwrite the rebuilt result;
   - intentional manual splits on transactions that were already percentage-based remain untouched.
4. Optimistic transaction-version protection remains in place. A stale editor still receives the normal refresh-required response rather than overwriting another authorized user’s changes.

## Expected Settlers Trace result

Using the stated business inputs:

| Input | Value |
|---|---:|
| Sale / commission base price | $182,000.00 |
| Gross commission rate | 3.00% |
| Recovered GCI | $5,460.00 |
| Agent split | 75.00% |
| Agent net before any separately selected transaction-fee deduction | $4,095.00 |
| Broker share | $1,365.00 |

A transaction fee, if configured as agent-paid, remains separate from GCI and the percentage split; it affects the displayed take-home only.

## Validation

- Focused recovery suite: **22/22 tests passed**.
- Full prebuild regression suite: **274/274 tests passed**, plus referral-income persistence coverage.
- Production build: **passed** (`next build`, 297 static pages generated).
- No production transaction data was read or changed during this repair.

## Release boundary

The next commit contains code and regression coverage only. It does not change 201 Settlers Trace #4405 or any other production transaction. After the automatic App Hosting rollout completes, Staff should reopen the transaction, select percentage mode, enter or confirm the 3% rate, confirm the displayed $5,460 GCI / $4,095 pre-fee agent split, and save. If a stale-editor conflict appears, refresh once and repeat; that guard is intentional.
