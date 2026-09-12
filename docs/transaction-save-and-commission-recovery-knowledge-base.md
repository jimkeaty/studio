# Smart Broker Transaction Save and Commission Recovery Knowledge Base

## Purpose

This document is the project’s operating baseline for recovering from transaction-save, commission-calculation, and Accounting-handoff defects. It applies to **Agent, Staff, TC, Admin, and Accounting** workflows that modify the canonical Smart Broker transaction. It does not promise that every field in every unrelated product module can never fail; it defines the required protections and recovery path for transaction and payout changes.

## Canonical Persistence Contract

| Requirement | Rule |
|---|---|
| One source of truth | The canonical `transactions` document owns operational status, commission inputs, payout snapshots, credits, fee responsibility, and Accounting status. |
| Version-safe update | Every authorized operational save must use the transaction’s current version and reject a stale save rather than overwriting newer information. |
| Source-aware commission | Normalize the lead source before selecting source-specific CGL bands. Sphere and company-generated lead bands must not be selected by overlapping dollar ranges alone. |
| Automatic calculation | A changed commission-driving field rebuilds the canonical split and credit snapshot unless an explicit manual override is active. |
| Manual percentage edit | Save both sides at a total of 100%; the editor provides the complementary percentage. |
| Manual dollar edit | Clear the percentage pair and store a deliberate manual-override state. |
| Flat-dollar calculation | Persist the method and exact amount as GCI, rebuild the snapshot, then retain any explicitly authorized direct correction. |
| Team payout | Retain member, leader, and brokerage values in the saved snapshot; apply an agent-paid transaction fee only to Agent Take Home. |
| Accounting handoff | Closed Staff approval or complete action creates one idempotent Accounting handoff on the same transaction. |

## Lead-Source Commission Rules

Source-specific plan rules must be read from the assigned agent/member plan as configured at calculation time. For Madelyn’s tested CGL plan, a **sphere** source selects the configured **80% agent / 20% brokerage** band, while **BoomTown/company-generated** selects the configured **60% agent / 40% brokerage** band. These figures are plan-specific examples, not global defaults for every agent.

## Mandatory Recovery Sequence

1. Inspect the saved record read-only and capture the full commission/persistence card.
2. Identify whether the fault is validation, source normalization, update allowlist, stale version, resolver recalculation, explicit override handling, or a queue handoff mismatch.
3. Repair the shared canonical path; do not add a secondary calculation or write-store workaround.
4. Add a targeted regression and retain the broader transaction/commission safeguards.
5. Run focused tests, changed-file diagnostics, prebuild safeguards, and a clean production build.
6. Publish the code, verify the live build, then obtain explicit authorization for any one-record production mutation.
7. Re-read the affected record, reconcile the payout/queue state, and document rollback.

## Existing Safeguards

The prebuild suite protects source-aware CGL splits, flat-dollar persistence, direct percentage/dollar override behavior, transaction version guards, pass-through policy, team snapshots, agent take-home treatment, Staff-to-Accounting handoff, and closed-file historical tier behavior. Run the reusable **Smart Broker Team Commission Recovery** skill when a staff member reports a related issue.

## Limits and Escalation

An automated safeguard proves the tested code path, not every future staff workflow or browser/device condition. When an issue appears, use the runbook to capture exact transaction and role context, preserve the current record, and test the affected route before changing payout data. Do not bulk rewrite historical transactions or plans without record-by-record evidence and explicit authorization.
