# COMMAND 4 Audit Notes

## Competition Center
- Already exists at `/dashboard/admin/competitions` with create/list/manage
- Supports NASCAR and Golf themes
- Has scoring engine, types, commentary, audio
- Keaty Cup is a SEPARATE page at `/dashboard/admin/keaty-cup` with its own NASCAR-style display
- Sidebar has both: Competition Center + Keaty Cup as separate links

## Keaty Cup
- 974 lines, standalone NASCAR-style competition with sound engine
- Has its own API at `/api/broker/keaty-cup`
- Fetches active agents and transactions directly
- Has custom rules editor, prizes, etc.

## What needs to happen for Part A (Merge)
- Remove Keaty Cup sidebar link
- Add "Keaty Cup" as a built-in competition type in Competition Center
- The existing competition system already supports NASCAR theme
- Can redirect /dashboard/admin/keaty-cup to competitions page

## Golf Challenge (Part C)
- Already has threshold_map scoring strategy and golf theme
- Needs: negative scoring where 0=par, completions go negative
- Current threshold rules map ranges to scores - need to make this golf-style

## Horse Race (Part D)
- New competition theme needed
- NASCAR-like progress tracking
- Need to add 'horse_race' theme to types

## Recruiting Dashboard (Part E)
- Already has team filter and grace period tracking
- Uses `/api/broker/agent-roster-metrics` which we already updated
- Needs: teamGroup field display, new Status field display (Active/Grace Period/Inactive/Out)
- Currently shows teamName from the old team system, not teamGroup

## Yearly Goals (Part F)
- GoalsEditor component in dashboard/page.tsx
- Has "Even Split" button (resetSeasonality) - sets all months to 8.33%
- Has "Use {year} Seasonality" button (resetSeasonalityToPrev)
- Seasonality comes from prevYearStats which is computed from previous year transactions
- Need to: remove Even Split, add multi-year seasonality options, add All Time average
- The API (command-metrics) only computes prevYear seasonality currently
