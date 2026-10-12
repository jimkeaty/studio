# Settlers Trace Commission-Base Persistence Repair — 2026-10-12

## Scope

Corrected a transaction-editor hydration defect reported for **201 Settlers Trace #4405**. The desired financial rule is:

> **Price Commission Is Based On = sale price minus seller concessions** when staff intentionally enters that reduced base.

The transaction had the correct persisted value after the last protected save: sale price **$185,000**, commission base **$182,000**, commission rate **3%**, gross commission/GCI **$5,460**, and agent net **$4,095**.

## Root cause

The transaction editor had a general auto-fill effect that always replaced `commissionBasePrice` with the sale price once a sale price was present. That effect ran after an existing transaction was hydrated. As a result, a saved concession-adjusted base could display correctly immediately after saving but then appear as the full sale price on a later reload.

The canonical Admin/Staff/TC transaction PATCH route had already persisted the protected correction correctly. The defect was therefore **editor hydration and display behavior**, not a server-side recalculation that rewrote the saved value.

## Repair

Added `commissionBaseHydration.ts`, which compares a saved commission base with the normal status-aware automatic base:

- If the saved base matches the automatic fallback, ordinary sale/list-price auto-fill remains enabled.
- If the saved base differs, it is treated as an explicit operational override and the auto-fill effect is blocked for that loaded transaction.

The unified transaction editor now applies that guard before it hydrates its form fields. This applies to the shared editor used by Agent, Staff, TC, Admin, and Accounting workflows.

## Tests and validation

- Focused behavior tests: **7/7 passed**.
  - A closed transaction with $185,000 sale price and $182,000 saved base remains an override.
  - Normal sale-price and active-list-price bases remain eligible for automatic updates.
- Transaction-form regression suite: **38/38 passed**.
- Full prebuild regression suite: **277/277 passed**, plus referral-income persistence coverage.
- Production build: **passed**.
- Full standalone `tsc --noEmit` still reports the repository's established generated-route/context diagnostics. No diagnostics referenced the changed editor or new commission-base helper.

## Data boundary

No production transaction was modified as part of this code repair. The release protects the previously authorized Settlers Trace correction from being visually overwritten after a refresh.

## Rollback boundary

Revert the release commit to return to the prior editor auto-fill behavior. This code-only rollback does not alter transaction records.
