'use client';
// ─────────────────────────────────────────────────────────────────────────────
// UnifiedRecruitingReportCard
// Merges BrokerKPIReportCard + RecruiterReportCard into one self-contained
// component. Fetches from both:
//   - /api/broker/active-agents   (agent counts, deals, departures, pipeline)
//   - /api/broker/recruiting-metrics  (interviews, calls, funnel goals)
//
// Cards (in order, no duplicates):
//   1. Active Agents          — graded vs monthly agent count goal
//   2. Avg Monthly Deals/Agent — graded vs 1.0 goal
//   3. New Hires YTD          — graded vs pro-rated yearly hires goal
//   4. Net Agents Added YTD   — graded vs pro-rated net gain goal
//   5. YTD Departures         — info only
//   6. Interviews Set YTD     — graded vs funnel target
//   7. Interviews Held YTD    — graded vs funnel target
//   8. Prospect Calls YTD     — graded vs funnel target
//   9. Pipeline               — info only
//  10. No Deals Yet           — info only
//
// Grade math: pct = (actual / goal) * 100
// Drop into any page: <UnifiedRecruitingReportCard year={year} />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, UserPlus, UserMinus, BarChart3, AlertTriangle,
  TrendingUp, Phone, Calendar, ChevronDown, ChevronUp,
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
    grade === 'A' ? '#16a34a' : grade === 'B' ? '#2563eb' :
    grade === 'C' ? '#ca8a04' : grade === 'D' ? '#ea580c' : '#dc2626';
  const trackColor =
    grade === 'A' ? '#dcfce7' : grade === 'B' ? '#dbeafe' :
    grade === 'C' ? '#fef9c3' : grade === 'D' ? '#ffedd5' : '#fee2e2';
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

