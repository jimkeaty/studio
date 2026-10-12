# Cooperating commission validation recovery checkpoint — 2026-10-12

## Trigger

After the buyer-side flat-commission repair, a TC reported the same browser error on another transaction:

> `Field: cooperatingAgentCommissionPercent — Cooperating agent commission percent must be less than or equal to 100`

The transaction form had no active percentage offer to validate. The error blocked **Save Changes** before any API route could persist the otherwise-correct transaction.

## Findings

1. Staff, TC, Admin, Accounting, and Agent editors use the same canonical transaction form at `/dashboard/transactions/new` for this workflow. Therefore, this was a shared editor-hydration/validation issue, not separate Staff or TC save-route behavior.
2. The earlier buyer-side correction prevents buyer-side flat GCI from populating the listing-only cooperating-agent percentage field.
3. A further legacy listing/dual shape was still possible: exact-dollar cooperating compensation could be stored in the historical percentage alias, occasionally with a later default `percentage` method. A value above 100 cannot be a valid percentage and should open as an exact-dollar offer rather than cause the client-side `<= 100` validation error.

## Implemented safeguard

- Added `resolveCooperatingCommissionForEditor` in `src/lib/transactions/cooperatingCommission.ts`.
- The shared helper now:
  - leaves buyer-side values out of the listing-only cooperating-offer controls;
  - treats legacy listing/dual values above 100 as `flat_dollar` compensation;
  - preserves valid percentage offers from 0 through 100;
  - does **not** treat an unused zero-value flat field as proof of flat-dollar compensation.
- Updated the unified editor to use this common hydration rule.
- The behavior applies to Agents, Staff, TC, Admin, and Accounting because it is in the shared canonical editor.
- Registered the behavior test in `prebuild`.

## Validation

Focused validation passed:

- 4/4 new helper behavior cases:
  - buyer-side GCI does not become a cooperating offer;
  - legacy listing/dual exact dollars stored in the percentage alias open as exact dollars;
  - valid percentage offers retain percentage mode;
  - a zero-value unused flat field does not overwrite a valid percentage.
- Existing cooperating-commission, transaction-form, and commission-recovery regression suites passed (48 assertions in the focused run).
- Full `pnpm build` passed, including the complete registered prebuild suite.
- Full TypeScript diagnostics still report the repository's pre-existing generated Next route-context errors; no changed-file diagnostic was reported for this repair.

## Production boundary

No production transaction was altered during this repair. It is a code-only release. Once the normal GitHub-to-App-Hosting rollout completes, users should refresh an already-open transaction editor before retrying the save, so the new hydration logic loads.
