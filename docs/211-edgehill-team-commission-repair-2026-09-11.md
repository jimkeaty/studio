# 211 Edgehill Circle — Charles Ditch Team Commission Repair

**Status:** Code repair validated locally; production transaction data intentionally unchanged pending an explicit one-record correction authorization.

## Issue and verified evidence

The closed transaction **211 Edgehill Circle, Lafayette, LA 70508** (`HfLVh27xq0SPCuNmEp69`) belongs to Scott Domingue and was created by the TC workflow on August 26, 2026. Its saved snapshot is incorrectly an independent `individual` 70/30 calculation: it has no team ID, no team or member plan ID, no leader structure percentage, no member-paid field, and no leader-retained field. It stores Scott at `$10,354.57`, brokerage at `$4,437.68`, and a 30% brokerage allocation.

Scott’s active Charles Ditch Team membership is effective April 15, 2022 and was created in the system on May 23, 2026, before this transaction. The missing team allocation is therefore not caused by a later team assignment.

## Root cause repaired in code

Normal TC forms store calculated `agentDollar`, `agentPct`, `brokerGci`, and `brokerPct` values for review. The TC approval route previously treated any positive prefilled `agentDollar` as a manual/historical allocation—even when `commissionOverride` was false. That bypassed the canonical team resolver and saved an independent snapshot.

The repair removes that implicit bypass. **Only an explicit `commissionOverride` can preserve a manual allocation.** All other TC approvals now resolve the agent profile, active membership, member plan, leader-team structure, and tier progression at the transaction date. Existing transaction records are not automatically rewritten.

## Confirmed fee treatment

211 Edgehill has `txComplianceFee: yes`, `txComplianceFeeAmount: 395`, and `txComplianceFeePaidBy: agent`. The shared Agent Take Home calculation subtracts that `$395` once from Scott’s gross member allocation and does not use it to alter Charles’s retained spread or Keaty Real Estate’s brokerage allocation.

## Configuration decision still required for the existing record

The transaction-date preview, excluding this transaction itself, returns Scott’s cumulative progression after this close as `$46,184.75`. The currently stored Scott member plan applies **75%** between `$42,000` and `$84,000`; the current Charles Ditch Team structure applies **75% leader side / 25% Keaty Real Estate** below `$224,000`.

Under those present canonical settings, 211 Edgehill would resolve to: Scott gross `$11,094.19`; Keaty Real Estate `$3,698.06`; Charles retained `$0.00`; Scott Agent Take Home `$10,699.19` after the `$395` agent-paid fee. This is mathematically consistent because Scott’s 75% equals the 75% leader side.

If the intended policy is instead **Scott 70%, Charles 5%, Keaty Real Estate 25%**, Scott’s applicable member plan must be confirmed or corrected to 70% for this transaction’s tier before the one-record transaction correction. The system cannot truthfully produce 75% Scott, 25% Keaty Real Estate, and a positive Charles retained amount from the same commission base.

## Validation

| Check | Result |
| --- | --- |
| Targeted TC allocation, leader-team, and Agent Take Home safeguards | Passed: 18 tests |
| Full production prebuild safeguard suite | Passed: 230 tests |
| Typecheck changed-file diagnostic scan | No diagnostic for the changed TC route or regression; repository retains unrelated historical typecheck diagnostics |
| Clean production build | Passed; optimized compilation and all 296 static pages completed |
| `git diff --check` | Passed before checkpoint publication |

## Rollback

Revert the commit that accompanies this document to restore the former TC approval behavior. No Firestore records, team memberships, team plans, member plans, rollups, fees, or notifications were changed by this repair.

## Required next action

After Jim confirms the intended allocation for 211 Edgehill, perform one version-protected administrative update of **only** transaction `HfLVh27xq0SPCuNmEp69`, persist the canonical team snapshot and matching top-level payout fields, then re-read the record to verify the result. No bulk correction is authorized or planned.
