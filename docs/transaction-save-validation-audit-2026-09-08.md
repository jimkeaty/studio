# Transaction Save Validation Audit

**Audit date:** September 8, 2026  
**Scope:** The unified Add/Edit Transaction form and the Agent, Staff Queue, TC, and Admin save routes. This audit covers what can block a save or status update; it does not change commission calculations or queue-routing policy.

## Bottom line

The audit found **four form-level requirements**. In normal use, only two require deliberate agent input: the transaction **status** and a usable **property address** for buyer, listing, and dual files. Transaction side/type and TC routing have valid form defaults. The optional APHW and inspection-scheduling defect reported on September 8 has been corrected: blank optional selections no longer fail validation.[1]

> **A blank optional field should never block a save.** A nonblank field can still be rejected when its value is invalid—for example, malformed email text, a percentage above 100, or a negative dollar amount. Those are data-quality checks, not hidden required fields.

## What is actually required in the unified form

| Requirement | When it applies | What the agent must do | Notes |
|---|---|---|---|
| **Status** | Every transaction | Choose a valid status | Active, Coming Soon, Pending, Closed, Cancelled, or Temp Off Market. A current listing changing to Pending may use Pending. |
| **Transaction side** | Every transaction | Choose buyer, listing, referral, or dual at the start | The form normally opens with Buyer or Listing already selected from the entry choice. |
| **Deal type** | Every transaction | Usually nothing | Defaults to Residential Sale. It must be one of the supported residential, land, or commercial deal types. |
| **Work with TC?** | Every transaction | Usually nothing | Defaults to **Yes**. The form always sends a valid Yes/No routing value. |
| **Property address** | Buyer, listing, and dual files | Enter a usable full address | Client form requires at least five characters; a referral can be saved without an address. |
| **Client name** | New buyer or dual submission only | Enter a buyer, seller, or client name | The form automatically uses the entered buyer or seller name as the client name. New listing and referral files may be submitted without a client name. |

The source of these rules is the form schema and its transaction-create endpoint.[1] [2]

## Every optional field family

All items in the following table may be left blank. Their controls must not be treated as prerequisites for an agent, TC, Staff member, or Admin to save a transaction or change its status.

| Section | Optional fields and choices |
|---|---|
| **Basic details** | Agent display name, pass-through selection, client name on listing/referral files, deal source, MLS number, listing/contract/closing dates, and all optional commercial terms. |
| **Money and commission** | List price, sale price, commission percent/base, GCI, exact gross commission, transaction fee, earnest money, deposit holder, broker/agent percentages and dollars, listing-side commission, buyer-agent offer, buyer closing-cost fields, and agent bonus pass-through. |
| **Client and party contacts** | Every buyer, seller, second-client, outside-agent, lender, title-company, title-officer, and attorney name, email, phone, and address field. |
| **Inspection workflow** | Pre-listing inspection request, pending/buyer inspection request, inspection type, target date, inspector, and both **TC schedule inspections** selections. This includes `tcScheduleInspections`, the field that blocked Ashley’s Pending update. |
| **Marketing and listing services** | Media order, MLS description, sign order, sign-placement address/pin/notes, and every ShowingTime field, including call-order contacts, access/alarm information, and showing preferences. |
| **Warranty and compliance** | Warranty at closing, warranty amount/payer, buyer APHW education request, seller APHW education request, transaction compliance fee, fee payer/allocation, occupancy agreement, commission-shortage details, and buyer funds to bring. |
| **Referrals and co-agents** | Outbound/inbound referral fields, referral fee percentage/dollars, co-agent identity/role, and commission-offer method. Co-agent split values are conditionally checked only after a co-agent is turned on. |
| **Comments and supporting workflow fields** | General comments, notes, documents, inspection rows without a selected vendor, staging details, media notes, and staff-facing instructions. |

## Optional values that are still checked when supplied

