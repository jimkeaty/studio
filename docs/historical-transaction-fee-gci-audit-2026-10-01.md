# Historical Transaction-Fee GCI Audit

**Audit date:** 2026-10-01  
**Status:** Completed, read-only. No production transaction, split snapshot, rollup, queue, or configuration was changed.

## Bottom line

> **41 closed transactions have a definite historic fee-in-GCI signature, overstating saved ledger gross commission by $12,200.00.**

An additional **10 closed transactions** have the same exact arithmetic signature totaling **$3,460.00**, but each carries a manual-override flag. They are **probable**, not confirmed, fee inflation and need record-level review before any correction.

## Scope and source

- Authenticated, read-only production query: `GET /api/admin/transactions?year=all`.
- **10,816** canonical transaction records were returned.
- **9,818** were Closed; **1,519** Closed records had a nonzero stored transaction/compliance fee.
- This report evaluates the canonical saved transaction / `splitSnapshot`; it does not infer results from screen display alone.

## Audit rule

For each Closed record with a nonzero fee, expected gross commission was calculated from:

1. **Price Commission Is Based On** (`commissionBasePrice`) where present; otherwise Sale Price for Closed files, with List Price only as fallback;
2. saved percentage commission rate, or saved flat-dollar commission when that method is explicit;
3. permitted shortage and warranty adjustments; and
4. **never** the transaction/compliance fee.

A record is a **definite fee-inflation candidate** only when:

```text
Saved snapshot gross commission − permitted gross commission = stored transaction fee
```

and no manual GCI/commission override is set. That exact-to-the-cent test is strong evidence of the historical defect; it is not a broad mismatch search.

## Results

| Classification | Records | GCI amount | Interpretation |
|---|---:|---:|---|
| Definite fee inflation | 41 | $12,200.00 | Exact fee-sized excess; no manual override |
| Probable manual fee inflation | 10 | $3,460.00 | Same exact excess but manual override requires review |
| Compliant | 332 | — | Saved snapshot agrees with permitted gross commission |
| Other discrepancy | 992 | Not totaled | Not attributable to the fee from this test; may reflect a manual override, flat-dollar deal, commission-base issue, shortage/warranty, or legacy data |
| Insufficient inputs | 144 | — | Missing usable rate or flat-dollar input |

### Definite candidates by close year

| Year | Records | Saved-snapshot GCI overstatement |
|---:|---:|---:|
| 2023 | 1 | $150.00 |
| 2024 | 13 | $3,590.00 |
| 2025 | 25 | $7,670.00 |
| 2026 | 2 | $790.00 |

### Probable manual candidates by close year

| Year | Records | Potential GCI overstatement |
|---:|---:|---:|
| 2025 | 1 | $150.00 |
| 2026 | 9 | $3,310.00 |

## Definite fee-inflation inventory — 41 records

All 41 records below have the exact fee-sized excess and no manual GCI/commission override. The stored fee payer is absent on these legacy records, but the amount is present and exactly matches the saved-snapshot GCI excess.

