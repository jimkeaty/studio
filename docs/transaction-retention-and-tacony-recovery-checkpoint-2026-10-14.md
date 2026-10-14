# Transaction Retention and 109 Tacony Recovery Checkpoint

**Date:** October 14, 2026  
**Scope:** 109 Tacony recovery investigation, 106 Hacker audit, and archive-by-default prevention repair

## Bottom line

1. **109 Tacony is not present** in the live canonical `transactions` collection, Staff Queue, or TC Queue. It cannot be recreated safely from the live database alone.
2. The Firebase/Google Cloud Firestore disaster-recovery inventory was inspected while signed in. **No recoverable backup artifact or point-in-time recovery data was visible in that inventory.** Therefore, there is no verified backup source from which to reconstruct 109 Tacony today.
3. **106 Hacker is correct in the canonical ledger** as two closed sides: Matthew Delcambre's listing side (`8pPCuLLeUwa2I5CAjwhF`) and Tiffany Fontaine's buyer side (`cL6nSevWjTQha4UgFVFu`). The two Staff Queue entries linked to Matthew's side are workflow wrappers, not additional ledger transactions.
4. The application now uses **archive by default** for the identified transaction removal flows. An archive preserves the full canonical transaction, documents, financial snapshots, commission data, and audit history instead of deleting the record.

No production transaction was restored, recreated, edited, archived, or deleted during this work.

## Backup finding and recovery status

The existing `docs/backup-system.md` describes a daily Firestore backup schedule, but the signed-in disaster-recovery inventory did not display a usable backup or PITR artifact. This is a material conflict between documentation and live observable state.

| Recovery item | Status | Evidence / implication |
|---|---|---|
| Locate 109 Tacony from a Firestore backup | **Blocked** | No recoverable backup/PITR artifact was visible in the Firestore disaster-recovery inventory. |
| Rebuild 109 Tacony safely from live data | **Blocked** | The canonical record and queue wrappers are absent; recreating from assumptions could create incorrect commission, side, or historical data. |
| Recover an archived future transaction | **Ready** | The canonical archive helper and existing admin lifecycle endpoint support a versioned archive/restore path with an auditable reason. |
| Verify why the backup inventory is empty | **Open operational issue** | Requires checking Google Cloud backup scheduling/billing/IAM state. A new schedule or billing-backed storage change should be explicitly authorized before it is enabled. |

## Archive-by-default implementation

### What now happens

- A standard ledger removal now performs an **archive**, not a hard delete.
- Archive requires a nontrivial reason and records:
  - actor UID/email,
  - timestamp,
  - reason and operation context,
  - immutable snapshot of address, agent, status, close type, year, sale price, GCI, and source version.
- Archive metadata is stored on the canonical transaction and an event is stored in `transactions/{transactionId}/auditEvents`.
- Related Staff Queue and TC Queue wrapper records are marked archived as indexes only; the canonical transaction remains the source of truth.
- Ledger, agent ledger, Staff Queue, TC Queue, Accounting Queue, and rollup rebuilds exclude archived transactions by default.
- Restore is supported through the existing restricted admin transaction lifecycle action; it requires a reason, writes a restoration audit event, and clears the queue-wrapper archive overlays.

### Changed removal paths

| Former destructive path | New behavior |
|---|---|
| Single Transaction Ledger removal | Archive with reason and audit snapshot |
| Selected ledger bulk removal | Archive each canonical record with shared reason |
| Import cleanup / import-history reversal | Archive transaction records; activity-only cleanup remains explicitly labeled separate from transactions |
| Duplicate-cleanup migration | Archive matching transaction records |
| Co-agent split source replacement | Archive superseded source transaction |
| Agent profile force removal | Archive linked transactions first; profile deletion records an admin audit event |

## 106 Hacker audit

| Agent | Side | Status | Close date | Canonical transaction ID |
|---|---|---|---|---|
| Matthew Delcambre | Listing | Closed | October 13, 2026 | `8pPCuLLeUwa2I5CAjwhF` |
| Tiffany Fontaine | Buyer | Closed | October 13, 2026 | `cL6nSevWjTQha4UgFVFu` |

**Conclusion:** Both expected sides exist. No third canonical transaction or ledger discrepancy was found. Multiple Staff Queue items associated with Matthew's side are historical queue workflow records, not duplicate ledger sides.

## Validation

- Archive lifecycle behavior tests: **3/3 passed**
  - canonical archive preserves financial content and creates an audit event;
  - archive requires a reason and is idempotent;
  - restore returns the canonical document to visibility and writes an audit event.
- Archive policy regression checks: **4/4 passed**
  - all identified transaction removal paths use the canonical archive helper;
  - read and rollup paths exclude archived records;
  - ledger/import controls require archive confirmations.
- Full production build: **passed**.
- Full TypeScript sweep still shows the repository's pre-existing generated/historical Next route-context diagnostics. No changed-file TypeScript diagnostic was introduced by this work.

## Recommendation and decision needed

**Recommendation:** Treat the backup discrepancy as urgent. Do not assume the documented schedule is actually creating recoverable Firestore backups until the live Google Cloud backup schedule and retention are verified.

> Before creating or enabling a Firestore backup schedule, confirm the intended retention period and billing impact. That is a Google Cloud configuration and storage-cost change.

Until a verified backup exists, 109 Tacony should only be recreated after staff provides reliable source documents or a verified export containing the original transaction inputs. The transaction should then be entered through the normal canonical transaction flow—not by copying incomplete fields directly into Firestore.