| Value type | Rule | Why it can reject a save |
|---|---|---|
| Email | Empty is valid; entered text must be a valid email address. | Prevents unusable email records. |
| Percentage | Empty is valid; entered value must be from 0 through 100. | Prevents mathematically invalid commission, fee, referral, or split values. |
| Nonnegative money or counts | Empty is valid; entered value cannot be negative. | Protects accounting and reporting calculations. Agent net dollar is intentionally allowed to be negative for fee-heavy files. |
| Co-agent split | Checked only when **Has Co-Agent** is on; primary and co-agent percentages must total 100%. | Prevents incomplete or conflicting production and payout attribution. |
| Manual Admin/Staff percentage override | Checked only when the operational user explicitly edits a percentage split; both values must total 100%, or both can be cleared for a dollar override. | Preserves the approved manual-dollar override behavior. |
| Flat-dollar gross commission | Checked only after **Flat Dollar** is selected; the exact amount must be a valid nonnegative number. | The amount becomes the gross-commission source of truth. |

## Save rules by user and workflow

| User/workflow | Content fields that may block the save | Other intentional safeguards |
|---|---|---|
| **Agent: new transaction** | The requirements in the first table. | Must be signed in. The create route accepts only supported transaction side/type values. |
| **Agent: existing transaction/status change** | No extra content fields are required beyond the client form. Pending is an allowed agent status. | The agent must own the file or have valid team-leader authority. Closed files are agent read-only. A stale file changed by someone else requires refresh before saving. |
| **Staff Queue** | No broad client, inspection, warranty, marketing, or Pending-detail requirement. | Queue item and linked canonical transaction must exist; user needs operational authority; stale-write protection can require a refresh. |
| **TC** | No broad transaction-content requirement while reviewing or updating an intake. | TC workflow status/action must be valid. Approval requires an assigned agent and cannot repeat an already-approved intake. |
| **Admin/Staff direct transaction edit** | No broad field requirement. Conditional financial rules apply only if the operational user elects those override methods. | Transaction ID is required; no-op updates are rejected; a closed listing cannot be changed to Temp Off Market; stale writes require refresh. |

The route behavior above was verified from the current canonical APIs.[2] [3] [4] [5]

## Findings and repairs

| Finding | Status | Result |
|---|---|---|
| APHW choices looked optional but blank values failed schema validation. | **Repaired** | Blank, Yes, and No now all save. |
| `tcScheduleInspections` and related optional select fields could reject legacy/blank data during an Active-to-Pending update. | **Repaired** | Every optional select family now accepts its blank form value. |
| Many optional financial and party fields can reject malformed values if filled in. | **Expected behavior** | This protects usable data; leaving them blank is allowed. |
| Failed initial save may remain only on the open form until the 30-second draft auto-save occurs. | **Open follow-up** | This is a recovery concern, not a validation requirement. It should be improved so a failed submission immediately creates/updates a draft. |

## Regression evidence

The new validation-audit regression verifies the required fields, blank-safe optional selections, Agent Pending status permission, and server-side create/update boundaries. It is registered in the project safeguard suite. The focused transaction-form regression also confirms the pending TC/inspection workflow fields no longer reject blanks.[6]

## Recommendation

Keep the current small requirement set. Removing the address requirement for buyer/listing/dual files or allowing a buyer/dual file without any client name would create ambiguous operational records and reduce the usefulness of the TC/Staff queue. The better safeguard is the one now in place: all voluntary workflow details remain optional, while only the minimum information needed to identify and route a transaction is checked.

**Confidence:** High for the audited code paths; no live database records were changed during this audit. The remaining operational test is to have an agent save an Active-to-Pending listing with all optional sections blank.

## References

[1]: https://github.com/jimkeaty/studio/blob/main/src/app/dashboard/transactions/new/page.tsx "Unified Add/Edit Transaction form schema and submit flow"
[2]: https://github.com/jimkeaty/studio/blob/main/src/app/api/tc/route.ts "New transaction intake validation"
[3]: https://github.com/jimkeaty/studio/blob/main/src/app/api/agent/transactions/%5BtxId%5D/route.ts "Agent transaction update validation"
[4]: https://github.com/jimkeaty/studio/blob/main/src/app/api/admin/staff-queue/%5BitemId%5D/route.ts "Staff Queue transaction updates"
[5]: https://github.com/jimkeaty/studio/blob/main/src/app/api/admin/transactions/route.ts "Admin transaction update validation"
[6]: https://github.com/jimkeaty/studio/blob/main/scripts/transaction-save-validation-audit-regression.test.mjs "Transaction save validation audit regression"
