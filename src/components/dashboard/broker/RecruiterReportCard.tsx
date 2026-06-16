'use client';
// ─────────────────────────────────────────────────────────────────────────────
// RecruiterReportCard
// Mirrors the BrokerageReportCard visual style exactly.
// Shows YTD grade cards for: Active Agents, New Hires, Avg Deals/Agent,
// Interviews Held, and Prospect Calls — all graded vs YTD prorated goal.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users, UserPlus, BarChart3, Phone, Calendar,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── GoalRing — identical to BrokerageReportCard ───────────────────────────────
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

// ── HeroCard — identical to BrokerageReportCard ───────────────────────────────
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

// ── Props ─────────────────────────────────────────────────────────────────────
export interface RecruiterReportCardProps {
  // KPI actuals
  activeAgents: number;
  ytdNewHires: number;
  ytdDepartures: number;
  avgDealsPerAgent: number;
  ytdInterviewsHeld: number;
  ytdProspectCalls: number;
  // Goals
  yearlyActiveAgentsGoal: number | null;
  yearlyNewHiresGoal: number | null;
  yearlyInterviewsGoal: number | null;  // from funnel targets
  yearlyProspectCallsGoal: number | null; // from funnel targets
  // YTD context
  monthsElapsed: number;
  isCurrentYear: boolean;
  // Collapsible
  open: boolean;
  onToggle: () => void;
}