| Close date | Address | Agent | Saved snapshot GCI | Expected GCI | Fee / excess | Record ID |
|---|---|---|---:|---:|---:|---|
| 2023-07-06 | 301 Ayreshire | Becky Etzel | $8,400.00 | $8,250.00 | $150.00 | `MjQ6ZWjY7PaPsHUHp3XM` |
| 2024-08-15 | 1196 Coteau Rodaire Hwy | Greg Landry | $11,250.00 | $11,100.00 | $150.00 | `zZANQv81XnaAc5mTRw6T` |
| 2024-09-09 | 102 Deer Treer | Brittanie Thompson | $6,975.00 | $6,900.00 | $75.00 | `t1X1ZLHRKO4ITbYv1AGz` |
| 2024-09-10 | 115 Pine Peak Drive | Tyler Albrecht | $11,945.00 | $11,550.00 | $395.00 | `Lh6DyViUX1c0OmImnrr6` |
| 2024-09-10 | 1707 Saddle Back Ridge | Joshua Rodriguez | $11,795.00 | $11,400.00 | $395.00 | `Kggm1hQVlq65pisIZgWF` |
| 2024-09-10 | 203 Cedar Peak Ln. | Dyllan Hawkins | $12,645.00 | $12,250.00 | $395.00 | `Wfm0g1lb8BjCoGwsDZxh` |
| 2024-09-25 | 327 Rena Drive | Ashley Lombas | $6,600.00 | $6,450.00 | $150.00 | `DSwHNDfMIojiBAqWCoPy` |
| 2024-10-16 | 120 Old Cane Court | Jessica Parker | $11,195.00 | $10,800.00 | $395.00 | `L6U0n3bgCDYO4C63PkeX` |
| 2024-10-25 | 106 Sawtooth Rd | Ashley Lombas | $8,100.00 | $7,950.00 | $150.00 | `FCcLjBI8pDNprJ2t0HO7` |
| 2024-11-19 | 203 Oak Heights Dr. | Erin Glynn | $11,870.00 | $11,475.00 | $395.00 | `i0Z3EUYgtZs4jKANHxvv` |
| 2024-11-27 | 115 Oak Heights Drive | Joshua Rodriguez | $10,995.00 | $10,600.00 | $395.00 | `vMZVgoTtp0RUp4pCB4gJ` |
| 2024-11-27 | 208 Debby Dr | Michele Ezell | $5,400.00 | $5,250.00 | $150.00 | `TEGt6l2DMPaFVsWkuStt` |
| 2024-11-27 | 750 Sunset Strip | Tyler Albrecht | $10,685.00 | $10,290.00 | $395.00 | `qfcIbbNeUFoKqNbox2Dx` |
| 2024-12-02 | 101 Kettle Court | Erin Glynn | $8,400.00 | $8,250.00 | $150.00 | `G9H7XBBfBwYtMWOvBmHE` |
| 2025-01-09 | 205 Milton Estate Lane | Shelly Hebert | $6,725.00 | $6,330.00 | $395.00 | `TpkC8sQGokfuQiNPyPZv` |
| 2025-02-11 | 301 Adry Ln | Dyllan Hawkins | $6,195.00 | $5,800.00 | $395.00 | `USe4PMQRfYLybMxlspAN` |
| 2025-03-11 | 209 Boxview St | Jason Ray | $6,650.00 | $6,500.00 | $150.00 | `xngSNP8nkkpi8kMhXVj0` |
| 2025-03-12 | 107 Bayouview Dr | Renee Dore | $2,550.00 | $2,400.00 | $150.00 | `z1KfT7T5fEV8KbRMQVbG` |
| 2025-03-12 | 709 Deer Fork Xing | Rachel North | $8,995.00 | $8,600.00 | $395.00 | `4fVtDbp1hiUW7jL0nBKp` |
| 2025-04-30 | 521 Broussard Hill Drive | Joshua Rodriguez | $12,320.00 | $11,925.00 | $395.00 | `JQGmzxhhOO3rZHvnIrGg` |
| 2025-04-30 | 832 St Thoms | Tyler Albrecht | $7,595.00 | $7,200.00 | $395.00 | `udjmX02Oj0VIxg1zGeME` |
| 2025-05-16 | 404 Easy Rock Landing | Ethan Broussard | $9,600.00 | $9,450.00 | $150.00 | `lt7of4uMYiDzWBjDylXd` |
| 2025-05-22 | 134 Senator Picard | NOAH NORRIS | $12,345.00 | $11,950.00 | $395.00 | `DCtLpZi1VQxvLVYK6gPT` |
| 2025-06-06 | 100 Sugarcreek Dr | Chasidy Burnett | $5,625.00 | $5,475.00 | $150.00 | `OluGefprbFnOOtgrjeNO` |
| 2025-06-18 | 109 Portsmouth | BETHANY JOHNSON | $6,845.00 | $6,450.00 | $395.00 | `z4wy5c0uhajXPWbMJZrB` |
| 2025-07-03 | 302 Cainwood Ct | Scott Domingue | $7,193.00 | $6,798.00 | $395.00 | `Km2zx5nBtdcz8lgqH8e6` |
| 2025-08-11 | 142 Foxtrot Ln | Jessica Parker | $5,870.00 | $5,475.00 | $395.00 | `WU1LUFsy13PI1HhvWH1I` |
| 2025-08-18 | 2196 Atchafalaya River Hwy L | Chasidy Burnett | $1,745.00 | $1,350.00 | $395.00 | `QNWZWA6WIXbfG5nPH3Kj` |
| 2025-08-25 | 104 Esperance Lane | Jason Ray | $7,530.00 | $7,380.00 | $150.00 | `0qG1GEwnDnyVIElZlGIo` |
| 2025-09-02 | 701 W 8th St | Scott Domingue | $3,510.00 | $3,360.00 | $150.00 | `DFzVLB9RSDPgit30zgq5` |
| 2025-09-09 | 100 Oak Haven Dr | Heather Guidroz | $8,487.05 | $8,092.05 | $395.00 | `3iMa1MW0kV4PanLAqY2v` |
| 2025-09-12 | 102 Blue Harbor Ln | Jim Keaty | $10,150.00 | $10,000.00 | $150.00 | `eGsXAzjYUS94DiwVcYqE` |
| 2025-09-24 | 100 Golden Cypress | Derrian Bordelon | $10,895.00 | $10,500.00 | $395.00 | `sqlSSBCELS0tt5zyESmA` |
| 2025-10-10 | 234 St. Joseph | Jessica Parker | $4,295.00 | $3,900.00 | $395.00 | `TyllJJ9A48e9FQTH1LoN` |
| 2025-10-27 | 217 Amsterdam | Jason Ray | $1,070.00 | $920.00 | $150.00 | `ToGQCA6dQSEJXhCZBpdU` |
| 2025-10-31 | 1638 Grand Bois | Scott Domingue | $3,450.00 | $3,300.00 | $150.00 | `RmBdqrXsoIHwTCOQdvzF` |
| 2025-11-18 | 137 & 141 Brothers Road | Tyler Albrecht | $7,895.00 | $7,500.00 | $395.00 | `18gcy1k0wTaEwNvaCJ3o` |
| 2025-12-01 | 201 Waterside Drive | Erin Roussel | $20,645.00 | $20,250.00 | $395.00 | `Yid8v4orhDq4Af3nW4qi` |
| 2025-12-23 | 1009 Stephen Street | Scott Domingue | $6,370.00 | $5,975.00 | $395.00 | `Ekyu1Xo2XLY2N6Enm8fq` |
| 2026-03-23 | 101 Perry Oak Drive | Tyler Albrecht | $9,392.00 | $8,997.00 | $395.00 | `JpTYOQ5WcUoS0D96uY4o` |
| 2026-03-25 | 612 Gerald Drive | Tyler Albrecht | $5,345.00 | $4,950.00 | $395.00 | `jd4NBEj0jKzYYsoj9BGN` |

