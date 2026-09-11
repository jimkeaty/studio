# 211 Edgehill Circle — Charles Ditch Team Commission Repair

**Status:** Code repair published and the authorized one-record production correction completed and verified.

## Issue and verified evidence

The closed transaction **211 Edgehill Circle, Lafayette, LA 70508** (`HfLVh27xq0SPCuNmEp69`) belongs to Scott Domingue and was created by the TC workflow on August 26, 2026. Its saved snapshot is incorrectly an independent `individual` 70/30 calculation: it has no team ID, no team or member plan ID, no leader structure percentage, no member-paid field, and no leader-retained field. It stores Scott at `$10,354.57`, brokerage at `$4,437.68`, and a 30% brokerage allocation.

Scott’s active Charles Ditch Team membership is effective April 15, 2022 and was created in the system on May 23, 2026, before this transaction. The missing team allocation is therefore not caused by a later team assignment.

## Root cause repaired in code

Normal TC forms store calculated `agentDollar`, `agentPct`, `brokerGci`, and `brokerPct` values for review. The TC approval route previously treated any positive prefilled `agentDollar` as a manual/historical allocation—even when `commissionOverride` was false. That bypassed the canonical team resolver and saved an independent snapshot.

The repair removes that implicit bypass. **Only an explicit `commissionOverride` can preserve a manual allocation.** All other TC approvals now resolve the agent profile, active membership, member plan, leader-team structure, and tier progression at the transaction date. Existing transaction records are not automatically rewritten.

## Confirmed fee treatment

211 Edgehill has `txComplianceFee: yes`, `txComplianceFeeAmount: 395`, and `txComplianceFeePaidBy: agent`. The shared Agent Take Home calculation subtracts that `$395` once from Scott’s gross member allocation and does not use it to alter Charles’s retained spread or Keaty Real Estate’s brokerage allocation.

## Confirmed allocation and completed one-record correction

The transaction-date preview, excluding this transaction itself, returns Scott’s cumulative progression after this close as `$46,184.75`. The currently stored Scott member plan applies **75%** between `$42,000` and `$84,000`; the current Charles Ditch Team structure applies **75% leader side / 25% Keaty Real Estate** below `$224,000`.

Jim confirmed the allocation for **211 Edgehill only** as **Scott 70%, Charles 5%, Keaty Real Estate 25%**. On the recorded `$14,792.25` GCI, the corrected snapshot now persists Scott gross `$10,354.57`, Charles retained `$739.62`, and Keaty Real Estate `$3,698.06`; the amounts reconcile to the GCI after two-decimal rounding. The existing agent-paid `$395` fee remains separate, so Scott’s verified Agent Take Home is `$9,959.57`.

At 2026-09-11 19:05 CDT, the public build marker verified `e5402ef-master`. The authorized administrative PATCH used the transaction’s saved version timestamp and succeeded for **only** `HfLVh27xq0SPCuNmEp69`. It now has `agentType: team`, `calculationModel: teamMember`, the Charles Ditch Team and member-plan IDs, three-way payout fields, and a credit snapshot that links Scott to Charles as the progression leader. The updated record was returned by the update route at `2026-09-11T19:07:30.635Z`.

The route also rebuilt Charles’s affected 2026 rollup. An authorized read confirms `rebuiltAt: 2026-09-11T19:07:32.054Z`, immediately after the transaction update, with the expected April 15, 2026–April 14, 2027 cycle. No team plan, member plan, membership, fee rule, or other transaction was altered.

## Validation

| Check | Result |
| --- | --- |
| Targeted TC allocation, leader-team, Agent Take Home, and leader-rollup safeguards | Passed: 13 focused tests |
| Full production prebuild safeguard suite | Passed: 231 tests |
| Typecheck changed-file diagnostic scan | No diagnostic for the changed TC or admin-transaction routes or the regression; repository retains unrelated historical typecheck diagnostics |
| Clean production build | Passed; optimized compilation and all 296 static pages completed |
| `git diff --check` | Passed before checkpoint publication |

## Rollback

Revert commits `16d5692` and `e5402ef` to restore the former code behavior. The completed production correction is intentionally isolated to `HfLVh27xq0SPCuNmEp69`; reverting code does not revert Firestore data. If the one-record correction itself must be reversed, use a version-protected administrative update that restores its previous independent 70/30 snapshot only after a separate authorization.

## Required next action

No further correction is pending for 211 Edgehill. Future closed team files approved through the repaired TC path will preserve their team snapshot unless an authorized editor explicitly sets a commission override. No bulk rewrite is authorized or planned.
