# COMMAND 3 Audit Notes

## Leaderboard (Part A)
- Public: `src/app/leaderboard/page.tsx` — fetches from `/api/rollups/leaderboard?year=X`
- Admin: `src/app/dashboard/admin/leaderboard/page.tsx`
- API: `src/app/api/rollups/leaderboard/route.ts` — reads from `agentYearRollups` collection via `getEffectiveRollups()`
- The rollups ARE built from the transaction ledger (via `rebuildAgentRollup`), so data IS from ledger
- Issue: quarterly/monthly tabs say "Coming Soon" — need to add those views
- The leaderboard shows: closed count, pending count, displayName, avatarUrl
- Missing: listings count, recent pendings, recent sold, GCI totals

## TV Mode (Part B)
- TV links: `/leaderboard` (Leaderboard TV), `/new-activity` (Activity Board TV)
- No dedicated TV dashboard page exists — the leaderboard page IS the TV view
- Need to add YTD summary cards at top: Total Team Volume, Total Sales, Total Commissions Paid to Agents

## Agent Dashboard (Part C)
- Dashboard API: `src/app/api/dashboard/route.ts` (928 lines)
- `getTransactionNet()` uses `splitSnapshot.agentNetCommission` or falls back to `commission`
- netIncome = sum of closed transaction nets; netPending = sum of pending transaction nets
- Projected net income = netEarned + netPending (ytdTotalPotential)
- This already pulls from transaction ledger — issue may be that splitSnapshot is not populated on older transactions
- Need to verify the pipeline income calculation uses correct commission data

## Category Breakdown (Part D/E)
- `CategoryBreakdownSection` in `src/app/dashboard/page.tsx` line 2346
- Already has year selector with "All Time" option
- Uses `perfData.overview.sideBreakdown` and `sourceBreakdown`
- When year changes, catYear syncs via useEffect
- Issue: when catYear changes to a different year (not 'all'), it doesn't re-fetch data for that year
  - It only uses the data from the current `perfData` which is for the selected `perfYear`
  - The year selector in CategoryBreakdown is cosmetic for non-'all' years — it doesn't trigger a new API call

## Daily Tracker (Part F)
- `src/app/dashboard/tracker/page.tsx` (732 lines)
- Tracks: calls, engagements, appointments set, appointments held, contracts written
- Missing: Start Time, End Time, daily/weekly/monthly/yearly hours calculation
- Uses `/api/daily-activity` and `/api/daily-activity/range` endpoints

## Active Agent Filtering (Part G)
- Leaderboard API already filters by active/grace_period
- Top agents API already filters
- Need to verify: agent dropdowns, competition views, broker dashboard
