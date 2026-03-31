# Command 1 — Audit Notes

## Current State

### Agent Profile (AgentProfile type in src/lib/agents/types.ts)
- Has `status: 'active' | 'inactive' | 'on_leave'`
- Has `agentType: 'independent' | 'team'`
- Has `primaryTeamId` — links to a team doc in Firestore `teams` collection
- Has `tiers: AgentTier[]` — for independent agents only
- AgentTier has: tierName, fromCompanyDollar, toCompanyDollar, agentSplitPercent, companySplitPercent, notes
- Team agents use teamMemberOverrideBands or team default plans

### What needs to change for COMMAND 1:

#### Part A — Team + Status
- Status needs two new values: `grace_period` and `out` (currently: active, inactive, on_leave)
- Need a NEW `team` field (string) that is SEPARATE from `primaryTeamId`
  - Options: Referral Group, CGL, SGL, Charles Ditch Team, Independent, + any existing teams
  - This is a GROUPING/REPORTING field, not the same as the team compensation structure
  - `primaryTeamId` is for team compensation plans; `team` is for grouping
- Team and Status must be independent

#### Part B — Commission Template System
- Need team-based commission DEFAULT templates (keyed by the new `team` field)
- Toggle: "Use Team Default Commission" (ON by default)
- When enabled, auto-populate tiers from team template
- Commission structure includes: tier thresholds, agent %, broker %, broker GCI, agent net, transaction fee, caps
- All fields editable; if edited → switch to "Custom Commission Structure"
- "Reset to Team Default" button
- Store commission structure ON the agent profile (not dependent on global defaults)

#### Part C — Auto Commission Calculation
- In Add Transaction, when agent is selected:
  1. Pull that agent's commission structure (tiers)
  2. Determine correct tier based on deal value (need to know agent's YTD company dollar)
  3. Auto-calculate: GCI, broker split, agent split, transaction fee, net to agent, company retained
- Currently the form has manual commission fields; need to auto-fill them

### Key files to modify:
1. `src/lib/agents/types.ts` — add team field, new status values
2. `src/components/admin/agents/AgentProfileForm.tsx` — add team dropdown, new statuses, commission template toggle
3. `src/app/dashboard/transactions/new/page.tsx` — auto-commission calculation
4. `src/lib/commissions/index.ts` — add tier-based split calculation
5. API routes for agents — support new fields
6. Leaderboard/dashboard routes — filter by active status

### Commission Template Defaults by Team:
Need to define default tier structures for each team group.
The existing DEFAULT_INDEPENDENT_TIERS in AgentProfileForm.tsx is the current default.
