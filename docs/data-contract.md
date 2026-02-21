# Data Contract

This document outlines the canonical data structures used in the Smart Broker USA Firestore database.

## Core Collections

### `users/{userId}`

Stores basic user profile information.

### `dashboards/{userId}/agent/{year}`

Contains the pre-computed, aggregated dashboard data for a specific agent and year. This is the primary source of truth for the agent-facing dashboard.

### `agentYearRollups/{agentId}_{year}`

Stores denormalized, aggregated data for each agent and year, primarily calculated from historical spreadsheets. This collection is optimized for read-heavy operations like leaderboards and brokerage-wide reporting.

**IMPORTANT:** Records for years prior to 2025 are considered historical and are **read-only**. They cannot be modified directly. Corrections must be applied using the `historical_overrides` system.

---

## Historical Corrections System

To maintain the integrity of locked historical data (years < 2025) while allowing for corrections, an overlay system is used.

### `historical_overrides/{targetKey}`

This collection stores the *current active override* for a specific historical document. The document ID (`targetKey`) matches the ID of the document being corrected (e.g., `ashley-lombas_2023`). This allows for a direct lookup of any active corrections for a given document.

| Field | Type | Description |
|---|---|---|
| `targetType` | String | The type of document being overridden. e.g., `"rollup"`, `"transaction"`. |
| `targetKey` | String | The document ID of the record being corrected. For rollups: `"{agentId}_{year}"`. |
| `year` | Number | The year the correction applies to. Used for efficient querying. |
| `agentId` | String | The agent ID associated with the correction. |
| `overrideFields` | Map | An object containing only the fields and their new, corrected values. |
| `reason` | String | A mandatory, human-readable explanation for the correction. |
| `createdAt` | Timestamp | When the override was first created. |
| `createdByUid` | String | The UID of the admin who created the override. |
| `updatedAt` | Timestamp | When the override was last updated. |
| `updatedByUid` | String | The UID of the admin who last updated the override. |
| `active` | Boolean | `true` if the override should be applied. `false` for soft-deleted overrides. |

### `historical_corrections/{correctionId}` (Append-Only)

This collection serves as an immutable audit log of every change made to the `historical_overrides`. A new document is created here for every create, update, or deactivation of an override.

| Field | Type | Description |
|---|---|---|
| `targetType` | String | The type of document being corrected. |
| `targetKey` | String | The document ID of the record being corrected. |
| `year` | Number | The year the correction applies to. |
| `agentId` | String | The agent ID associated with the correction. |
| `changeType` | String | The nature of the change. e.g., `"create_override"`, `"update_override"`, `"deactivate_override"`. |
| `before` | Map | A snapshot of the `overrideFields` from the `historical_overrides` document *before* this change. `null` for new overrides. |
| `after` | Map | The new state of the `overrideFields` in the `historical_overrides` document *after* this change. `null` for deactivations. |
| `reason` | String | The reason for this specific change. |
| `createdAt` | Timestamp | When this specific correction was made. |
| `createdByUid` | String | The UID of the admin who made the correction. |