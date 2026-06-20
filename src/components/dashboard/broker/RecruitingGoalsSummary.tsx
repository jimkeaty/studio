'use client';
// RecruitingGoalsSummary.tsx
// Upgraded "Recruiting Funnel — What It Takes" section
// Shows Year / Month / Week / Day goals + YTD Actual + Pace (rate-based)
// Mirrors the agent business plan Annual Goals Summary style

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, Users, CalendarCheck, FileText, Handshake, UserCheck } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface FunnelTargets {
  yearly: Record<string, number>;
  monthly: Record<string, number>;
  weekly: Record<string, number>;
  daily: Record<string, number>;
}

interface Totals {
  totalProspectCalls: number;
  totalInterviewsSet: number;
  totalInterviews: number;     // interviewsHeld
  totalOffers: number;
  totalCommitted: number;
  totalOnboarded: number;
  monthsElapsed: number;
}

interface RecruitingGoalsSummaryProps {
  funnelTargets: FunnelTargets;
  totals: Totals;
  year: number;
  yearlyNewHiresGoal: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a pace rate as "X per day" or "1 every N days" */
function formatPace(ytdActual: number, daysElapsed: number): string {
  if (daysElapsed <= 0 || ytdActual <= 0) return '—';
  const ratePerDay = ytdActual / daysElapsed;
  if (ratePerDay >= 1) {
    return `${ratePerDay.toFixed(1)} per day`;
  }
  const daysPerOne = Math.round(1 / ratePerDay);
  if (daysPerOne <= 7) return `1 every ${daysPerOne} day${daysPerOne === 1 ? '' : 's'}`;
  const weeksPerOne = Math.round(daysPerOne / 7);
  if (weeksPerOne <= 4) return `1 every ${weeksPerOne} week${weeksPerOne === 1 ? '' : 's'}`;
  const monthsPerOne = Math.round(daysPerOne / 30);
  return `1 every ${monthsPerOne} month${monthsPerOne === 1 ? '' : 's'}`;
}

/** Grade color for the YTD pct badge */
function gradeColor(pct: number): string {
  if (pct >= 95) return 'bg-green-100 text-green-800 border-green-200';
  if (pct >= 85) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (pct >= 70) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (pct >= 50) return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function gradeLetter(pct: number): string {
  if (pct >= 95) return 'A';
  if (pct >= 85) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

/** Progress bar width capped at 100% */
function progressWidth(actual: number, ytdGoal: number): number {
  if (ytdGoal <= 0) return 0;
  return Math.min(100, Math.round((actual / ytdGoal) * 100));
}

// ── Sub-component: single activity card ─────────────────────────────────────

interface ActivityCardProps {
  label: string;
  icon: React.ReactNode;
  yearGoal: number;
  monthGoal: number;
  weekGoal: number;
  dayGoal: number;
  ytdActual: number;
  ytdGoal: number;   // prorated: yearGoal × (monthsElapsed / 12)
  pace: string;
  accentColor: string; // Tailwind border-l color class
}

function ActivityCard({
  label, icon, yearGoal, monthGoal, weekGoal, dayGoal,
  ytdActual, ytdGoal, pace, accentColor,
}: ActivityCardProps) {
  const pct = ytdGoal > 0 ? Math.round((ytdActual / ytdGoal) * 100) : 0;
  const barWidth = progressWidth(ytdActual, ytdGoal);
  const grade = gradeLetter(pct);
  const colorClass = gradeColor(pct);

  return (
    <div className={`rounded-xl border bg-card shadow-sm border-l-4 ${accentColor} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-semibold text-sm">{label}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
          {grade}
        </span>
      </div>

      {/* Goal grid */}
      <div className="px-4 pb-3 grid grid-cols-4 gap-1 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Year</p>
          <p className="text-xl font-bold tabular-nums">{yearGoal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Month</p>
          <p className="text-xl font-bold tabular-nums">{monthGoal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Week</p>
          <p className="text-xl font-bold tabular-nums">{weekGoal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Day</p>
          <p className="text-xl font-bold tabular-nums">{dayGoal > 0 ? dayGoal.toLocaleString() : '<1'}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t mx-4" />

      {/* YTD Actual + Pace */}
      <div className="px-4 py-3">
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD Actual</p>
            <p className="text-2xl font-bold tabular-nums">{ytdActual.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">YTD Goal</p>
            <p className="text-sm font-medium text-muted-foreground">{ytdGoal.toLocaleString()}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {/* Pace */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pace</p>
          <p className="text-xs font-medium text-foreground">{pace}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RecruitingGoalsSummary({
  funnelTargets,
  totals,
  year,
  yearlyNewHiresGoal,
}: RecruitingGoalsSummaryProps) {
  const now = new Date();
  const isCurrentYear = now.getFullYear() === year;
  // Days elapsed this year (for pace calculation)
  const startOfYear = new Date(year, 0, 1);
  const cutoff = isCurrentYear ? now : new Date(year, 11, 31);
  const daysElapsed = Math.max(1, Math.round((cutoff.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
  const monthsElapsed = totals.monthsElapsed ?? (isCurrentYear ? now.getMonth() + 1 : 12);

  const { yearly, monthly, weekly, daily } = funnelTargets;

  // YTD prorated goals (yearly × monthsElapsed / 12)
  const ytdGoal = (yearlyGoal: number) => Math.round(yearlyGoal * monthsElapsed / 12);

  const activities = [
    {
      key: 'calls',
      label: 'Prospect Calls',
      icon: <Phone className="h-4 w-4" />,
      yearGoal: yearly.calls,
      monthGoal: monthly.calls,
      weekGoal: weekly.calls,
      dayGoal: daily.calls,
      ytdActual: totals.totalProspectCalls,
      ytdGoal: ytdGoal(yearly.calls),
      pace: formatPace(totals.totalProspectCalls, daysElapsed),
      accentColor: 'border-l-blue-500',
    },
    {
      key: 'interviewsSet',
      label: 'Interviews Set',
      icon: <CalendarCheck className="h-4 w-4" />,
      yearGoal: yearly.interviewsSet,
      monthGoal: monthly.interviewsSet,
      weekGoal: weekly.interviewsSet,
      dayGoal: daily.interviewsSet,
      ytdActual: totals.totalInterviewsSet,
      ytdGoal: ytdGoal(yearly.interviewsSet),
      pace: formatPace(totals.totalInterviewsSet, daysElapsed),
      accentColor: 'border-l-indigo-500',
    },
    {
      key: 'interviewsHeld',
      label: 'Interviews Held',
      icon: <Users className="h-4 w-4" />,
      yearGoal: yearly.interviewsHeld,
      monthGoal: monthly.interviewsHeld,
      weekGoal: weekly.interviewsHeld,
      dayGoal: daily.interviewsHeld,
      ytdActual: totals.totalInterviews,
      ytdGoal: ytdGoal(yearly.interviewsHeld),
      pace: formatPace(totals.totalInterviews, daysElapsed),
      accentColor: 'border-l-violet-500',
    },
    {
      key: 'offers',
      label: 'Offers Made',
      icon: <FileText className="h-4 w-4" />,
      yearGoal: yearly.offers,
      monthGoal: monthly.offers,
      weekGoal: weekly.offers,
      dayGoal: daily.offers,
      ytdActual: totals.totalOffers,
      ytdGoal: ytdGoal(yearly.offers),
      pace: formatPace(totals.totalOffers, daysElapsed),
      accentColor: 'border-l-amber-500',
    },
    {
      key: 'committed',
      label: 'Committed',
      icon: <Handshake className="h-4 w-4" />,
      yearGoal: yearly.committed,
      monthGoal: monthly.committed,
      weekGoal: weekly.committed,
      dayGoal: daily.committed,
      ytdActual: totals.totalCommitted,
      ytdGoal: ytdGoal(yearly.committed),
      pace: formatPace(totals.totalCommitted, daysElapsed),
      accentColor: 'border-l-orange-500',
    },
    {
      key: 'onboarded',
      label: 'Onboarded',
      icon: <UserCheck className="h-4 w-4" />,
      yearGoal: yearly.onboarded,
      monthGoal: monthly.onboarded,
      weekGoal: weekly.onboarded,
      dayGoal: daily.onboarded,
      ytdActual: totals.totalOnboarded,
      ytdGoal: ytdGoal(yearly.onboarded),
      pace: formatPace(totals.totalOnboarded, daysElapsed),
      accentColor: 'border-l-green-500',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Recruiting Funnel — What It Takes</CardTitle>
            <CardDescription>
              Reverse-calculated from your goal of{' '}
              <strong>{yearlyNewHiresGoal ?? '—'} new hires/year</strong>.
              {' '}Goals shown for Year · Month · Week · Day, with YTD actuals and pace.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {monthsElapsed} of 12 months elapsed
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map(({ key: actKey, ...a }) => (
            <ActivityCard key={actKey} {...a} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          * Offers Made and Onboarded YTD actuals are not yet tracked in monthly data entry.
          Onboarded uses New Hires YTD as a proxy. Add offers tracking to monthly data entry for full accuracy.
        </p>
      </CardContent>
    </Card>
  );
}