## Probable manual-override inventory — 10 records

These records also have an exact fee-sized excess, but their manual override flag means the cause must be confirmed one record at a time before altering data.

| Close date | Address | Agent | Saved snapshot GCI | Expected GCI | Fee / excess | Record ID |
|---|---|---|---:|---:|---:|---|
| 2025-05-28 | 419 Rue Canard | Debbie Foreman | $6,150.00 | $6,000.00 | $150.00 | `Ye4YG2xMMiZnBeacxnpo` |
| 2026-05-04 | 201 Rosenstiel Court, Lafayette, LA 70507 | Dominic David | $5,292.25 | $4,897.25 | $395.00 | `Xw6rIzmMtX9qdQ08bWke` |
| 2026-05-06 | 208 Harbor Bend Boulevard, Lafayette, LA 70508 | Joshua Rodriguez | $7,895.00 | $7,500.00 | $395.00 | `x4A3EDuY5gUIu5dNFGxF` |
| 2026-05-06 | 209 Manor House Lane, Lafayette, La 70507 | NOAH NORRIS | $8,945.00 | $8,550.00 | $395.00 | `OyoPPaI4OYe6mK1b2eD7` |
| 2026-05-07 | 115 Lotus Street | Ashley Lombas | $7,259.75 | $6,864.75 | $395.00 | `D9DgHb7H8RmDwzNOW9AX` |
| 2026-05-14 | 104 Queensford Way, Youngsville, La 70592 | Chasidy Burnett | $7,262.00 | $6,867.00 | $395.00 | `0UtGqfuiR3uQ4PsmAnyL` |
| 2026-05-29 | 100 Desert Storm Drive, Duson, LA 70529 | NOAH NORRIS | $5,945.00 | $5,550.00 | $395.00 | `JQT2lfuh06Rz6tJRSbjh` |
| 2026-06-18 | 510 Saint Thomas St, Lafayette, LA 70506 | Debbie Foreman | $5,490.00 | $5,340.00 | $150.00 | `nsj1qohdjX4gIboD0E8T` |
| 2026-09-08 | 1402 Parkview Drive New Iberia LA 70563 | Heather Guidroz | $6,070.00 | $5,675.00 | $395.00 | `gXhYGRrRcOcV3Ga8fIwN` |
| 2026-09-30 | 104 Polaris Drive Lafayette LA 70501 | Korsica Friels | $6,245.00 | $5,850.00 | $395.00 | `TpuBe9FHIIRRvYTODmfl` |

