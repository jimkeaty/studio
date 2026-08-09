# Smart Broker USA — Architecture Reference

## Single Source of Truth: Transaction Form

**Rule: There is ONE transaction form in this system.**

All transaction editing — for agents, TC, staff, and admin — uses the unified form at:
```
/dashboard/transactions/new?edit={txId}
```

### Entry Points by Role

| Role | Entry Point | URL Pattern |
|------|-------------|-------------|
| Agent | My Transactions → click transaction | `/dashboard/transactions/new?edit={txId}` |
| TC | TC Queue → click intake | `/dashboard/transactions/new?edit={txId}&intakeId={id}&role=tc` |
| Staff | Staff Queue → click item | `/dashboard/transactions/new?edit={txId}&intakeId={id}&role=staff` |
| Admin | Transaction Ledger → click transaction | `/dashboard/transactions/new?edit={txId}` |

### What Changes by Role

The form is identical for all roles. The only differences are:
1. **Commission visibility**: Agents see only their split % and net take-home. TC/staff/admin see full GCI, broker split, and broker net.
2. **TC/Staff action bar**: When `?intakeId=` is in the URL, a sticky action bar appears at the top with Approve, Save & Sync, and a back link to the queue.
3. **Closed transaction guard**: Agents cannot edit closed transactions (read-only). TC/staff/admin can always edit.
4. **Agent picker**: Only shown for admin users adding NEW transactions. Hidden in edit mode.

### Do NOT Create Separate Forms

Do not create separate form components for different roles. If you need role-specific behavior, add it to the unified form via URL params or role checks inside the existing component.

### Key Files

- **Unified form**: `src/app/dashboard/transactions/new/page.tsx` (~6,000 lines)
- **TC queue redirect**: `src/app/dashboard/admin/tc/[id]/page.tsx` (lightweight redirect)
- **Staff queue redirect**: `src/app/dashboard/admin/staff-queue/[itemId]/page.tsx` (lightweight redirect)
- **Admin ledger redirect**: `src/app/dashboard/admin/transactions/edit/page.tsx` (lightweight redirect)
- **Agent detail redirect**: `src/app/dashboard/my-transactions/[txId]/page.tsx` (lightweight redirect)

### Stable Checkpoint

Git tag `stable-unified-form` marks the commit where all four entry points were unified and all save errors were fixed. Roll back to this tag if the unified form breaks.

---

## Transaction Data Model

All transaction data lives in a single Firestore document:
```
transactions/{txId}
```

TC intake data lives in:
```
transactionIntakes/{intakeId}   (or tcIntakes/{intakeId} for legacy)
```

Staff queue items live in:
```
staffQueue/{itemId}
```

All three reference the same `transactions/{txId}` document. There is no separate "TC version" or "staff version" of a transaction.

---

## Commission Calculation Rules

See Training & Help Center article: "Commission Calculation: Fees, Shortage & Closing Cost Pool"

Key rules:
- **Shortage absorbed by agent**: Write-off. No effect on GCI or agent net.
- **Transaction fee ($395) paid by agent**: Post-split deduction from agent take-home.
- **Home warranty paid by agent**: Pre-split deduction from GCI (reduces the base before split).
- **Any item paid by buyer directly or from seller closing cost**: Adds to GCI before split.
