# 00 Critter Creek — Commission and Persistence Repair

## Status

**Code repair complete and validated locally; the confirmed transaction-specific production correction remains gated on the repository-triggered rollout.** This checkpoint covers the first queued issue only: Madelyn’s 00 Critter Creek commission calculation and the split-save error.

## Verified root cause

Madelyn’s active CGL profile contains overlapping custom member bands that encode separate lead-source exceptions in existing band notes:

| Canonical lead source | Intended member split | Intended brokerage split |
|---|---:|---:|
| `sphere` | 80% | 20% |
| `company_gen` | 60% | 40% |

The prior resolver and editor preview selected custom bands only by their overlapping dollar range. They did not receive or use the transaction’s canonical `dealSource`. As a result, the system could choose the wrong source-specific commission policy. The production record had also been manually saved at 55% / 45%, which did not match the verified sphere-lead policy.

The screenshot’s save error was legitimate validation, but the interaction was poor: operational users could type one percentage and leave the other stale or blank, producing an invalid pair. Dollar overrides were already intended to clear both percentages, but percentage entry did not ensure the pair remained at 100%.

## Implemented repair

1. Added a shared source-specific member-band selector that uses the existing canonical `dealSource` values and legacy band notes without creating a new duplicate commission field.
2. The selector chooses the explicit sphere or company-generated custom band. If the source is missing or unrelated, it does **not** silently apply a sphere/company exception; the normal team or profile fallback applies instead.
3. Propagated `dealSource` through new transaction creation, Admin Ledger recalculation, Staff Queue recalculation, TC update calculation, and the editor’s commission-preview request.
4. Updated authorized percentage editing so entering Broker % automatically sets Agent % to the complementary value, and vice versa. Manual-dollar edits continue to clear both percentages so dollars remain authoritative.

## Expected Critter Creek result after live correction

Because the verified source is **sphere**, Critter Creek must use **Madelyn 80% / Keaty Real Estate 20%**. No assumption is made about the exact dollars here; the live correction must retain the transaction’s actual GCI, referral treatment, and fee-payer fields.

## Validation

| Check | Result |
|---|---|
| Source-specific behavior tests | Passed: sphere 80%, company-generated 60%, no silent source-exception fallback |
| Focused source and persistence regressions | Passed |
| Full prebuild safeguards | Passed: 239 tests |
| Typecheck | Only the established generated Next route-context baseline; no changed-file diagnostics |
| Production build | Completed successfully; generated build stamp restored |

## Rollback

Revert the published code commit. The repair is confined to source-aware custom-band selection and paired manual percentage entry; it does not alter stored plans or unrelated historical transactions.

## Next actions

1. Verify the repository-triggered rollout by its public build marker.
2. Re-read 00 Critter Creek, then apply a version-protected one-record correction to its canonical 80% / 20% sphere split.
3. Re-read the persisted snapshot and Agent Take Home before moving to the separately queued flat-fee persistence audit.
