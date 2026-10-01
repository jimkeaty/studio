# Accounting Queue — Closed Transaction Detail View Checkpoint

**Date:** October 1, 2026
**Scope:** Make the Accounting Queue open a clear accounting detail view for each canonical closed transaction, and remove the misleading use of Accounting workflow labels as transaction status.

## Problem addressed

The Accounting Queue showed a short index row. Its only visible status was the Accounting departmental state (`New`, `In Progress`, etc.), which made a closed transaction appear to have a non-closed transaction status.

Accounting needed a transaction-level view with these fields:

- Type, Status, Deal Type, Agent, Address, Source, Close Date
- List Price / Buyer Rep Price, Sale Price, Commission %, GCI, Transaction Fee, Broker %, Broker GCI, Referral
- % to Member, Agent Net / Primary GCI, Team Member 1, % to Member 1, Member GCI 1, Team Member 2

## Implementation

1. **Added a View action** to each Accounting Queue row.
   - It opens an **Accounting Transaction Detail** dialog.
   - The dialog is a presentation of the current canonical transaction snapshot, not a second transaction editor or a copied ledger record.
   - The existing **Open & edit** action remains the only edit path and still opens `/dashboard/transactions/new?edit={id}&accountingCloseout=1`.

2. **Separated two distinct states.**
   - **Transaction Status** is shown as **Closed**. The Accounting Queue API already excludes every non-closed transaction.
   - **Accounting review** is shown separately only as `Ready for Accounting review`, `Needs information`, or `Accounting complete`.
   - The Queue no longer presents `New` or `In Progress` as the transaction status.

3. **Extended the live-built Accounting snapshot** from the canonical transaction with the requested type, deal type, primary-agent, and historical imported team-member fields.
   - `List Price / Buyer Rep Price` uses the system’s established `listPrice` field, which is also the historical import mapping for buyer-representation price.
   - `Agent Net / Primary GCI` remains the canonical saved primary split payout.
   - Team Member 1 / 2 historical import fields are shown when present. Current team calculations remain authoritative in `splitSnapshot`; the view does not infer names or create a secondary payout model.

## Validation

| Check | Result |
|---|---|
| Focused Accounting behavior tests | 2/2 passed |
| Accounting Queue, closeout, visibility, access, notification, and detail regressions | 19/19 passed |
| Full prebuild safeguards | 267/267 passed |
| Production `pnpm build` | Passed |
| Changed-file TypeScript diagnostics | No diagnostics matching the Accounting Queue or accounting snapshot files; full typecheck retains established baseline conditions outside this change |

## Production readback correction

The first live readback correctly rendered the detail dialog and `Closed` transaction status, but identified two display-only issues before user delivery:

1. Unset optional money and percentage values displayed as `$0.00` or `0%`, which could be mistaken for actual entered zero values.
2. A current team-member transaction showed `0%` despite a saved member payout because the Accounting snapshot preferred the empty independent-agent percentage over the saved `memberPercentOfLeaderSide` snapshot.

The follow-up release now displays **—** for missing optional values and prefers the saved team-member percentage for the `% to Member` view. It does not change a transaction, a split snapshot, or any financial calculation.

One legacy team snapshot observed in live readback stored the saved payout dollars but neither a member percentage nor a company percentage. The final display correction derives the shown percentage from the saved payout ÷ saved transaction payout base (after any referral), only when a nonzero saved percentage is unavailable. This is presentation-only and leaves the stored snapshot, GCI, payout, and progression data unchanged.

## Transaction-Fee Payer and Agent Take-Home Detail

The Accounting detail now makes the transaction-fee payer unambiguous and shows the corresponding primary-agent take-home value:

- **Agent(s) pay from commission:** the fee is identified as a deduction from the responsible agent's take-home; the display shows both **Agent net / Primary GCI** and **Agent Take Home** after the applicable fee allocation.
- **Buyer pays directly**, **Seller pays directly**, and **Seller-paid closing cost:** the payer is named and the display states that the fee does not reduce agent take-home.

The view calls the canonical `getAgentTakeHome` policy helper rather than introducing a second commission calculation. It is read-only and does not alter GCI, saved split snapshots, transaction data, or rollups.

## Data and deployment boundary

- No production transaction, accounting workflow record, payout, status, or notification preference was changed.
- This is a code-only presentation and snapshot enhancement.
- The normal repository push to `main` triggers the automatic App Hosting rollout. No manual deployment action is used.

## Rollback

Revert the associated code commit. No canonical transaction or Accounting data reversal is needed.
