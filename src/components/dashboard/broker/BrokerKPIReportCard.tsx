'use client';
// ─────────────────────────────────────────────────────────────────────────────
// BrokerKPIReportCard
// Self-contained component that fetches from /api/broker/active-agents and
// renders colorful grade cards for broker-level agent KPIs:
//   - Active Agents (graded vs monthly goal)
//   - Avg Monthly Deals/Agent (graded vs 1 deal/agent/month goal)
//   - New Hires YTD (informational)
//   - YTD Departures (informational)
//   - Pipeline (informational — candidates tracked)
//   - No Deals Yet (informational — established agents with 0 deals)
//
// Grade math: pct = (actual / goal) * 100  — so 0.78 vs 1.0 goal = 78% (C)
// Visual style mirrors RecruiterReportCard and BrokerageReportCard exactly.
// Drop into any broker admin page with: <BrokerKPIReportCard year={year} />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, UserPlus, UserMinus, BarChart3, AlertTriangle, TrendingUp,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(v: number | null | undefined): string {
  return v != null ? v.toLocaleString() : '—';
}
function fmtDec(v: number | null | undefined, decimals = 2): string {
  return v != null ? v.toFixed(decimals) : '—';
}

function gradeColorScheme(g: string) {
  switch (g) {
    case 'A': return {
      accentBorder: 'border-l-4 border-l-emerald-500',
      badge: 'bg-emerald-500 text-white',
      text: 'text-emerald-700 dark:text-emerald-400',
      progressBar: 'bg-emerald-500',
      paceText: 'text-emerald-600 dark:text-emerald-400',
    };
    case 'B': return {
      accentBorder: 'border-l-4 border-l-blue-500',
      badge: 'bg-blue-500 text-white',
      text: 'text-blue-700 dark:text-blue-400',
      progressBar: 'bg-blue-500',
      paceText: 'text-blue-600 dark:text-blue-400',
    };
    case 'C': return {
      accentBorder: 'border-l-4 border-l-yellow-500',
      badge: 'bg-yellow-500 text-white',
      text: 'text-yellow-700 dark:text-yellow-400',
      progressBar: 'bg-yellow-500',
      paceText: 'text-yellow-600 dark:text-yellow-400',
    };
    case 'D': return {
      accentBorder: 'border-l-4 border-l-orange-500',
      badge: 'bg-orange-500 text-white',
      text: 'text-orange-700 dark:text-orange-400',
      progressBar: 'bg-orange-500',
      paceText: 'text-orange-600 dark:text-orange-400',
    };
    default: return {
      accentBorder: 'border-l-4 border-l-red-500',
      badge: 'bg-red-500 text-white',
      text: 'text-red-700 dark:text-red-400',
      progressBar: 'bg-red-500',
      paceText: 'text-red-600 dark:text-red-400',
    };
  }
}