## Rollup impact and repair boundary

- The 41 definite records affect **29 agent-year rollup groups** across 2023–2026.
- All 41 store the relevant historical gross commission in `splitSnapshot.grossCommission`; legacy `gci` and `commission` fields are not reliable on these records and are often zero.
- None of the 41 definite records had a saved fee payer, co-agent structure, or team snapshot indicator in this audit. That reduces, but does not eliminate, the need for record-level version-safe review.
- Correcting a record changes more than its displayed GCI: its stored split snapshot and the affected agent-year rollup must be reconciled. Tier-cycle effects must be separately analyzed before any batch operation.

## What this audit does **not** prove

- It does not establish that every one of the 992 other discrepancies is wrong or fee-related.
- It does not calculate a safe company-dollar, agent-payout, or tier correction for all 41 records. Those depend on each saved split snapshot and historical team/tier context.
- It does not authorize a bulk rewrite. No production data was changed.

## Recommended remediation sequence

1. **Approve only the 41 definite records** for a controlled correction batch; hold the 10 manual-override records for a separate review list.
2. Before each write, re-read its canonical transaction and fresh Firestore version token; abort that record if its current data differs from this audit evidence.
3. Recalculate the permitted gross commission while preserving the historical split structure—do not use current agent or team settings to reprice historic transactions.
4. Save each transaction through the canonical version-protected route and independently re-read it.
5. Rebuild only the affected agent-year rollups, then compare before/after rollup GCI, company dollar, agent payout, and tier progression. Escalate a record for manual handling where the historical snapshot cannot be reconciled safely.
6. Produce a post-repair reconciliation report and a rollback manifest of original values.

## Confidence and unknowns

- **High confidence:** the 41 definite records contain a fee-sized excess in saved ledger gross commission. The equality holds to the cent and does not depend on current user-interface values.
- **Medium confidence:** the 10 manual-override records were caused by the same historic defect. Their exact arithmetic signature is strong, but the manual override flag is material contrary evidence.
- **Low confidence:** any attribution of the 992 remaining discrepancies to transaction fees without deeper per-record evidence.
