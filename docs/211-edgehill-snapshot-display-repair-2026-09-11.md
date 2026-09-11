# 211 Edgehill — Saved Team Snapshot Display Repair

**Status:** Implemented, validated locally, and ready for publication on September 11, 2026.

## Finding

The 211 Edgehill transaction document was already corrected and verified with the approved Charles Ditch Team snapshot: Scott Domingue receives 70% of gross commission, Charles Ditch retains 5%, and Keaty Real Estate retains 25%. Scott's separate $395 agent-paid transaction fee remains a distinct Agent Take Home deduction.

The transaction editor nevertheless rendered the live profile preview for Scott's current Tier 2 configuration—75% agent and 25% brokerage—which showed no leader retained amount. The issue was **display precedence**, not a failure to persist the corrected transaction allocation.

## Repair

The unified transaction editor now detects a reopened `teamMember` transaction with an approved three-way `splitSnapshot` and makes that snapshot authoritative for the editor's commission banner and tier display. The editor shows:

| Presentation element | Correct display for 211 Edgehill |
|---|---|
| Banner | Saved team allocation |
| Member | Scott 70% |
| Leader retained | Charles 5% |
| Brokerage | Keaty Real Estate 25% |
| Fee | Separate $395 agent-paid deduction |

The live profile preview remains available only after an authorized user deliberately selects **Re-calculate from agent profile**. A direct percentage or dollar edit also clears the saved-snapshot presentation, ensuring the screen never labels an edited split as a historical snapshot.

## Preservation

No transaction payout, team plan, member plan, lifecycle data, or unrelated record was changed by this display repair. The existing `commissionOverridden` and three-way `splitSnapshot` saved on 211 Edgehill remain the source of truth for the closed transaction.

## Validation

| Check | Result |
|---|---|
| Authenticated read of 211 Edgehill | Confirmed `teamMember`, `commissionOverridden: true`, agent 70%, brokerage 25%, and a snapshot leader retain of $739.62 |
| Saved-team-snapshot editor regression | Passed 3/3 |
| Related transaction-form safeguard | Passed 39/39 |
| Full production prebuild safeguards | Passed 234/234 |
| Production build | Completed successfully; generated build stamp restored |
| Changed-file typecheck diagnostics | None; repository retains the known generated-route baseline outside changed files |

## Rollback

Revert the transaction-editor snapshot-preview commit. This restores live-profile preview behavior only; it does not modify the persisted 211 Edgehill payout snapshot.

## Remaining verification

After the repository-triggered deployment is live, reopen 211 Edgehill from a fresh page load. The Commission section should say **Saved team allocation** and show Scott 70%, Leader 5%, and Broker 25%. Do not click **Re-calculate from agent profile** unless staff intentionally intends to replace the historical approved snapshot with the current profile plan.