// ── HeroCard (graded) ─────────────────────────────────────────────────────────
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
    <Card className={cn('relative overflow-hidden shadow-sm border border-border', colors.accentBorder)}>
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
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight text-foreground leading-none">{primary}</span>
          {performancePct != null && (
            <span className={cn('text-sm font-bold', colors.text)}>{performancePct}%</span>
          )}
        </div>
        {performancePct != null && (
          <div className="space-y-1">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div className={cn('h-2.5 rounded-full transition-all duration-500', colors.progressBar)} style={{ width: `${clampedPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              {goalLabel && <span className="font-medium text-foreground/70">{goalLabel}</span>}
              <span>100% goal</span>
            </div>
          </div>
        )}
        <p className={cn('text-xs font-medium leading-snug', paceArrow ? paceColorClass : 'text-muted-foreground')}>
          {paceArrow && <span className="mr-0.5">{paceArrow}</span>}{secondary}
        </p>
      </CardContent>
    </Card>
  );
}

// ── InfoCard (no grade) ───────────────────────────────────────────────────────
function InfoCard({
  title, value, sub, icon: Icon,
  colorClass = 'border-l-slate-400', badgeClass = 'bg-slate-500 text-white',
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

// ── Section Divider ───────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface UnifiedRecruitingReportCardProps {
  year?: number;
  initialOpen?: boolean;
}

export function UnifiedRecruitingReportCard({ year: yearProp, initialOpen = true }: UnifiedRecruitingReportCardProps) {
  const { user } = useUser();
  const year = yearProp ?? new Date().getFullYear();
  const [agentData, setAgentData] = useState<any>(null);
  const [recruitData, setRecruitData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(initialOpen);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [agentRes, recruitRes] = await Promise.all([
        fetch(`/api/broker/active-agents?year=${year}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/broker/recruiting-metrics?year=${year}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (agentRes.ok) setAgentData(await agentRes.json());
      if (recruitRes.ok) setRecruitData(await recruitRes.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user, year]);

  useEffect(() => { load(); }, [load]);

  const kpi = agentData?.kpi;
  const totals = recruitData?.totals;
  const plan = recruitData?.plan;
  const funnelTargets = recruitData?.funnelTargets;

  const isCurrentYear = year === new Date().getFullYear();
  const currentMonthNum = isCurrentYear ? new Date().getMonth() + 1 : 12;
  const monthsElapsed = totals?.monthsElapsed ?? currentMonthNum;
  const ytdFraction = monthsElapsed / 12;

  // ── Agent count goal (point-in-time, from chart goals) ────────────────────
  const currentMonthGoal = agentData?.months?.find((m: any) => m.month === currentMonthNum)?.goal ?? null;

  // ── Grading helpers ───────────────────────────────────────────────────────
  function paceText(actual: number, goal: number | null, label: string, isDecimal = false): string {
    if (!goal) return `No goal set`;
    const delta = actual - goal;
    const pct = goal > 0 ? Math.abs(Math.round((delta / goal) * 100)) : 0;
    const displayDelta = isDecimal ? Math.abs(delta).toFixed(2) : Math.abs(Math.round(delta)).toLocaleString();
    if (delta >= 0) return `${pct}% ahead of pace · goal: ${isDecimal ? goal.toFixed(2) : goal.toLocaleString()} ${label}`;
    return `${displayDelta} ${label} behind pace · goal: ${isDecimal ? goal.toFixed(2) : goal.toLocaleString()} ${label}`;
  }

  // 1. Active Agents
  const activeAgents = kpi?.currentActive ?? totals?.activeAgents ?? null;
  const activeAgentsPct = (activeAgents != null && currentMonthGoal != null && currentMonthGoal > 0)
    ? Math.round((activeAgents / currentMonthGoal) * 100) : null;
  const activeAgentsGrade = activeAgentsPct != null ? letterGrade(activeAgentsPct) : 'F';

  // 2. Avg Monthly Deals/Agent
  const dealsGoal = 1.0;
  const avgDeals = kpi?.avgMonthlyDealsPerAgent ?? null;
  const dealsPerAgentPct = avgDeals != null ? Math.round((avgDeals / dealsGoal) * 100) : null;
  const dealsPerAgentGrade = dealsPerAgentPct != null ? letterGrade(dealsPerAgentPct) : 'F';

  // 3. New Hires YTD
  const ytdNewHires = kpi?.ytdNewHires ?? totals?.newHires ?? null;
  const yearlyNewHiresGoal = kpi?.yearlyNewHiresGoal ?? plan?.yearlyNewHiresGoal ?? null;
  const ytdNewHiresGoal = yearlyNewHiresGoal != null ? Math.round(yearlyNewHiresGoal * ytdFraction) : null;
  const newHiresPct = (ytdNewHires != null && ytdNewHiresGoal != null && ytdNewHiresGoal > 0)
    ? Math.round((ytdNewHires / ytdNewHiresGoal) * 100) : null;
  const newHiresGrade = newHiresPct != null ? letterGrade(newHiresPct) : 'F';

  // 4. Net Agents Added YTD
  const ytdDepartures = kpi?.ytdDepartures ?? totals?.departures ?? 0;
  const netAgentsAdded = (ytdNewHires ?? 0) - ytdDepartures;
  const netGainGoal = kpi?.netGainGoal ?? null;
  const ytdNetGainGoal = netGainGoal != null ? Math.round(netGainGoal * ytdFraction) : null;
  const netGainPct = (ytdNetGainGoal != null && ytdNetGainGoal > 0)
    ? Math.round((netAgentsAdded / ytdNetGainGoal) * 100) : null;
  const netGainGrade = netGainPct != null ? letterGrade(Math.max(0, netGainPct)) : null;

  // 5. Interviews Set
  const ytdInterviewsSet = totals?.totalInterviewsSet ?? null;
  const yearlyInterviewsSetGoal = funnelTargets?.yearly?.interviewsSet ?? null;
  const ytdInterviewsSetGoal = yearlyInterviewsSetGoal != null ? Math.round(yearlyInterviewsSetGoal * ytdFraction) : null;
  const interviewsSetPct = (ytdInterviewsSet != null && ytdInterviewsSetGoal != null && ytdInterviewsSetGoal > 0)
    ? Math.round((ytdInterviewsSet / ytdInterviewsSetGoal) * 100) : null;
  const interviewsSetGrade = interviewsSetPct != null ? letterGrade(interviewsSetPct) : 'F';

  // 6. Interviews Held
  const ytdInterviewsHeld = totals?.totalInterviews ?? null;
  const yearlyInterviewsHeldGoal = funnelTargets?.yearly?.interviewsHeld ?? null;
  const ytdInterviewsHeldGoal = yearlyInterviewsHeldGoal != null ? Math.round(yearlyInterviewsHeldGoal * ytdFraction) : null;
  const interviewsHeldPct = (ytdInterviewsHeld != null && ytdInterviewsHeldGoal != null && ytdInterviewsHeldGoal > 0)
    ? Math.round((ytdInterviewsHeld / ytdInterviewsHeldGoal) * 100) : null;
  const interviewsHeldGrade = interviewsHeldPct != null ? letterGrade(interviewsHeldPct) : 'F';

  // 7. Prospect Calls
  const ytdProspectCalls = totals?.totalProspectCalls ?? null;
  const yearlyCallsGoal = funnelTargets?.yearly?.calls ?? null;
  const ytdCallsGoal = yearlyCallsGoal != null ? Math.round(yearlyCallsGoal * ytdFraction) : null;
  const callsPct = (ytdProspectCalls != null && ytdCallsGoal != null && ytdCallsGoal > 0)
    ? Math.round((ytdProspectCalls / ytdCallsGoal) * 100) : null;
  const callsGrade = callsPct != null ? letterGrade(callsPct) : 'F';

  const hasAnyData = kpi != null || totals != null;

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
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
            <p className="text-sm font-semibold">Recruiting &amp; Agent KPI Report Card</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentYear
                ? `YTD performance vs goals (${monthsElapsed} of 12 months elapsed)`
                : `Full-year ${year} performance vs goals`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>

      {open && (
        <>
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
            </div>
          )}

          {!loading && hasAnyData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* ── SECTION: Agent Count ──────────────────────────────── */}
                <SectionLabel label="Agent Count" />

                {/* 1. Active Agents */}
                <HeroCard
                  title="Active Agents"
                  grade={activeAgentsGrade}
                  primary={fmtN(activeAgents)}
                  secondary={
                    currentMonthGoal != null
                      ? paceText(activeAgents ?? 0, currentMonthGoal, 'agent goal')
                      : 'No monthly goal set — set goals in chart below'
                  }
                  performancePct={activeAgentsPct ?? undefined}
                  goalLabel={currentMonthGoal != null ? `Goal: ${currentMonthGoal} agents` : undefined}
                  icon={Users}
                />

                {/* 2. New Hires YTD */}
                <HeroCard
                  title="New Hires YTD"
                  grade={newHiresGrade}
                  primary={fmtN(ytdNewHires)}
                  secondary={
                    ytdNewHiresGoal != null
                      ? paceText(ytdNewHires ?? 0, ytdNewHiresGoal, 'hires YTD pace')
                      : 'No hires goal set'
                  }
                  performancePct={newHiresPct ?? undefined}
                  goalLabel={ytdNewHiresGoal != null ? `YTD pace goal: ${ytdNewHiresGoal}` : undefined}
                  icon={UserPlus}
                />

                {/* 3. Net Agents Added YTD */}
                {netGainGrade ? (
                  <HeroCard
                    title="Net Agents Added YTD"
                    grade={netGainGrade}
                    primary={(netAgentsAdded >= 0 ? '+' : '') + netAgentsAdded}
                    secondary={
                      ytdNetGainGoal != null
                        ? paceText(netAgentsAdded, ytdNetGainGoal, 'net agents YTD pace')
                        : 'No net gain goal set'
                    }
                    performancePct={netGainPct != null ? Math.max(0, netGainPct) : undefined}
                    goalLabel={ytdNetGainGoal != null ? `YTD pace goal: +${ytdNetGainGoal}` : undefined}
                    icon={TrendingUp}
                  />
                ) : (
                  <InfoCard
                    title="Net Agents Added YTD"
                    value={(netAgentsAdded >= 0 ? '+' : '') + netAgentsAdded}
                    sub={`+${ytdNewHires ?? 0} hired − ${ytdDepartures} departed · Set net gain goal to see grade`}
                    icon={TrendingUp}
                    colorClass={netAgentsAdded > 0 ? 'border-l-emerald-400' : netAgentsAdded < 0 ? 'border-l-red-400' : 'border-l-slate-300'}
                    badgeClass={netAgentsAdded > 0 ? 'bg-emerald-500 text-white' : netAgentsAdded < 0 ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'}
                  />
                )}

                {/* 4. YTD Departures — info only */}
                <InfoCard
                  title="YTD Departures"
                  value={fmtN(ytdDepartures)}
                  sub={`Agents who left in ${year} — lower is better`}
                  icon={UserMinus}
                  colorClass={ytdDepartures > 0 ? 'border-l-red-400' : 'border-l-slate-300'}
                  badgeClass={ytdDepartures > 0 ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'}
                />

                {/* ── SECTION: Production ───────────────────────────────── */}
                <SectionLabel label="Production" />

                {/* 5. Avg Monthly Deals/Agent */}
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

                {/* ── SECTION: Recruiting Activity ──────────────────────── */}
                <SectionLabel label="Recruiting Activity" />

                {/* 6. Interviews Set YTD */}
                <HeroCard
                  title="Interviews Set YTD"
                  grade={interviewsSetGrade}
                  primary={fmtN(ytdInterviewsSet)}
                  secondary={paceText(ytdInterviewsSet ?? 0, ytdInterviewsSetGoal, 'interviews set')}
                  performancePct={interviewsSetPct ?? undefined}
                  goalLabel={ytdInterviewsSetGoal != null ? `YTD goal: ${ytdInterviewsSetGoal}` : undefined}
                  icon={Calendar}
                />

                {/* 7. Interviews Held YTD */}
                <HeroCard
                  title="Interviews Held YTD"
                  grade={interviewsHeldGrade}
                  primary={fmtN(ytdInterviewsHeld)}
                  secondary={paceText(ytdInterviewsHeld ?? 0, ytdInterviewsHeldGoal, 'interviews held')}
                  performancePct={interviewsHeldPct ?? undefined}
                  goalLabel={ytdInterviewsHeldGoal != null ? `YTD goal: ${ytdInterviewsHeldGoal}` : undefined}
                  icon={Calendar}
                />

                {/* 8. Prospect Calls YTD */}
                <HeroCard
                  title="Prospect Calls YTD"
                  grade={callsGrade}
                  primary={fmtN(ytdProspectCalls)}
                  secondary={paceText(ytdProspectCalls ?? 0, ytdCallsGoal, 'calls')}
                  performancePct={callsPct ?? undefined}
                  goalLabel={ytdCallsGoal != null ? `YTD goal: ${ytdCallsGoal}` : undefined}
                  icon={Phone}
                />

                {/* ── SECTION: Pipeline Health ──────────────────────────── */}
                <SectionLabel label="Pipeline Health" />

                {/* 9. Pipeline */}
                <InfoCard
                  title="Pipeline"
                  value={fmtN(kpi?.pipelineCount)}
                  sub="Recruiting candidates currently tracked"
                  icon={TrendingUp}
                  colorClass="border-l-blue-400"
                  badgeClass="bg-blue-500 text-white"
                />

                {/* 10. No Deals Yet */}
                <InfoCard
                  title="No Deals Yet"
                  value={fmtN(kpi?.noDealsYetCount)}
                  sub={`Active established agents with 0 closed deals in ${year} — needs attention`}
                  icon={AlertTriangle}
                  colorClass={(kpi?.noDealsYetCount ?? 0) > 0 ? 'border-l-amber-400' : 'border-l-slate-300'}
                  badgeClass={(kpi?.noDealsYetCount ?? 0) > 0 ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'}
                />

              </div>

              {/* ── YTD Agent Name Lists ───────────────────────────── */}
              {(() => {
                const newHiresList: Array<{ name: string; agentId: string; startDate: string | null; activationMonth: string | null; teamGroup: string | null }> = kpi?.ytdNewHiresList ?? [];
                const departuresList: Array<{ name: string; agentId: string; endDate: string | null; endMonth: string | null; teamGroup: string | null }> = kpi?.ytdDeparturesList ?? [];
                if (newHiresList.length === 0 && departuresList.length === 0) return null;
                const fmtDate = (d: string | null) => {
                  if (!d) return null;
                  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
                };
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* New Hires List */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-100 dark:bg-emerald-900/40 border-b border-emerald-200 dark:border-emerald-800">
                        <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          {year} New Hires ({newHiresList.length})
                        </span>
                      </div>
                      {newHiresList.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground">No new hires recorded for {year}</p>
                      ) : (
                        <ul className="divide-y divide-emerald-100 dark:divide-emerald-900/40 max-h-64 overflow-y-auto">
                          {newHiresList.map((a, i) => (
                            <li key={a.agentId + i} className="flex items-center justify-between px-4 py-2 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30 transition-colors">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold shrink-0">
                                  {a.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-foreground truncate">{a.name}</span>
                                {a.teamGroup && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{a.teamGroup}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {fmtDate(a.startDate) ?? a.activationMonth ?? ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Departures List */}
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-red-100 dark:bg-red-900/40 border-b border-red-200 dark:border-red-800">
                        <UserMinus className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                          {year} Departures ({departuresList.length})
                        </span>
                      </div>
                      {departuresList.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground">No recorded departures for {year}</p>
                      ) : (
                        <ul className="divide-y divide-red-100 dark:divide-red-900/40 max-h-64 overflow-y-auto">
                          {departuresList.map((a, i) => (
                            <li key={a.agentId + i} className="flex items-center justify-between px-4 py-2 hover:bg-red-100/60 dark:hover:bg-red-900/30 transition-colors">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0">
                                  {a.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-foreground truncate">{a.name}</span>
                                {a.teamGroup && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{a.teamGroup}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {fmtDate(a.endDate) ?? a.endMonth ?? ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                  · All grades: actual ÷ pro-rated YTD goal × 100
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
