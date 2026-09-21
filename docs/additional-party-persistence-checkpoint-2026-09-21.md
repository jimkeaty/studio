# Additional Buyer and Seller Persistence Checkpoint

**Date:** 2026-09-21  
**Scope:** Canonical transaction records with third and fourth buyers or sellers, including the reported TBD Wainwright listing.

## Finding

The canonical transaction model and current agent submission route already accept `buyer3*`, `buyer4*`, `seller3*`, and `seller4*` fields. The unified transaction editor also hydrated those saved fields when a record was reopened. However, the editor did not restore the local visibility state for the optional third- and fourth-party sections. As a result, a saved additional buyer or seller could be present in the transaction document but remain hidden behind an **Add 3rd/4th Buyer/Seller** button when the file was opened by an Agent, Staff member, TC, Admin, or Accounting user. This presentation defect made persisted contacts appear absent.

The legacy administrative transaction-creation endpoint also did not carry the third- and fourth-party fields forward. Although the current agent-facing form uses the canonical `/api/tc` submission route rather than that legacy endpoint, the omission was repaired to keep every supported creation path compatible with the same transaction schema.

## Repair

The unified editor now detects any saved name, email address, or phone number for each optional party while it hydrates the transaction. It automatically reveals the relevant third- and fourth-party sections, including the prerequisite third-party section when only a fourth-party contact exists. The saved values remain on the single canonical `transactions` document used by Agent, Staff, TC, Admin, and Accounting workflows.

The successful-save Contact Book synchronization now also upserts third and fourth buyers and sellers for the transaction-owning agent. The legacy administrative creation route now persists all twelve third- and fourth-party fields for both sides.

## Validation

| Check | Result |
|---|---|
| Focused additional-party regression | Passed: 4/4 tests |
| Existing contact and transaction-form regressions | Passed: 45/45 tests |
| Full prebuild safeguard suite | Passed: 247/247 tests |
| Production Next.js build | Passed locally |
| Production transaction mutation | Not performed |

The regression test covers the canonical agent, TC submission, Staff Queue, TC Queue, Admin, and legacy creation routes; reopened-form visibility; Contact Book synchronization; and the shared authorized editor used by Accounting.

## Production Boundary

No production transaction was edited, no contact record was created or changed, and no external notification was sent during this repair. The exact stored contents of **TBD Wainwright** could not be independently read from this workspace because it does not hold an authenticated production Firebase session. The repair is designed to reveal already-saved third and fourth seller contacts on that record after deployment; if those fields were never submitted, the editor will correctly remain blank and the contacts will need to be entered once through the normal form.

## Rollback

Revert the commit that contains this checkpoint, the unified editor visibility restore, the Contact Book expansion, the legacy route compatibility patch, and the regression test. No Firestore rollback is necessary because this release performs no migration or data rewrite.
