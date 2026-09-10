# SBUSA-014 Checkpoint — Inactive Agent Review Names

**Status:** Completed and validated locally on September 10, 2026.

## Change delivered

SBUSA-014 corrects the canonical identity resolution used by the active-agent reporting route that powers the Staff & Admin **Inactive Agent Review List**. The prior expression used a conditional-precedence pattern that could discard a valid stored `displayName` and fall through to the agent ID. Review rows now resolve identity in the intended order:

1. Agent profile `displayName`.
2. Legacy profile `name`.
3. Composed `firstName` and `lastName`.
4. Agent ID only as the final safe fallback.

The existing staff table already renders the returned `agent.name` in the Agent column. The correction therefore makes the visible review rows use the canonical human-readable profile name while retaining Team Group, Inactive Date, Departure Date, Start Date, and direct profile review link.

## Canonical source and lifecycle preservation

The change reuses the existing `agentProfiles` data read by `/api/broker/active-agents`; it does not create a separate roster, name cache, or lifecycle store. Inactive-review membership continues to use the shared `classifyAgentLifecycle(agent, currentAsOfDate)` calculation and includes only effective **Inactive** agents, not confirmed **Out** departures. Archive behavior, active-only operational selectors, lifecycle dates, and historical records remain unchanged.

## Validation

| Validation step | Result |
|---|---|
| SBUSA-014 focused plus active-agent safeguards | Passed: 8 tests covering canonical display-name priority, visible review columns, effective lifecycle classification, departures, inactive review, and grace boundaries. |
| Full `pnpm run prebuild` safeguard suite | Passed: 216 tests. |
| Production build | Completed successfully after compile, 296 static-page generation, and route-manifest output. |
| Typecheck | No SBUSA-014 changed-file diagnostics. The repository retains its documented generated Next route-context baseline. |
| Working-tree integrity | `git diff --check` passed and generated build stamp was restored. |

## Assumptions and open items

An agent ID remains visible only if every canonical human-readable profile-name field is empty. This is intentional: it prevents an unidentifiable blank staff row and identifies the profile that needs data cleanup. No production records were modified by this implementation.

## Rollback

Reverting this checkpoint restores the prior name-expression behavior. It does not delete agent profiles, lifecycle dates, inactive-review records, archive records, transactions, or historical reporting data.

## Next queue action

Proceed automatically to **SBUSA-015**: document the operational handoff workflow and establish the required manual end-to-end verification checklist without sending messages, placing test calls, or changing production permissions.