export function RecruiterReportCard({
  activeAgents,
  ytdNewHires,
  ytdDepartures,
  avgDealsPerAgent,
  ytdInterviewsHeld,
  ytdProspectCalls,
  yearlyActiveAgentsGoal,
  yearlyNewHiresGoal,
  yearlyInterviewsGoal,
  yearlyProspectCallsGoal,
  monthsElapsed,
  isCurrentYear,
  open,
  onToggle,
}: RecruiterReportCardProps) {
  // YTD goals (pro-rated by months elapsed)
  const ytdFraction = monthsElapsed / 12;
  const ytdActiveAgentsGoal = yearlyActiveAgentsGoal ?? null; // active agents goal is a point-in-time target, not cumulative
  const ytdNewHiresGoal = yearlyNewHiresGoal
    ? Math.round(yearlyNewHiresGoal * ytdFraction) : null;
  const ytdInterviewsHeldGoal = yearlyInterviewsGoal
    ? Math.round(yearlyInterviewsGoal * ytdFraction) : null;
  const ytdProspectCallsGoalCalc = yearlyProspectCallsGoal
    ? Math.round(yearlyProspectCallsGoal * ytdFraction) : null;
  // Deals/agent: YTD goal = 1 deal/agent/month × months elapsed
  const ytdDealsPerAgentGoal = monthsElapsed;

  // Performance percentages
  const activeAgentsPct = ytdActiveAgentsGoal
    ? Math.round((activeAgents / ytdActiveAgentsGoal) * 100) : null;
  const newHiresPct = ytdNewHiresGoal
    ? Math.round((ytdNewHires / ytdNewHiresGoal) * 100) : null;
  const dealsPerAgentPct = ytdDealsPerAgentGoal > 0
    ? Math.round((avgDealsPerAgent / ytdDealsPerAgentGoal) * 100) : null;
  const interviewsPct = ytdInterviewsHeldGoal
    ? Math.round((ytdInterviewsHeld / ytdInterviewsHeldGoal) * 100) : null;
  const prospectCallsPct = ytdProspectCallsGoalCalc
    ? Math.round((ytdProspectCalls / ytdProspectCallsGoalCalc) * 100) : null;

  // Grades
  const activeAgentsGrade = activeAgentsPct != null ? letterGrade(activeAgentsPct) : 'F';
  const newHiresGrade = newHiresPct != null ? letterGrade(newHiresPct) : 'F';
  const dealsPerAgentGrade = dealsPerAgentPct != null ? letterGrade(dealsPerAgentPct) : 'F';
  const interviewsGrade = interviewsPct != null ? letterGrade(interviewsPct) : 'F';
  const prospectCallsGrade = prospectCallsPct != null ? letterGrade(prospectCallsPct) : 'F';

  // Pace text helpers
  const paceText = (actual: number, ytdGoal: number | null, label: string, isDecimal = false) => {
    if (!ytdGoal) return `${label} · No goal set`;
    const delta = actual - ytdGoal;
    const pct = ytdGoal > 0 ? Math.abs(Math.round((delta / ytdGoal) * 100)) : 0;
    const displayDelta = isDecimal ? Math.abs(delta).toFixed(2) : Math.abs(Math.round(delta)).toLocaleString();
    if (delta >= 0) return `${pct}% ahead of pace · ${isDecimal ? ytdGoal.toFixed(2) : ytdGoal.toLocaleString()} ${label} YTD goal`;
    return `${pct}% behind pace · ${isDecimal ? ytdGoal.toFixed(2) : ytdGoal.toLocaleString()} ${label} YTD goal`;
  };

  const hasGoals = yearlyActiveAgentsGoal || yearlyNewHiresGoal || yearlyInterviewsGoal || yearlyProspectCallsGoal;

  return (
    <div className="space-y-3">
      {/* Section header — collapsible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left shadow-sm hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Recruiter Report Card</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentYear
                ? `YTD performance vs prorated goals (${monthsElapsed} of 12 months)`
                : 'Full-year performance vs goals'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>

      {open && (
        <>
          {!hasGoals && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Set recruiting goals in the Recruiting Plan section below to see graded report cards.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Active Agents */}
            <HeroCard
              title="Active Agents"
              grade={activeAgentsGrade}
              primary={fmtN(activeAgents)}
              secondary={paceText(activeAgents, ytdActiveAgentsGoal, 'agent goal')}
              performancePct={activeAgentsPct ?? undefined}
              goalLabel={ytdActiveAgentsGoal ? `${ytdActiveAgentsGoal.toLocaleString()} agent goal` : undefined}
              icon={Users}
            />

            {/* New Hires YTD */}
            <HeroCard
              title="New Hires YTD"
              grade={newHiresGrade}
              primary={fmtN(ytdNewHires)}
              secondary={
                ytdNewHiresGoal
                  ? `${fmtN(ytdNewHires)} hired · ${fmtN(ytdDepartures)} departed · Net: ${(ytdNewHires - ytdDepartures) >= 0 ? '+' : ''}${fmtN(ytdNewHires - ytdDepartures)}`
                  : `${fmtN(ytdDepartures)} departures · No hire goal set`
              }
              performancePct={newHiresPct ?? undefined}
              goalLabel={ytdNewHiresGoal ? `${ytdNewHiresGoal.toLocaleString()} of ${yearlyNewHiresGoal?.toLocaleString()} yearly` : undefined}
              icon={UserPlus}
            />

            {/* Avg Deals / Agent */}
            <HeroCard
              title="Avg Deals / Agent"
              grade={dealsPerAgentGrade}
              primary={fmtDec(avgDealsPerAgent)}
              secondary={paceText(avgDealsPerAgent, ytdDealsPerAgentGoal, `deals/agent (${monthsElapsed} mo × 1/mo)`, true)}
              performancePct={dealsPerAgentPct ?? undefined}
              goalLabel={`${ytdDealsPerAgentGoal} deals/agent YTD goal`}
              icon={BarChart3}
            />

            {/* Interviews Held YTD */}
            <HeroCard
              title="Interviews Held YTD"
              grade={interviewsGrade}
              primary={fmtN(ytdInterviewsHeld)}
              secondary={paceText(ytdInterviewsHeld, ytdInterviewsHeldGoal, 'interviews')}
              performancePct={interviewsPct ?? undefined}
              goalLabel={ytdInterviewsHeldGoal ? `${ytdInterviewsHeldGoal.toLocaleString()} of ${yearlyInterviewsGoal?.toLocaleString()} yearly` : undefined}
              icon={Calendar}
            />

            {/* Prospect Calls YTD */}
            <HeroCard
              title="Prospect Calls YTD"
              grade={prospectCallsGrade}
              primary={fmtN(ytdProspectCalls)}
              secondary={paceText(ytdProspectCalls, ytdProspectCallsGoalCalc, 'calls')}
              performancePct={prospectCallsPct ?? undefined}
              goalLabel={ytdProspectCallsGoalCalc ? `${ytdProspectCallsGoalCalc.toLocaleString()} of ${yearlyProspectCallsGoal?.toLocaleString()} yearly` : undefined}
              icon={Phone}
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
            <span className="ml-2 text-muted-foreground">· All grades based on YTD actual vs YTD prorated goal ({monthsElapsed}/12 months elapsed)</span>
          </div>
        </>
      )}
    </div>
  );
}
