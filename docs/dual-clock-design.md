# Dual-Clock Business Plan Design

## Overview
Two independent measurement windows per business plan:
- **Financial Clock** (`financialStartDate`): Controls grading for net income, volume, closed deals
- **KPI Clock** (`kpiStartDate`): Controls grading for calls, engagements, appt set, appt held, contracts written

Both use **rolling 12-month windows** from their respective start dates.

## Firestore Schema Changes (BusinessPlan)
```
financialStartDate?: string  // YYYY-MM-DD — replaces planStartDate for financial grading
kpiStartDate?: string        // YYYY-MM-DD — new field for KPI grading
planStartDate?: string       // KEEP for backward compat, used as fallback
resetStartDate?: string      // DEPRECATED — cleared on next save
measurementMode?: string     // DEPRECATED — replaced by dual clocks
```

## Migration Logic (on plan load/save)
- If `financialStartDate` not set → derive from `planStartDate ?? resetStartDate ?? Jan 1`
- If `kpiStartDate` not set → derive from `planStartDate ?? resetStartDate ?? Jan 1`
- On save: always clear `resetStartDate` (empty string → FieldValue.delete())

## Rolling 12-Month Window Calculation
```
windowStart = financialStartDate (or kpiStartDate)
windowEnd   = windowStart + 12 months
elapsedDays = today - windowStart  (clamped to 0..windowDays)
windowDays  = 365 (or 366 for leap year spanning)
ytdFraction = elapsedDays / windowDays
ytdGoal     = annualGoal * ytdFraction
```

## Dashboard API Changes (src/app/api/dashboard/route.ts)
- `financialEffectiveStart` = toDate(plan.financialStartDate ?? plan.planStartDate ?? Jan1)
- `kpiEffectiveStart` = toDate(plan.kpiStartDate ?? plan.planStartDate ?? Jan1)
- Financial metrics (netEarned, closedUnits, closedVolume) filtered by `financialEffectiveStart`
- KPI metrics (calls, engagements, appts) filtered by `kpiEffectiveStart`
- KPI daily targets recalculated as: `annualKpiGoal / workdaysInRolling12FromKpiStart`
- `financialWindowEnd` = financialStartDate + 12 months
- `kpiWindowEnd` = kpiStartDate + 12 months

## Plan Page UI Changes (src/app/dashboard/plan/page.tsx)
- Replace single "Plan Start Date" with two fields:
  - "Financial Start Date" — when to start measuring net, volume, deals
  - "KPI Tracking Start Date" — when to start measuring calls, engagements, appointments
- "Set both to today" convenience button
- Remove measurementMode radio buttons (no longer needed)
- Helper text: "Set to Jan 1 for full calendar year. Set to today to start fresh from today."

## Dashboard Page UI Changes (src/app/dashboard/page.tsx)
- Financial report cards show: "📅 From [financialStartDate]" badge
- KPI report cards show: "📅 KPI tracking from [kpiStartDate]" badge
- Only show badge when date is NOT Jan 1 (avoid clutter for standard agents)

## agent-roster-metrics API Changes
- Use `financialStartDate` for income/volume/deals grading
- Use `kpiStartDate` for engagement/appointment grading

## Files to Change
1. src/lib/types.ts — add financialStartDate, kpiStartDate to BusinessPlan
2. src/app/dashboard/plan/page.tsx — new UI fields
3. src/app/api/plan/route.ts — handle new fields on save
4. src/app/api/dashboard/route.ts — dual-clock grading
5. src/app/api/broker/agent-roster-metrics/route.ts — dual-clock grading
6. src/app/dashboard/page.tsx — show clock start badges on report cards
7. src/app/api/projections/route.ts — use financialStartDate for projections

## Scenarios
| Agent | financialStartDate | kpiStartDate | Result |
|---|---|---|---|
| Standard | Jan 1 | Jan 1 | No change from current behavior |
| Ashley (KPI restart) | Jan 1 | July 7 | A on net/volume/deals, fresh KPI grades |
| Noah (KPI restart) | Jan 1 | July 7 | On-track financial, KPI goals recalculated |
| Dominic (full restart) | July 7 | July 7 | Both clocks from July 7 |
| New agent mid-year | Aug 1 | Aug 1 | Both clocks from Aug 1 |
