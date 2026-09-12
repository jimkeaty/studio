# Charles Ditch Team Tier-Boundary Repair

**Status:** Implemented and validated locally on September 11, 2026.

## Decision rule

For a Charles Ditch Team member, a transaction is paid at the member and leader bands that were active **before that transaction closed**. The closing that crosses a threshold advances the tier for the following transaction; it does not reprice itself at the newly reached tier.

## Verified sequence

| Transaction point | Prior cycle GCI | Scott member payout | Charles retained spread | Keaty Real Estate |
|---|---:|---:|---:|---:|
| 211 Edgehill, the threshold-crossing close | $31,392.75 | 70% | 5% | 25% |
| Next closed team transaction | $46,185.00 | 75% | 0% | 25% |

The screen’s **Leader Side (75%)** remains the leader-side structure, not a second Scott payout. At Scott’s 70% member tier, Charles retains the 5% difference. At Scott’s 75% member tier, the difference is zero, so Charles retains nothing and Keaty Real Estate remains at 25%.

## Root cause and repair

The canonical resolver used `prior progression + current transaction GCI` to select member and leader bands. That could promote the deal that crossed the threshold. The resolver now selects those bands from the canonical historical progression **as of the close, excluding the current transaction**.

This applies to custom member bands, assigned member-plan bands, team default member bands, and leader bands. It does not change the saved 211 Edgehill snapshot, any team plan, or any other closed transaction.

## Validation

| Check | Result |
|---|---|
| Threshold-crossing behavior test | Passed: 211 Edgehill remains 70/5/25 |
| Post-threshold next-transaction behavior test | Passed: next close is 75/0/25 |
| Historical as-of tier behavior | Passed: later closes do not retroactively reprice earlier closes |
| Resolver source regression | Passed: no `+ current transaction` tier selection remains |
| Full prebuild safeguards | Passed: 236 tests |
| Production build | Completed successfully; generated build stamp restored |

## Rollback

Revert the corresponding resolver and regression commit. This affects future tier selection only. It does not alter the approved saved allocation for 211 Edgehill.

## Assumption and operational note

This repair uses the applicable Scott member-plan bands present in production at calculation time. The current evidence shows the $42,000 threshold is the 70% to 75% transition for Scott. If administrators change the member plan later, future transactions will follow the newly saved bands; historical closed snapshots remain preserved.
