# Unified transaction save investigation — 2026-08-11

## Root causes confirmed

1. The shared form classified only admins and the `tc` role as elevated editors. Standard staff users therefore submitted Staff Queue edits to the agent-only PATCH route.
2. The authoritative elevated transaction endpoint silently dropped 48 editable fields because they were absent from its whitelist.

## Deployed correction

Commit `eb6e67a` routes all non-impersonated admin, TC, and staff users to `/api/admin/transactions` and expands the whitelist to cover all 154 editable fields found in the unified edit form. The field audit now returns zero missing fields.

## Live test target

The Staff Queue currently contains the safe test record **133 agent test buyer** for Adam Angers, listed as a Pending → Closed status change. It will be used to verify a simple non-financial change persists through Staff Queue without affecting a client-facing transaction.

The corrective build is live as **`eb6e67a-master`**. The Staff Queue review item is `daAVlSBO2TXW6GBuoopO`; it redirects to the shared form for the linked transaction and is currently loading for the test.

Staff Queue test baseline: the linked transaction is `N4uVESxU7SdV6wa9SdGU` (133 agent test buyer). The editable `additionalComments` field is currently blank and will receive a timestamped verification note, providing a non-financial persistence test that can be cleanly removed afterward if desired.

Initial Staff Queue test result: the test note populated in the form, but clicking the queue action-bar Save Changes button triggered **no network request at all**. This proves the form is being blocked before the authoritative save endpoint; it is not another Firestore persistence failure. The current action-bar handler has no invalid-form callback, so it fails silently instead of identifying the blocked field.

The in-form submit attempted the same test and was blocked by form validation before the transaction write. The view scrolled into the inspection area, confirming an existing legacy inspection value is being treated as invalid even though inspections are optional. The next diagnostic step is to read the exact client-side validation errors from the form console output.

The React form did not expose any `aria-invalid` controls or structured console errors after the blocked submit. This points to browser-native validation (for example, an invalid date input) rather than a Zod required-field error.
