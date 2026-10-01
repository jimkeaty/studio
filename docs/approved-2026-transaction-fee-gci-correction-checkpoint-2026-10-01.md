# Approved 2026 Transaction-Fee GCI Correction Checkpoint

**Date:** 2026-10-01  
**Scope:** Two exact 2026 fee-in-GCI records approved by Jim.  
**Production mutation:** Completed and independently re-read.

## Authorization and boundary

Jim explicitly approved correction of these two records only:

1. `JpTYOQ5WcUoS0D96uY4o` — 101 Perry Oak Drive
2. `jd4NBEj0jKzYYsoj9BGN` — 612 Gerald Drive

The broader historical-audit candidates were **not** changed. No transaction fee, agent payout, brokerage retained amount, transaction status, document, TC queue item, Accounting item, notification preference, team plan, agent plan, or other transaction was changed.

## Why these two were safe to correct

Both records were Closed, had no manual GCI/commission override, had no co-agent allocation, and matched the exact audited defect:

```text
saved splitSnapshot.grossCommission − permitted gross commission = stored transaction fee
```

Each had a $395 stored fee and a $395 excess in saved gross commission. Historical `gci` and `commission` fields were zero; the actual ledger source was `splitSnapshot.grossCommission`.

## Guarded correction mechanism

Commit **`9bfbea4`** added a narrow, admin-only correction endpoint and an immutable two-record manifest. It:

- accepts only the approved manifest and both exact transaction IDs;
- requires current Firestore version values and rejects a stale/changed transaction;
- re-checks the audited status, fee, gross commission, agent payout, brokerage retained amount, override state, and absence of co-agent allocation inside a Firestore transaction;
- changes only `splitSnapshot.grossCommission` and `updatedAt`;
- preserves the transaction fee, agent payout, brokerage retained amount, status, documents, and workflows;
- records an audit event on each canonical transaction;
- does not invoke normal transaction recalculation, TC queue reopening, or notification behavior;
- rebuilds only the affected agent-year rollup(s), then independently re-reads both canonical records.

## Validation before production mutation

| Validation | Result |
|---|---|
| Focused correction behavior tests | 3/3 passed |
| Focused correction-route regression tests | 2/2 passed |
| Full prebuild safeguards | 257/257 passed |
| Production build | Passed |
| Automatic App Hosting rollout | Passed |
| Public build marker | `9bfbea4-master` |

## Production reconciliation

| Transaction | Canonical ID | Gross commission before | Gross commission after | Transaction fee | Agent payout before / after | Brokerage retained before / after |
|---|---|---:|---:|---:|---:|---:|
| 101 Perry Oak Drive | `JpTYOQ5WcUoS0D96uY4o` | $9,392.00 | **$8,997.00** | $395.00 | $7,197.60 / $7,197.60 | $1,799.40 / $1,799.40 |
| 612 Gerald Drive | `jd4NBEj0jKzYYsoj9BGN` | $5,345.00 | **$4,950.00** | $395.00 | $3,960.00 / $3,960.00 | $990.00 / $990.00 |

### Post-write facts

- Both canonical records returned HTTP 200 on independent re-read.
- Both remain **Closed**.
- Their $395 transaction fees remain recorded separately.
- Both had no TC intake ID and no Accounting closeout status before or after correction.
- Tyler’s 2026 rollup was rebuilt from the corrected canonical ledger.
- The active progression cycle is **2026-02-19 through 2027-02-18**, which contains both March 2026 closings.
- Tyler’s verified tier-progression GCI changed from **$148,731.59** to **$147,941.59**: a correct reduction of **$790.00**.
- Tyler’s verified tier-progression company-dollar remained **$31,026.34** (stored API precision: `31026.339999999997`).
- The published team tier response shows the active tier range beginning at $0 and ending at $900,000; the $790 correction does not approach that upper threshold.

## Rollback boundary

No automatic rollback is enabled because the correction was a live financial-data mutation. If a rollback becomes necessary, an authorized, version-protected correction must restore only these exact historical gross-commission values:

| Transaction | Restore `splitSnapshot.grossCommission` to |
|---|---:|
| 101 Perry Oak Drive | $9,392.00 |
| 612 Gerald Drive | $5,345.00 |

Any rollback must preserve the already-confirmed fee, agent payout, brokerage retained amount, Closed status, and historical split structure, then rebuild Tyler’s 2026 rollup again.

## Remaining scope

The other **39 definite** historical fee-in-GCI records and **10 probable manual-override** candidates remain untouched. They need separate authorization and the same record-level, version-protected process; no batch rewrite is authorized by this checkpoint.
