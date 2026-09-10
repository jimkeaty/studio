# SBUSA-011 Checkpoint — Effective Lifecycle Archive for Inactive and Out Agents

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-011 establishes `src/lib/agents/lifecycle.ts` as the shared lifecycle source for **Active**, **Inactive**, and **Out** classifications. The classifier accepts an explicit business as-of date and evaluates effective dates rather than the timestamp when a user later changed the profile status.

| Lifecycle outcome | Effective rule | Operational treatment |
|---|---|---|
| Active | No inactive or departure/end date is effective as of the selected date | Included in ordinary selectors, the default Agents view, and current operational reporting. |
| Inactive | Inactive Date is effective and no effective departure/end date exists | Removed from active operations and shown in Departed/Lost archive; never counted as Out. |
| Out | Departure / End Date is effective | Takes precedence over Active and Inactive; included in Departed/Lost and Out totals. |

The canonical departure field is the existing profile `endDate`. A legacy `departureDate` is read for backward compatibility. If both fields are populated with different values, the classifier uses the earlier departure date conservatively for headcount, marks the conflict, and exposes a correction message rather than silently discarding either value. A legacy `out` status without an effective departure date is retained in the archive as **Inactive — missing effective date** for correction; it is not misreported as Out.

## Main Agents page and profile behavior

The default Agents card grid and search now show only effective Active agents. Summary controls show **Active**, **Inactive**, **Out**, and **Departed/Lost (Inactive + Out)** totals, which reconcile to the complete profile population for the same as-of date. The explicit **View Departed/Lost Agents** control opens a searchable archive that shows an Inactive or Out badge, the applicable effective date, and any lifecycle-date conflict. Archived cards retain Dashboard and Edit access but no longer render the destructive Delete action.

The profile form clarifies the effective-date meaning of Inactive Date and Departure / End Date. Saving a profile with an already-effective departure/end date persists `status: out`; saving an effective inactive date remains distinct from Out. A future lifecycle date does not take effect early. The same normalization is applied to create and edit routes.

## Selectors, ledger, and reporting

The ordinary authenticated `/api/agent/agents-list` selector and the default `/api/admin/agents` selector now use shared effective-date Active scope. The Transaction Ledger is the deliberate exception: it calls `/api/admin/agents?includeArchived=true` and receives archived identities labeled `(Inactive)` or `(Out)` for historical research. Existing transaction documents and all other references remain unchanged; no profile, transaction, commission, report, attendance record, meeting, recruiting record, or relationship was deleted.

The active-agent reporting route now evaluates lifecycle classification at each historical month end, current Central business date, and projected month end. Director operational eligibility and the Director report-card active roster also use the shared classifier, so future status updates do not remove agents early and historical Inactive-to-Out precedence is preserved.

## Validation

| Validation step | Result |
|---|---|
| SBUSA-011 lifecycle behavior suite | Passed: date boundaries, Out precedence, conflict marking, legacy missing-date safety, and mutual-exclusion reconciliation. |
| SBUSA-011 source regression plus active-agent and SBUSA-001 safeguards | Passed: 12 Node tests. |
| Full `pnpm run prebuild` safeguard suite | Passed: 206 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route manifest output. |
| Typecheck | No SBUSA-011 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and open correction queue

The implementation treats the existing `endDate` field as the canonical confirmed departure date because the shared profile type already defines it that way. A separately imported legacy `departureDate` is retained only for read compatibility. Conflicting populated dates are deliberately flagged for staff correction. No production records were rewritten during this checkpoint.

## Rollback

Reverting this checkpoint removes shared lifecycle classification, archive UI, lifecycle-aware selector filtering, and effective-date reporting updates. It does not remove or alter stored profile dates, historical transactions, commissions, reports, attendance, meetings, recruiting activity, or archived identities.

## Next queue action

Proceed automatically to **SBUSA-012**: reorganize the Director of Agent Development report cards while preserving established score calculations and the canonical sources introduced by SBUSA-002 through SBUSA-011.
