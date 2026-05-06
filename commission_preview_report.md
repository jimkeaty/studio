# Transaction Compliance Fee: Commission Preview Logic

This report details exactly how the **"Your Estimated Earnings on This Deal"** preview card calculates and displays the agent's take-home pay based on the Transaction Compliance Fee settings.

The logic described below is implemented identically in both the **Add Transaction** page (`/dashboard/transactions/new/page.tsx`) and the **Admin Edit Transaction** page (`/dashboard/admin/transactions/edit/page.tsx`).

## Core Calculation Rules

The system uses the following base variables for all calculations:
- **GCI**: Gross Commission Income (the total commission before any splits or fees).
- **Agent Dollar**: The agent's split of the GCI, calculated as `GCI × Agent %`. The tier lookup and split percentage are **always based on the full GCI**, regardless of who pays the compliance fee.
- **Fee Amount**: The dollar amount entered in the `txComplianceFeeAmount` field.

The critical variable that determines the final display is `txComplianceFeePaidBy`. The system evaluates this field to determine if the fee should be deducted from the agent's net pay.

## Scenario Breakdown

The preview card dynamically adjusts its layout, colors, and math based on the selected payer.

### Scenario 1: Agent Pays (Default)

When the agent is responsible for the compliance fee, it is deducted directly from their split.

| Metric | Calculation | Display Format |
|--------|-------------|----------------|
| **Transaction Fee** | `Fee Amount` | Displayed in **red** with a minus sign (e.g., `-$295.00`). |
| **You Take Home** | `Agent Dollar - Fee Amount` | The final net amount after the fee is subtracted. |
| **Footer Note** | None | No additional instructions are needed since the fee is handled internally. |

**Code Logic:**
```typescript
const agentPaysFee = watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && watchedTxCompFeePaidBy === 'agent';
const feeDeduction = agentPaysFee ? watchedTxCompFeeAmt : 0;
const agentNet = agentDollar - feeDeduction;
```

### Scenario 2: Buyer Pays

When the buyer pays the fee, the agent receives their full split, and the fee is collected separately at closing.

| Metric | Calculation | Display Format |
|--------|-------------|----------------|
| **Transaction Fee** | `Fee Amount` | Displayed in **blue** (e.g., `$295.00`). Below it, a blue label reads: *"Collect from Buyer/Title at Closing"*. |
| **You Take Home** | `Agent Dollar` (No deduction) | The full split amount. |
| **Footer Note** | Displayed | A blue warning note appears at the bottom of the card: *"Transaction fee is not deducted from your commission — collect $295.00 separately at closing."* |

### Scenario 3: Seller Pays

When the seller pays the fee directly, the agent receives their full split.

| Metric | Calculation | Display Format |
|--------|-------------|----------------|
| **Transaction Fee** | `Fee Amount` | Displayed in **blue** (e.g., `$295.00`). Below it, a blue label reads: *"Covered by Seller"*. |
| **You Take Home** | `Agent Dollar` (No deduction) | The full split amount. |
| **Footer Note** | Displayed | A blue warning note appears at the bottom of the card: *"Transaction fee is not deducted from your commission — collect $295.00 separately at closing."* |

### Scenario 4: Take out of Seller Paid Closing Cost

When the fee is covered by seller concessions, the agent receives their full split.

| Metric | Calculation | Display Format |
|--------|-------------|----------------|
| **Transaction Fee** | `Fee Amount` | Displayed in **blue** (e.g., `$295.00`). Below it, a blue label reads: *"From Seller Closing Cost Concession"*. |
| **You Take Home** | `Agent Dollar` (No deduction) | The full split amount. |
| **Footer Note** | Displayed | A blue warning note appears at the bottom of the card: *"Transaction fee is not deducted from your commission — collect $295.00 separately at closing."* |

## Summary

The system ensures that the **tier progression and split percentages are never artificially lowered** by the compliance fee. The fee only affects the final "You Take Home" number when the agent is explicitly selected as the payer. In all other scenarios, the system provides clear visual cues (blue text and footer warnings) to remind the agent that they must collect the fee externally.
