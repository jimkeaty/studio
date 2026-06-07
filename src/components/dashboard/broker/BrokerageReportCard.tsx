'use client';
// ─────────────────────────────────────────────────────────────────────────────
// BrokerageReportCard
// Mirrors the agent dashboard ReportCardSection / HeroCard exactly.
// Shows: Net Income YTD, Net Income Pipeline, Deals Closed, Pipeline Sales,
//        Volume Sold, Pipeline Volume — each with grade, progress ring, and
//        pace text.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, TrendingUp, BarChart3, Clock, Target,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MonthlyData } from '@/lib/types/brokerCommandMetrics';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtC(v: number | null | undefined, compact = false): string {
  if (v == null) return '—';
  if (compact) {
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}
function fmtN(v: number | null | undefined): string {
  return v != null ? v.toLocaleString() : '—';
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
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

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

// ── HeroCard — identical to agent dashboard ───────────────────────────────────
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
export interface BrokerageReportCardProps {
  // Totals from BrokerCommandOverview
  totals: {
    grossMargin: number;
    closedVolume: number;
    closedCount: number;
    pendingVolume: number;
    pendingCount: number;
  };
  // Pending GCI (pipeline income) — sum of months[].pendingGci
  pendingGci: number;
  // Annual goals (summed from monthly goals)
  yearlyGrossMarginGoal: number | null;
  yearlyVolumeGoal: number | null;
  yearlySalesGoal: number | null;
  // YTD fraction (daysElapsed / daysInYear)
  ytdFraction: number;
  isCurrentYear: boolean;
  // Collapsible state
  open: boolean;
  onToggle: () => void;
}

export function BrokerageReportCard({
  totals,
  pendingGci,
  yearlyGrossMarginGoal,
  yearlyVolumeGoal,
  yearlySalesGoal,
  ytdFraction,
  isCurrentYear,
  open,
  onToggle,
}: BrokerageReportCardProps) {
  // YTD goals (pro-rated by days elapsed for current year)
  const ytdMarginGoal = yearlyGrossMarginGoal
    ? Math.round(yearlyGrossMarginGoal * ytdFraction) : null;
  const ytdVolumeGoal = yearlyVolumeGoal
    ? Math.round(yearlyVolumeGoal * ytdFraction) : null;
  const ytdSalesGoal = yearlySalesGoal
    ? Math.round(yearlySalesGoal * ytdFraction * 10) / 10 : null;

  // Performance percentages
  const marginPct = ytdMarginGoal
    ? Math.round((totals.grossMargin / ytdMarginGoal) * 100) : null;
  const volumePct = ytdVolumeGoal
    ? Math.round((totals.closedVolume / ytdVolumeGoal) * 100) : null;
  const salesPct = ytdSalesGoal
    ? Math.round((totals.closedCount / ytdSalesGoal) * 100) : null;

  // Pipeline performance vs annual goal (pipeline + closed vs full-year goal)
  const pipelineMarginPct = yearlyGrossMarginGoal
    ? Math.round(((totals.grossMargin + pendingGci) / yearlyGrossMarginGoal) * 100) : null;
  const pipelineVolumePct = yearlyVolumeGoal
    ? Math.round(((totals.closedVolume + totals.pendingVolume) / yearlyVolumeGoal) * 100) : null;
  const pipelineSalesPct = yearlySalesGoal
    ? Math.round(((totals.closedCount + totals.pendingCount) / yearlySalesGoal) * 100) : null;

  const paceText = (deltaPct: number, goalStr: string) =>
    deltaPct >= 0
      ? `${Math.abs(deltaPct)}% ahead of pace · ${goalStr} YTD goal`
      : `${Math.abs(deltaPct)}% behind pace · ${goalStr} YTD goal`;

  const hasGoals = yearlyGrossMarginGoal || yearlyVolumeGoal || yearlySalesGoal;

  return (
    <div className="space-y-3">
      {/* Section header — collapsible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="text-base font-semibold tracking-tight">Brokerage Report Card</h2>
          {!hasGoals && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Set goals to see grades
            </Badge>
          )}
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        }
      </button>

      {open && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Net Income YTD */}
          {marginPct != null ? (
            <HeroCard
              title="Net Income YTD"
              grade={letterGrade(marginPct)}
              primary={fmtC(totals.grossMargin, true)}
              secondary={ytdMarginGoal
                ? paceText(marginPct - 100, fmtC(ytdMarginGoal, true))
                : 'No income goal set'}
              performancePct={marginPct}
              goalLabel={fmtC(ytdMarginGoal, true)}
              icon={DollarSign}
            />
          ) : (
            <HeroCard
              title="Net Income YTD"
              grade="—"
              primary={fmtC(totals.grossMargin, true)}
              secondary="No income goal set — add one in Goal Settings"
              icon={DollarSign}
            />
          )}

          {/* 2. Net Income Pipeline */}
          {pipelineMarginPct != null ? (
            <HeroCard
              title="Net Income Pipeline"
              grade={letterGrade(pipelineMarginPct)}
              primary={fmtC(totals.grossMargin + pendingGci, true)}
              secondary={`Closed ${fmtC(totals.grossMargin, true)} + ${fmtC(pendingGci, true)} pending`}
              performancePct={pipelineMarginPct}
              goalLabel={fmtC(yearlyGrossMarginGoal, true) + ' annual goal'}
              icon={Clock}
            />
          ) : (
            <HeroCard
              title="Net Income Pipeline"
              grade="—"
              primary={fmtC(totals.grossMargin + pendingGci, true)}
              secondary={`Closed ${fmtC(totals.grossMargin, true)} + ${fmtC(pendingGci, true)} pending`}
              icon={Clock}
            />
          )}

          {/* 3. Deals Closed */}
          {salesPct != null ? (
            <HeroCard
              title="Deals Closed"
              grade={letterGrade(salesPct)}
              primary={fmtN(totals.closedCount)}
              secondary={ytdSalesGoal
                ? paceText(salesPct - 100, fmtN(ytdSalesGoal) + ' deals')
                : 'No deal goal set'}
              performancePct={salesPct}
              goalLabel={fmtN(ytdSalesGoal) + ' deals YTD'}
              icon={BarChart3}
            />
          ) : (
            <HeroCard
              title="Deals Closed"
              grade="—"
              primary={fmtN(totals.closedCount)}
              secondary="No deal goal set — add one in Goal Settings"
              icon={BarChart3}
            />
          )}

          {/* 4. Pipeline Sales */}
          {pipelineSalesPct != null ? (
            <HeroCard
              title="Pipeline Sales"
              grade={letterGrade(pipelineSalesPct)}
              primary={fmtN(totals.closedCount + totals.pendingCount)}
              secondary={`${fmtN(totals.closedCount)} closed + ${fmtN(totals.pendingCount)} pending`}
              performancePct={pipelineSalesPct}
              goalLabel={fmtN(yearlySalesGoal) + ' annual goal'}
              icon={Target}
            />
          ) : (
            <HeroCard
              title="Pipeline Sales"
              grade="—"
              primary={fmtN(totals.closedCount + totals.pendingCount)}
              secondary={`${fmtN(totals.closedCount)} closed + ${fmtN(totals.pendingCount)} pending`}
              icon={Target}
            />
          )}

          {/* 5. Volume Sold */}
          {volumePct != null ? (
            <HeroCard
              title="Volume Sold"
              grade={letterGrade(volumePct)}
              primary={fmtC(totals.closedVolume, true)}
              secondary={ytdVolumeGoal
                ? paceText(volumePct - 100, fmtC(ytdVolumeGoal, true))
                : 'No volume goal set'}
              performancePct={volumePct}
              goalLabel={fmtC(ytdVolumeGoal, true) + ' YTD'}
              icon={TrendingUp}
            />
          ) : (
            <HeroCard
              title="Volume Sold"
              grade="—"
              primary={fmtC(totals.closedVolume, true)}
              secondary="No volume goal set — add one in Goal Settings"
              icon={TrendingUp}
            />
          )}

          {/* 6. Pipeline Volume */}
          {pipelineVolumePct != null ? (
            <HeroCard
              title="Pipeline Volume"
              grade={letterGrade(pipelineVolumePct)}
              primary={fmtC(totals.closedVolume + totals.pendingVolume, true)}
              secondary={`Closed ${fmtC(totals.closedVolume, true)} + ${fmtC(totals.pendingVolume, true)} pending`}
              performancePct={pipelineVolumePct}
              goalLabel={fmtC(yearlyVolumeGoal, true) + ' annual goal'}
              icon={TrendingUp}
            />
          ) : (
            <HeroCard
              title="Pipeline Volume"
              grade="—"
              primary={fmtC(totals.closedVolume + totals.pendingVolume, true)}
              secondary={`Closed ${fmtC(totals.closedVolume, true)} + ${fmtC(totals.pendingVolume, true)} pending`}
              icon={TrendingUp}
            />
          )}
        </div>
      )}
    </div>
  );
}
