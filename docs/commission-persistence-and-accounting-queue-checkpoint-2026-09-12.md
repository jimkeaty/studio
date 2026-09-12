# Commission Persistence and Accounting Queue Checkpoint — 2026-09-12

## Scope and Queue Order

This checkpoint records the three queued items in their required order:

1. **00 Critter Creek / Madelyn:** wrong source-based split and blocked authorized save.
2. **Broader flat-fee and manual correction persistence:** stale calculations and edits that did not persist.
3. **Staff closeout to Accounting Queue:** closed Staff files not appearing in Accounting.

## 1. 00 Critter Creek / Madelyn

### Verified Cause

Madelyn’s active CGL member plan contains overlapping custom payout ranges: sphere leads are **80% / 20%**, while company-generated leads are **60% / 40%**. The original resolver selected the first matching dollar range without reading the canonical normalized lead source. That source-blind behavior could select a generic **70% / 30%** range instead of the intended lead-source-specific rule.

The editor’s independent percent-input behavior also made ordinary percentage corrections fail the 100-percent validation shown in the supplied screenshot. A user changing one side could submit a transient pair such as 55/45 only after manually synchronizing both fields; a partially updated pair triggered the blocking error.

### Implemented Repair

The published source-aware repair is documented in `00-critter-creek-commission-repair-2026-09-12.md`. It selects custom CGL bands by the canonical normalized lead source and threads that source through new transaction, TC, Staff Queue, Admin Ledger, and commission-preview paths. Sphere source now selects the intended **80% / 20%** band; company-generated source selects **60% / 40%**. The editor now synchronizes the complementary percentage during an authorized percentage edit, while manual-dollar override remains available by clearing both percentages.

### Live Record Status

The code repair was published, but the public live build marker at **2026-09-12 04:25 UTC** still reported **`ef51d76-master`**, which predates the source-aware Critter Creek repair. Therefore, the one-record production correction was intentionally **not** attempted. The correct live record action remains gated on confirmed deployment of the published repair.

## 2. Flat-Fee and Manual Override Persistence

### Verified Cause

The Admin Ledger could persist a flat-dollar method and replacement GCI while leaving a stale profile-derived snapshot. Staff and TC already rebuilt calculations and then merged authorized direct corrections; the Admin Ledger did not consistently follow that same sequence.

### Implemented Repair

Commit **`186cedd`** updates the Admin Ledger to rebuild canonical calculations when a flat dollar, GCI, percentage, base, price, source, referral, agent, or relevant date changes. It then applies the authorized direct correction after recalculation, preserving the explicit operational edit, manual overrides, pass-through policy, team snapshots, and agent-paid fee treatment.

## 3. Staff Closeout to Accounting Queue

### Verified Cause

The Staff Queue editor exposes **Approve** as its user-facing closeout action. The server created an Accounting Queue entry only for an action named **complete**, which the Staff editor did not send. Consequently, a closed transaction could be approved by Staff without the departmental Accounting handoff.

### Implemented Repair

Commit **`21a33d6`** now runs the existing idempotent `handoffClosedTransactionToAccounting` helper when a Staff user either **approves** or **completes** a linked transaction whose canonical status is `closed`. The Accounting notification is sent only for a newly created/reopened handoff, preventing repeated approval clicks from sending duplicate alerts.

## Validation

| Repair | Focused validation | Full safeguard suite | Production build |
|---|---|---:|---|
| Critter Creek source-aware split and paired percentage persistence | Passed | Passed | Passed before publication |
| Flat-fee and manual correction persistence | Passed: 4 flat-dollar tests | Passed: 240 tests | Passed |
| Closed Staff approval Accounting handoff | Passed: 4 Accounting tests | Passed: 240 tests | Passed |

The repository-wide typecheck retains the known generated Next.js route-context baseline. No changed-file diagnostics were found for these repairs.

## Preservation and Rollback

No team plan, agent plan, historical transaction, Accounting Queue case, or production payout was bulk-modified. The Critter Creek production record was deliberately left unchanged until its source-aware support is confirmed live. Each code repair is reversible by reverting its single commit; a rollback does not rewrite existing stored transaction snapshots.

## Required Manual Verification After Rollout

1. Confirm the public build marker has advanced beyond `ef51d76-master` and includes the relevant published commit.
2. Reopen 00 Critter Creek, confirm its normalized sphere lead source, and use the version-protected save path to apply **80% Madelyn / 20% KRE**.
3. Test a disposable or non-production record with a flat-dollar commission change and a direct authorized commission correction; reopen it to confirm values persist.
4. Close and approve a test Staff Queue file whose transaction status is `Closed`; confirm it appears in Accounting without a duplicate notification on a second approval.
