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

---

## Commission Tier Progression — GCI Standard

### The Rule

**All tier thresholds are based on total Gross Commission Income (GCI)** — the full commission dollar amount on a transaction before any agent/broker split is applied. This is the number entered in the "GCI ($)" field on the Add Transaction form.

This rule applies to every agent type: independent agents, team leaders, and team members. The tier thresholds entered in the admin UI (labeled "From GCI $" / "To GCI $") are always compared against the agent's cumulative GCI within their current anniversary cycle.

| Dollar type | Definition | Used for tier progression? |
|---|---|---|
| **Total GCI** | Full commission before splits (e.g. $15,000 on a $500k sale at 3%) | **Yes — this is the standard** |
| Company-retained dollar | Broker's cut after split (e.g. $3,000 at 20%) | No |
| Agent net commission | Agent's cut after split (e.g. $12,000 at 80%) | No |

### Example

An agent on an 80/20 split with a $100,000 GCI threshold for Tier 2:

- Sale price: $500,000 at 3% commission = **$15,000 total GCI**
- Agent receives 80% = $12,000; broker retains 20% = $3,000
- **$15,000 counts toward tier progression** (not $3,000)
- After $100,000 in cumulative GCI within the cycle, the agent moves to Tier 2

### Anniversary Cycle

Tier progression resets on the agent's **anniversary date** each year, not on January 1. The rollup document key is `{agentId}_{year}` where `year` is the calendar year in which the agent's anniversary falls. For example, an agent with a January 18 anniversary date:

- `_2026` rollup = January 18, 2026 → January 17, 2027
- Transactions closed January 1–17, 2026 count toward the **2025 cycle** (`_2025`), not 2026

Agents with no anniversary date on file default to a January 1 calendar-year cycle.

### Where This Logic Lives

The canonical reference is `src/lib/commission/tierProgressionStandard.ts`. The five implementation files that must stay aligned are:

| File | Role |
|---|---|
| `src/lib/rollups/rebuildAgentRollup.ts` | Accumulates `tierProgressionGci` (total GCI within the anniversary cycle) |
| `src/app/api/transactions/_lib/teamTransactionResolver.ts` | Reads `tierProgressionGci` from rollup for live tier lookup when saving a transaction |
| `src/app/api/admin/agent-profiles/[agentId]/commission/route.ts` | Returns `ytdTierProgressionGci` to the Add Transaction form for tier badge display |
| `src/app/api/dashboard/route.ts` | Uses `splitSnapshot.grossCommission` for the tier progress bar on the agent dashboard |
| `src/app/dashboard/transactions/new/page.tsx` | Uses `ytdTierProgressionGci` in `findActiveTier()` to determine the tier badge |

**Never use `tierProgressionCompanyDollar` or `progressionCompanyDollarCredit` for tier comparison.** These fields store the broker's retained dollar (post-split) and are kept only for backward compatibility with pre-June 2026 rollup documents.

---

## Commission Structure Audit and YTD Rollup Rebuild

### What the Commission Audit Does

Navigate to **Admin → Agents → Commission Structure Audit** (`/dashboard/admin/agents/commission-audit`). The page automatically scans every active agent profile and flags any agent who is missing a valid saved commission structure. An agent is flagged if:

- **Flat plan:** `commissionMode === 'flat'` but `flatAgentPercent` is 0 or missing
- **Team member:** `teamMemberOverrideBands` is empty or all `memberPercent` values are 0
- **Independent agent or team leader:** `tiers` array is empty or all `agentSplitPercent` values are 0

A flagged agent will receive incorrect commission calculations (typically defaulting to 0% or a fallback rate) until their profile is corrected. The audit page shows a count of flagged agents and links directly to each agent's profile for quick remediation.

### What "Rebuild All YTD Rollups" Does

The **Rebuild All YTD Rollups** button (purple, top-right of the Commission Audit page) recalculates and overwrites the `agentYearRollups` Firestore documents for every active agent. For each agent it rebuilds both the current anniversary cycle year and the prior year.

The rebuild re-reads every closed transaction within the agent's anniversary cycle window and recomputes:

- `tierProgressionGci` — cumulative total GCI for tier comparison (the primary field)
- `tierProgressionCompanyDollar` — cumulative company-retained dollar (kept for backward compat)
- `companyDollar`, `agentDollar`, `closedCount`, `closedVolume`, and other YTD aggregates
- `cycleStart` and `cycleEnd` — the exact anniversary cycle dates for the rollup year

The rebuild takes up to 60 seconds for a large roster. A spinner and status message are shown while it runs. On completion the button turns green and shows a count of successfully rebuilt agents.

### When to Run the Rebuild

Run **Rebuild All YTD Rollups** in any of the following situations:

| Situation | Why |
|---|---|
| After a code deploy that changes rollup or tier logic | New fields (e.g. `tierProgressionGci`) are only written to Firestore during a rebuild |
| An agent's tier badge shows the wrong tier on Add Transaction | The rollup document has stale or incorrect YTD data |
| An agent's commission tier progress bar shows the wrong GCI | Same cause — stale rollup |
| An agent's anniversary date was changed | The cycle window changes, so all transactions need to be re-bucketed |
| A historical transaction was edited or deleted | The rollup totals are no longer accurate |
| After a bulk transaction import | Imported transactions are not automatically reflected in rollup documents |

### Per-Agent Rebuild

To rebuild a single agent without running the full batch, go to **Admin → Agents → [Agent Name]** and click the **Rebuild YTD Rollup** button in the page header. This rebuilds the current and prior anniversary cycle years for that agent only and completes in a few seconds.

### Firestore Document Structure

Each rollup document is stored at `agentYearRollups/{agentId}_{year}` and contains:

| Field | Description |
|---|---|
| `tierProgressionGci` | **Primary.** Cumulative total GCI within the anniversary cycle — used for all tier comparisons |
| `tierProgressionCompanyDollar` | Legacy. Cumulative company-retained dollar. Do not use for tier comparison |
| `cycleStart` | ISO date string (YYYY-MM-DD) — start of the anniversary cycle |
| `cycleEnd` | ISO date string (YYYY-MM-DD) — end of the anniversary cycle (day before next anniversary) |
| `companyDollar` | Total company-retained dollar for the calendar year |
| `agentDollar` | Total agent net commission for the calendar year |
| `closedCount` | Number of closed transactions in the cycle |
| `closedVolume` | Total sale price volume in the cycle |