// Grade: pct = actual / goal * 100 (e.g. 0.78 / 1.0 = 78% → C)
function letterGrade(pct: number): string {
  if (pct >= 100) return 'A';
  if (pct >= 85) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

// ── GoalRing ──────────────────────────────────────────────────────────────────
function GoalRing({ pct, grade, size = 72 }: { pct: number; grade: string; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const strokeColor =
    grade === 'A' ? '#16a34a' :
    grade === 'B' ? '#2563eb' :
    grade === 'C' ? '#ca8a04' :
    grade === 'D' ? '#ea580c' : '#dc2626';
  const trackColor =
    grade === 'A' ? '#dcfce7' :
    grade === 'B' ? '#dbeafe' :
    grade === 'C' ? '#fef9c3' :
    grade === 'D' ? '#ffedd5' : '#fee2e2';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={strokeColor} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="18" fontWeight="900" fill={strokeColor}>{grade}</text>
      <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="10" fill="#94a3b8">{pct}%</text>
    </svg>
  );
}

// ── HeroCard (graded KPI) ─────────────────────────────────────────────────────
function HeroCard({
  title, grade, primary, secondary, performancePct, goalLabel, icon: Icon,
}: {
  title: string; grade: string; primary: string; secondary: string;
  performancePct?: number; goalLabel?: string; icon: React.ElementType;
}) {
  const colors = gradeColorScheme(grade);
  const clampedPct = Math.min(performancePct ?? 0, 100);
  const isPaceAhead = secondary.includes('ahead');
  const isPaceBehind = secondary.includes('behind');
  const paceArrow = isPaceAhead ? '↑' : isPaceBehind ? '↓' : '';
  const paceColorClass = (isPaceAhead || isPaceBehind) ? colors.paceText : 'text-muted-foreground';
  return (
    <Card className={cn(
      'relative overflow-hidden shadow-sm border border-border',
      colors.accentBorder,
    )}>
      {/* Faint watermark grade letter */}
      <div className="absolute -right-3 -top-3 text-[110px] font-black leading-none opacity-[0.05] pointer-events-none select-none">
        {grade}
      </div>
      <CardHeader className="flex flex-row items-start justify-between pb-2 pt-4 px-5 relative z-10">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg shrink-0', colors.badge)}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
            {title}
          </CardTitle>
        </div>
        <div className="shrink-0">
          <GoalRing pct={performancePct ?? 0} grade={grade} size={72} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3 px-5 pb-5">
        {/* Primary value */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight text-foreground leading-none">{primary}</span>
          {performancePct != null && (
            <span className={cn('text-sm font-bold', colors.text)}>{performancePct}%</span>
          )}
        </div>
        {/* Progress bar */}
        {performancePct != null && (
          <div className="space-y-1">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={cn('h-2.5 rounded-full transition-all duration-500', colors.progressBar)}
                style={{ width: `${clampedPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              {goalLabel && <span className="font-medium text-foreground/70">{goalLabel}</span>}
              <span>100% goal</span>
            </div>
          </div>
        )}
        {/* Pace text */}
        <p className={cn('text-xs font-medium leading-snug', paceArrow ? paceColorClass : 'text-muted-foreground')}>
          {paceArrow && <span className="mr-0.5">{paceArrow}</span>}{secondary}
        </p>
      </CardContent>
    </Card>
  );
}

// ── InfoCard — informational only, no grade ───────────────────────────────────
function InfoCard({
  title, value, sub, icon: Icon, colorClass = 'border-l-slate-400', badgeClass = 'bg-slate-500 text-white',
}: {
  title: string; value: string; sub: string; icon: React.ElementType;
  colorClass?: string; badgeClass?: string;
}) {
  return (
    <Card className={cn('relative overflow-hidden shadow-sm border border-border border-l-4', colorClass)}>
      <CardHeader className="flex flex-row items-start justify-between pb-2 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg shrink-0', badgeClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-1">
        <div className="text-3xl font-black tracking-tight text-foreground leading-none">{value}</div>
        <p className="text-xs text-muted-foreground font-medium leading-snug">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface BrokerKPIReportCardProps {
  year?: number;
  initialOpen?: boolean;
}

export function BrokerKPIReportCard({ year: yearProp, initialOpen = true }: BrokerKPIReportCardProps) {
  const { user } = useUser();
  const year = yearProp ?? new Date().getFullYear();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(initialOpen);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/broker/active-agents?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user, year]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi;
  const isCurrentYear = year === new Date().getFullYear();
  const currentMonthNum = isCurrentYear ? new Date().getMonth() + 1 : 12;
  const monthsElapsed = currentMonthNum;

  // Current month's agent count goal (point-in-time target)
  const currentMonthGoal = data?.months?.find((m: any) => m.month === currentMonthNum)?.goal ?? null;

  // ── Grade: Active Agents ──────────────────────────────────────────────────
  // pct = actual / goal * 100  →  70 agents / 80 goal = 87.5% → B
  const activeAgentsPct = (kpi?.currentActive != null && currentMonthGoal != null && currentMonthGoal > 0)
    ? Math.round((kpi.currentActive / currentMonthGoal) * 100) : null;
  const activeAgentsGrade = activeAgentsPct != null ? letterGrade(activeAgentsPct) : 'F';

  // ── Grade: Avg Monthly Deals/Agent ────────────────────────────────────────
  // Goal = 1 deal/agent/month (fixed)
  // pct = avgMonthlyDealsPerAgent / 1.0 * 100  →  0.78 / 1.0 = 78% → C
  const dealsGoal = 1.0; // 1 deal per agent per month
  const avgDeals = kpi?.avgMonthlyDealsPerAgent ?? null;
  const dealsPerAgentPct = avgDeals != null
    ? Math.round((avgDeals / dealsGoal) * 100) : null;
  const dealsPerAgentGrade = dealsPerAgentPct != null ? letterGrade(dealsPerAgentPct) : 'F';

  // ── Pace text helper ──────────────────────────────────────────────────────
  const paceText = (actual: number, goal: number | null, label: string, isDecimal = false) => {
    if (!goal) return `No goal set`;
    const delta = actual - goal;
    const pct = goal > 0 ? Math.abs(Math.round((delta / goal) * 100)) : 0;
    const displayDelta = isDecimal ? Math.abs(delta).toFixed(2) : Math.abs(Math.round(delta)).toLocaleString();
    if (delta >= 0) return `${pct}% ahead of pace · goal: ${isDecimal ? goal.toFixed(2) : goal.toLocaleString()} ${label}`;
    return `${displayDelta} ${label} behind pace · goal: ${isDecimal ? goal.toFixed(2) : goal.toLocaleString()} ${label}`;
  };

  const hasGoals = currentMonthGoal != null;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left shadow-sm hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Broker Agent KPI Report Card</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentYear
                ? `YTD performance vs goals (${monthsElapsed} of 12 months elapsed)`
                : 'Full-year performance vs goals'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>

      {open && (
        <>
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
            </div>
          )}

          {!loading && kpi && (
            <>
              {!hasGoals && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Set agent count goals in the Active Agent Count chart below to see graded report cards.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* ── GRADED: Active Agents ─────────────────────────────── */}
                <HeroCard
                  title="Active Agents"
                  grade={activeAgentsGrade}
                  primary={fmtN(kpi.currentActive)}
                  secondary={
                    currentMonthGoal != null
                      ? paceText(kpi.currentActive, currentMonthGoal, 'agent goal')
                      : 'No monthly goal set — set goals in chart below'
                  }
                  performancePct={activeAgentsPct ?? undefined}
                  goalLabel={currentMonthGoal != null ? `Goal: ${currentMonthGoal} agents` : undefined}
                  icon={Users}
                />

                {/* ── GRADED: Avg Monthly Deals/Agent ──────────────────── */}
                {/* Grade = avgMonthlyDealsPerAgent / 1.0 goal × 100        */}
                {/* 0.78 / 1.0 = 78% → C  (not "87% behind")               */}
                <HeroCard
                  title="Avg Monthly Deals / Agent"
                  grade={dealsPerAgentGrade}
                  primary={fmtDec(avgDeals)}
                  secondary={
                    avgDeals != null
                      ? paceText(avgDeals, dealsGoal, 'deals/agent/mo', true)
                      : 'No deal data yet'
                  }
                  performancePct={dealsPerAgentPct ?? undefined}
                  goalLabel="Goal: 1.00 deal/agent/mo"
                  icon={BarChart3}
                />

                {/* ── INFO: New Hires YTD ───────────────────────────────── */}
                <InfoCard
                  title="New Hires YTD"
                  value={fmtN(kpi.ytdNewHires)}
                  sub={`${kpi.ytdDepartures ?? 0} departed · Net: ${((kpi.ytdNewHires ?? 0) - (kpi.ytdDepartures ?? 0)) >= 0 ? '+' : ''}${((kpi.ytdNewHires ?? 0) - (kpi.ytdDepartures ?? 0)).toLocaleString()}`}
                  icon={UserPlus}
                  colorClass="border-l-emerald-400"
                  badgeClass="bg-emerald-500 text-white"
                />

                {/* ── INFO: YTD Departures ──────────────────────────────── */}
                <InfoCard
                  title="YTD Departures"
                  value={fmtN(kpi.ytdDepartures)}
                  sub={`Agents who left in ${year} — lower is better`}
                  icon={UserMinus}
                  colorClass={(kpi.ytdDepartures ?? 0) > 0 ? 'border-l-red-400' : 'border-l-slate-300'}
                  badgeClass={(kpi.ytdDepartures ?? 0) > 0 ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'}
                />

                {/* ── INFO: Pipeline ────────────────────────────────────── */}
                <InfoCard
                  title="Pipeline"
                  value={fmtN(kpi.pipelineCount)}
                  sub="Recruiting candidates currently tracked"
                  icon={TrendingUp}
                  colorClass="border-l-blue-400"
                  badgeClass="bg-blue-500 text-white"
                />

                {/* ── INFO: No Deals Yet ────────────────────────────────── */}
                <InfoCard
                  title="No Deals Yet"
                  value={fmtN(kpi.noDealsYetCount)}
                  sub={`Active established agents with 0 closed deals in ${year} — needs attention`}
                  icon={AlertTriangle}
                  colorClass={(kpi.noDealsYetCount ?? 0) > 0 ? 'border-l-amber-400' : 'border-l-slate-300'}
                  badgeClass={(kpi.noDealsYetCount ?? 0) > 0 ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'}
                />

              </div>

              {/* Grade scale legend */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                <span className="font-medium text-foreground">Grade Scale:</span>
                {[
                  { g: 'A', label: '100%+', color: 'text-emerald-700' },
                  { g: 'B', label: '85–99%', color: 'text-blue-700' },
                  { g: 'C', label: '70–84%', color: 'text-yellow-700' },
                  { g: 'D', label: '50–69%', color: 'text-orange-700' },
                  { g: 'F', label: 'Below 50%', color: 'text-red-700' },
                ].map(({ g, label, color }) => (
                  <span key={g} className={`font-semibold ${color}`}>{g} = {label}</span>
                ))}
                <span className="ml-2 text-muted-foreground">
                  · Graded: Active Agents (vs monthly goal) · Avg Deals/Agent (vs 1.0/mo goal)
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
