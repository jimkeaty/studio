# Runbook

This document contains procedures for administrative tasks.

## Applying a Historical Rollup Correction (Year < 2025)

This process allows an administrator to correct aggregated historical data for a specific agent and year without directly modifying the locked, original rollup document. It uses an overlay system.

### How it Works

1.  **Overlay Model**: Instead of editing `agentYearRollups/{docId}` for a locked year, we create a correction document in `historical_overrides/{docId}`. The ID is the same as the target document.
2.  **Audit Trail**: Every correction write also creates an immutable record in `historical_corrections`, capturing the "before" and "after" state of the override for auditing purposes.
3.  **Dashboard Merging**: When the dashboard loads historical data, it fetches both the original rollups and the active overrides. It then merges them in memory to display the "effective" numbers to the user.

### Procedure

To apply a correction, use the `imports/apply-correction.js` Node.js script. This must be run from a machine with authenticated Firebase Admin SDK access.

**Prerequisites:**
- Your UID must be in the admin list within `firestore.rules` and the script itself.
- You must have `gcloud` and `node` installed and configured.

**Command:**
Run the script from the project root, providing all required arguments.

```bash
node imports/apply-correction.js \
  --targetKey="[AGENT_ID]_[YEAR]" \
  --year=[YEAR] \
  --agentId="[AGENT_ID]" \
  --reason="[A_CLEAR_AND_CONCISE_REASON]" \
  --adminUid="[YOUR_ADMIN_UID]" \
  --overrideFields='{"field_to_override": "new_value", "another_field": 123}' \
  --confirm
```

**Arguments:**

- `targetKey`: The document ID of the rollup to correct (e.g., `ashley-lombas_2023`).
- `year`: The historical year being corrected (e.g., `2023`). Must be less than 2025.
- `agentId`: The agent's ID (e.g., `ashley-lombas`).
- `reason`: A mandatory, quoted string explaining why the correction is being made.
- `adminUid`: Your Firebase Authentication User ID.
- `overrideFields`: A **single-quoted JSON string** containing the fields and values to override.
- `confirm`: **Required to execute the write.** Without it, the script runs in dry-run mode.

**Example:**
To correct the number of closed transactions for `alyson-schexnayder` for the year 2024 to 22.

```bash
node imports/apply-correction.js \
  --targetKey="alyson-schexnayder_2024" \
  --year=2024 \
  --agentId="alyson-schexnayder" \
  --reason="Corrected closed count based on end-of-year audit." \
  --adminUid="gHZ9n7s2b9X8fJ2kP3s5t8YxVOE2" \
  --overrideFields='{"closed": 22}' \
  --confirm
```

### Auditing Changes

All changes can be reviewed in the `historical_corrections` collection in the Firebase Console. Each document represents a single change and contains the before/after data, who made the change, and when.