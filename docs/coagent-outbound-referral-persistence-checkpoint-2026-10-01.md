# Co-Agent Outbound Referral Persistence Checkpoint

**Date:** 2026-10-01  
**Scope:** Prevent a percentage or dollar outbound referral from being lost when a transaction has two internal co-agents.

## Confirmed cause

The canonical ledger correctly gave each co-agent a proportional volume share, but the participant-allocation refresh recalculated Jason Ray and Brad Gobert from their gross co-agent shares and explicitly passed no referral deduction to either calculation. In addition:

- Older TC approval records could retain a nested `outboundReferralFee` object while leaving `hasOutboundReferral` false and omitting the current scalar percentage/dollar fields.
- The unified editor then hid that referral selection upon reopening.
- Agent, Admin, Staff, TC, and direct-create routes did not all treat an outbound-referral edit as a calculation trigger.

This was a persistence/normalization defect, not a volume-credit defect.

## Canonical calculation rule

1. Compute transaction **gross GCI** from the commission base and commission rate.
2. Calculate the outbound referral from total gross GCI. It is neither agent income nor brokerage income.
3. Allocate gross GCI and the referral proportionally across co-agents.
4. Apply each agent's current commission structure to their own post-referral allocation.
5. Apply an agent-paid transaction fee only after that split; it is never part of GCI.

For an even two-agent $650,000 side at 3% GCI with a 25% outbound referral:

| Item | Whole transaction | Each 50% co-agent allocation |
|---|---:|---:|
| Gross GCI | $19,500.00 | $9,750.00 |
| Outbound referral (25%) | ($4,875.00) | ($2,437.50) |
| Net commission base | $14,625.00 | $7,312.50 |
| 75% agent payout | — | $5,484.38 |
| 25% company retained (rounded remainder) | — | $1,828.12 |

At the individual participant level, agent and company payout reconcile exactly to that participant's post-referral base. The stored gross GCI remains $9,750 per participant for representation and GCI reporting.

## Repair implemented

- Added `resolveOutboundReferral()` to normalize both current scalar and legacy nested referral fields.
- Added penny-safe proportional referral allocation for co-agents.
- Updated co-agent allocation refresh to persist per-participant gross commission, referral deduction, payout, and company-retained values.
- Updated Agent, Admin, Staff Queue, TC Queue, and direct transaction creation calculation paths to treat referral changes as financial changes.
- Updated TC approval to persist the scalar referral contract and updated unified-editor hydration so a legacy referral becomes visible instead of being silently hidden.
- Removed the duplicated late Admin referral mutation, leaving one canonical calculation path.
- Corrected leaderless team rounding so the company side receives any one-cent remainder and an individual participant snapshot always reconciles exactly.

## Validation

- Focused referral behavior tests: **3/3 passed**.
- Route/hydration regression tests: **4/4 passed**.
- Full prebuild regression suite: **261/261 passed**.
- Production `pnpm build`: **passed**.

## Production-data boundary

No 102 Jared Drive transaction data was changed during this code repair. The existing record has a saved 50/50 co-agent volume allocation and a 25% referral detail, but its current referral flag/snapshots must be corrected through the version-protected canonical update route only after explicit approval of the exact correction.

The intended correction is limited to that one existing transaction: normalize the 25%/$4,875 referral, preserve each agent's $325,000 volume credit and one side, and refresh only its participant commission snapshots and related rollups. No transaction creation, deletion, re-assignment, or unrelated financial-field update is permitted.
