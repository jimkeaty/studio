'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp, TrendingDown, Minus, Target, Calendar, AlertTriangle,
  CheckCircle2, ArrowUp, DollarSign, Users, Handshake, Phone, ClipboardList
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectionData {
  year: number;
  hasPlan: boolean;
  annualIncomeGoal: number;
  avgNetCommission: number;
  workingWeeksInYear: number;
  workingDaysInYear: number;
  elapsedWeeks: number;
  remainingWeeks: number;
  yearPct: number;
  planTargets: {
    closings: number; closingsPerWeek: number;
    contractsWritten: number; contractsPerWeek: number;
    appointmentsHeld: number; apptsHeldPerWeek: number;
    appointmentsSet: number; apptsSetPerWeek: number;
    engagements: number; engagementsPerWeek: number;
    calls: number; callsPerWeek: number;
  };
  ytdActuals: {
    calls: number; engagements: number;
    appointmentsSet: number; appointmentsHeld: number;
    contractsWritten: number; closings: number;
    pendingUnits: number; netEarned: number;
    pendingNetIncome: number; apptsHeldPerWeek: number;
  };
  onTrack: {
    closings: number; contractsWritten: number;
    appointmentsHeld: number; appointmentsSet: number;
    engagements: number; calls: number; netEarned: number;
  };
  paceStatus: 'on_track' | 'slightly_behind' | 'behind';
  paceRatio: number;
  projection: {
    calls: number; engagements: number;
    appointmentsSet: number; appointmentsHeld: number;
    contractsWritten: number; closings: number; income: number;
  };
  catchUp: {
    incomeStillNeeded: number;
    closingsStillNeeded: number;
    perWeek: Record<string, number>;
    perDay: Record<string, number>;
    deficit: { appointmentsHeld: number; closings: number; netEarned: number };
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtN = (v: number, decimals = 1) =>
  isFinite(v) ? v.toFixed(decimals) : '—';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

// ── Sub-components ───────────────────────────────────────────────────────────

function PaceStatusBadge({ status, paceRatio }: { status: string; paceRatio: number }) {
  if (status === 'on_track') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800">
      <CheckCircle2 className="w-4 h-4" /> On Track ({fmtPct(paceRatio)})
    </span>
  );
  if (status === 'slightly_behind') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">
      <Minus className="w-4 h-4" /> Slightly Behind ({fmtPct(paceRatio)})
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
      <TrendingDown className="w-4 h-4" /> Behind ({fmtPct(paceRatio)})
    </span>
  );
}

function ProgressBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface KpiRowProps {
  icon: React.ReactNode;
  label: string;
  actual: number;
  onTrack: number;
  planTotal: number;
  catchUpPerWeek: number;
  planPerWeek: number;
  isIncome?: boolean;
}

function KpiRow({ icon, label, actual, onTrack, planTotal, catchUpPerWeek, planPerWeek, isIncome }: KpiRowProps) {
  const behind = Math.max(onTrack - actual, 0);
  const isBehind = behind > 0.5;
  const fmt = isIncome ? fmt$ : (v: number) => fmtN(v, 0);
  const fmtW = isIncome ? fmt$ : (v: number) => fmtN(v, 1);

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-3 border-b last:border-0">
      <div className="col-span-3 flex items-center gap-2 text-sm font-medium text-gray-700">
        {icon}
        <span>{label}</span>
      </div>
      <div className="col-span-2 text-center">
        <span className="font-bold text-gray-900">{fmt(actual)}</span>
        <div className="text-xs text-gray-400">actual</div>
      </div>
      <div className="col-span-2 text-center">
        <span className={`font-semibold ${isBehind ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(onTrack)}</span>
        <div className="text-xs text-gray-400">on-track</div>
      </div>
      <div className="col-span-2 text-center">
        <span className="text-gray-600">{fmt(planTotal)}</span>
        <div className="text-xs text-gray-400">full goal</div>
      </div>
      <div className="col-span-3 text-right">
        {isBehind ? (
          <div>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-red-600">
              <ArrowUp className="w-3 h-3" />
              {fmtW(catchUpPerWeek)}/wk needed
            </span>
            <div className="text-xs text-gray-400">
              (goal was {fmtW(planPerWeek)}/wk)
            </div>
          </div>
        ) : (
          <span className="text-sm text-emerald-600 font-medium">✓ On pace</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectionsPage() {
  const { user } = useUser();
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [sandboxGoal, setSandboxGoal] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    user.getIdToken().then((token: string) =>
      fetch(`/api/projections?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r: Response) => r.json())
      .then((d: ProjectionData) => {
        setData(d);
        setSandboxGoal(d.annualIncomeGoal);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [user, year]);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  if (error || !data) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error ?? 'Failed to load projection data.'}
      </div>
    </div>
  );

  if (!data.hasPlan) return (
    <div className="p-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <Target className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-amber-800 mb-2">No Business Plan Found for {year}</h2>
        <p className="text-amber-700">Set up your Business Plan first to enable income projections.</p>
        <a href="/dashboard/plan" className="mt-4 inline-block px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          Go to Business Plan →
        </a>
      </div>
    </div>
  );

  const { ytdActuals, onTrack, planTargets, projection, catchUp, paceStatus, paceRatio,
    annualIncomeGoal, avgNetCommission, elapsedWeeks, remainingWeeks, yearPct } = data;

  // Sandbox goal recalculation (client-side only for the "what if" scenario)
  const goalToShow = sandboxGoal ?? annualIncomeGoal;
  const sandboxClosingsNeeded = avgNetCommission > 0 ? Math.ceil(goalToShow / avgNetCommission) : 0;
  const sandboxClosingsStillNeeded = Math.max(sandboxClosingsNeeded - ytdActuals.closings, 0);
  const sandboxIncomeStillNeeded = Math.max(goalToShow - ytdActuals.netEarned, 0);

  const projectedVsGoal = projection.income - annualIncomeGoal;
  const isAheadOfGoal = projectedVsGoal >= 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Income Projections</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Based on your actual pace — {fmtN(elapsedWeeks, 1)} weeks elapsed, {fmtN(remainingWeeks, 1)} weeks remaining
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PaceStatusBadge status={paceStatus} paceRatio={paceRatio} />
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Top summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-800 to-slate-900 text-white">
          <CardContent className="p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Annual Goal</div>
            <div className="text-2xl font-bold">{fmt$(annualIncomeGoal)}</div>
            <div className="text-xs text-slate-400 mt-1">from Business Plan</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
          <CardContent className="p-4">
            <div className="text-xs text-emerald-200 uppercase tracking-wide mb-1">YTD Net Earned</div>
            <div className="text-2xl font-bold">{fmt$(ytdActuals.netEarned)}</div>
            <div className="text-xs text-emerald-200 mt-1">{ytdActuals.closings} closings · {fmt$(avgNetCommission)} avg</div>
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-sm text-white ${isAheadOfGoal ? 'bg-gradient-to-br from-blue-600 to-blue-700' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
          <CardContent className="p-4">
            <div className="text-xs text-white/70 uppercase tracking-wide mb-1">Full-Year Projection</div>
            <div className="text-2xl font-bold">{fmt$(projection.income)}</div>
            <div className="text-xs text-white/70 mt-1">
              {isAheadOfGoal
                ? `${fmt$(projectedVsGoal)} above goal`
                : `${fmt$(Math.abs(projectedVsGoal))} below goal`}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-600 to-violet-700 text-white">
          <CardContent className="p-4">
            <div className="text-xs text-violet-200 uppercase tracking-wide mb-1">Still Needed</div>
            <div className="text-2xl font-bold">{fmt$(catchUp.incomeStillNeeded)}</div>
            <div className="text-xs text-violet-200 mt-1">{catchUp.closingsStillNeeded} more closings to goal</div>
          </CardContent>
        </Card>
      </div>

      {/* Projection bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Year Progress vs Income Goal</span>
            <span className="text-sm text-gray-500">{fmtPct(yearPct)} of year elapsed</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>YTD Earned: {fmt$(ytdActuals.netEarned)}</span>
              <span>On-Track: {fmt$(onTrack.netEarned)}</span>
              <span>Goal: {fmt$(annualIncomeGoal)}</span>
            </div>
            <div className="relative w-full bg-gray-100 rounded-full h-4">
              {/* On-track marker */}
              <div
                className="absolute top-0 h-4 w-0.5 bg-gray-400 z-10"
                style={{ left: `${Math.min(100, (onTrack.netEarned / annualIncomeGoal) * 100)}%` }}
              />
              {/* Actual progress */}
              <div
                className={`h-4 rounded-full ${ytdActuals.netEarned >= onTrack.netEarned ? 'bg-emerald-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(100, (ytdActuals.netEarned / annualIncomeGoal) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>$0</span>
              <span className="text-gray-500">▲ on-track mark</span>
              <span>{fmt$(annualIncomeGoal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointments held — primary driver */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Handshake className="w-5 h-5 text-blue-600" />
            Appointments Held — Primary Driver
          </CardTitle>
          <p className="text-xs text-gray-500">
            Your full-year projection is based on your actual appointments-held pace of{' '}
            <strong>{fmtN(ytdActuals.apptsHeldPerWeek, 1)} appts/week</strong>.
            Your plan goal is <strong>{fmtN(planTargets.apptsHeldPerWeek, 1)} appts/week</strong>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Actual YTD', value: ytdActuals.appointmentsHeld, sub: `${fmtN(ytdActuals.apptsHeldPerWeek, 1)}/wk actual`, color: 'text-gray-900' },
              { label: 'Should Have', value: Math.round(onTrack.appointmentsHeld), sub: 'on-track number', color: ytdActuals.appointmentsHeld >= onTrack.appointmentsHeld ? 'text-emerald-600' : 'text-red-600' },
              { label: 'Full-Year Goal', value: planTargets.appointmentsHeld, sub: `${fmtN(planTargets.apptsHeldPerWeek, 1)}/wk goal`, color: 'text-gray-600' },
              { label: 'Projected Total', value: Math.round(projection.appointmentsHeld), sub: 'at current pace', color: projection.appointmentsHeld >= planTargets.appointmentsHeld ? 'text-emerald-600' : 'text-orange-600' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-xs font-medium text-gray-600 mt-0.5">{item.label}</div>
                <div className="text-xs text-gray-400">{item.sub}</div>
              </div>
            ))}
          </div>
          <ProgressBar
            value={ytdActuals.appointmentsHeld}
            max={planTargets.appointmentsHeld}
            color={ytdActuals.appointmentsHeld >= onTrack.appointmentsHeld ? 'bg-emerald-500' : 'bg-orange-500'}
          />
          {catchUp.deficit.appointmentsHeld > 0.5 && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <strong>You are {fmtN(catchUp.deficit.appointmentsHeld, 1)} appointments behind pace.</strong>{' '}
                To hit your goal of {planTargets.appointmentsHeld} appointments for the year, you need{' '}
                <strong>{fmtN(catchUp.perWeek.appointmentsHeld, 1)} appointments/week</strong> for the rest of the year
                (your original goal was {fmtN(planTargets.apptsHeldPerWeek, 1)}/week).
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full KPI tracker */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Full KPI Tracker — Actual vs On-Track vs Goal</CardTitle>
          <p className="text-xs text-gray-500">
            "Catch-up/wk needed" shows the recalibrated weekly target — not the original goal.
            It increases when you fall behind, just like a weight-loss tracker.
          </p>
        </CardHeader>
        <CardContent>
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 pb-2 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-3">KPI</div>
            <div className="col-span-2 text-center">Actual</div>
            <div className="col-span-2 text-center">On-Track</div>
            <div className="col-span-2 text-center">Full Goal</div>
            <div className="col-span-3 text-right">Catch-Up Target</div>
          </div>
          <KpiRow
            icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
            label="Net Income"
            actual={ytdActuals.netEarned}
            onTrack={onTrack.netEarned}
            planTotal={annualIncomeGoal}
            catchUpPerWeek={catchUp.perWeek.closings * avgNetCommission}
            planPerWeek={planTargets.closingsPerWeek * avgNetCommission}
            isIncome
          />
          <KpiRow
            icon={<CheckCircle2 className="w-4 h-4 text-blue-600" />}
            label="Closings"
            actual={ytdActuals.closings}
            onTrack={onTrack.closings}
            planTotal={planTargets.closings}
            catchUpPerWeek={catchUp.perWeek.closings}
            planPerWeek={planTargets.closingsPerWeek}
          />
          <KpiRow
            icon={<ClipboardList className="w-4 h-4 text-violet-600" />}
            label="Contracts"
            actual={ytdActuals.contractsWritten}
            onTrack={onTrack.contractsWritten}
            planTotal={planTargets.contractsWritten}
            catchUpPerWeek={catchUp.perWeek.contractsWritten}
            planPerWeek={planTargets.contractsPerWeek}
          />
          <KpiRow
            icon={<Handshake className="w-4 h-4 text-blue-600" />}
            label="Appts Held"
            actual={ytdActuals.appointmentsHeld}
            onTrack={onTrack.appointmentsHeld}
            planTotal={planTargets.appointmentsHeld}
            catchUpPerWeek={catchUp.perWeek.appointmentsHeld}
            planPerWeek={planTargets.apptsHeldPerWeek}
          />
          <KpiRow
            icon={<Calendar className="w-4 h-4 text-indigo-500" />}
            label="Appts Set"
            actual={ytdActuals.appointmentsSet}
            onTrack={onTrack.appointmentsSet}
            planTotal={planTargets.appointmentsSet}
            catchUpPerWeek={catchUp.perWeek.appointmentsSet}
            planPerWeek={planTargets.apptsSetPerWeek}
          />
          <KpiRow
            icon={<Users className="w-4 h-4 text-teal-600" />}
            label="Engagements"
            actual={ytdActuals.engagements}
            onTrack={onTrack.engagements}
            planTotal={planTargets.engagements}
            catchUpPerWeek={catchUp.perWeek.engagements}
            planPerWeek={planTargets.engagementsPerWeek}
          />
          <KpiRow
            icon={<Phone className="w-4 h-4 text-gray-500" />}
            label="Calls"
            actual={ytdActuals.calls}
            onTrack={onTrack.calls}
            planTotal={planTargets.calls}
            catchUpPerWeek={catchUp.perWeek.calls}
            planPerWeek={planTargets.callsPerWeek}
          />
        </CardContent>
      </Card>

      {/* Full-year projection summary */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Full-Year Projection at Current Pace
          </CardTitle>
          <p className="text-xs text-gray-500">
            If you continue holding {fmtN(ytdActuals.apptsHeldPerWeek, 1)} appointments/week for the rest of the year
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Projected Appts Held', value: fmtN(projection.appointmentsHeld, 0), goal: fmtN(planTargets.appointmentsHeld, 0), ok: projection.appointmentsHeld >= planTargets.appointmentsHeld },
              { label: 'Projected Closings', value: fmtN(projection.closings, 1), goal: fmtN(planTargets.closings, 0), ok: projection.closings >= planTargets.closings },
              { label: 'Projected Net Income', value: fmt$(projection.income), goal: fmt$(annualIncomeGoal), ok: projection.income >= annualIncomeGoal },
            ].map(item => (
              <div key={item.label} className={`rounded-lg p-4 border ${item.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
                <div className={`text-xl font-bold ${item.ok ? 'text-emerald-700' : 'text-orange-700'}`}>{item.value}</div>
                <div className="text-xs font-medium text-gray-700 mt-0.5">{item.label}</div>
                <div className="text-xs text-gray-500">goal: {item.goal}</div>
                {item.ok
                  ? <div className="text-xs text-emerald-600 mt-1 font-medium">✓ On track to hit goal</div>
                  : <div className="text-xs text-orange-600 mt-1 font-medium">⚠ Below goal at current pace</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Catch-up calculator */}
      {(paceStatus !== 'on_track') && (
        <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Catch-Up Calculator
            </CardTitle>
            <p className="text-xs text-gray-600">
              To still hit your {year} goal of {fmt$(annualIncomeGoal)}, here is what you need to do
              each week and each day for the remaining {fmtN(data.remainingWeeks, 1)} weeks.
              These targets are higher than your original plan because you need to make up lost ground.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase">
                    <th className="text-left py-2 pr-4">KPI</th>
                    <th className="text-right py-2 px-3">Still Needed</th>
                    <th className="text-right py-2 px-3">Per Week<br /><span className="text-gray-400 normal-case">(catch-up)</span></th>
                    <th className="text-right py-2 px-3">Original<br /><span className="text-gray-400 normal-case">/week goal</span></th>
                    <th className="text-right py-2 pl-3">Per Day</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Closings', still: fmtN(catchUp.closingsStillNeeded, 0), perWk: fmtN(catchUp.perWeek.closings, 1), origWk: fmtN(planTargets.closingsPerWeek, 1), perDay: fmtN(catchUp.perDay.closings, 2) },
                    { label: 'Contracts', still: fmtN(Math.max(planTargets.contractsWritten - ytdActuals.contractsWritten, 0), 0), perWk: fmtN(catchUp.perWeek.contractsWritten, 1), origWk: fmtN(planTargets.contractsPerWeek, 1), perDay: fmtN(catchUp.perDay.contractsWritten, 2) },
                    { label: 'Appts Held', still: fmtN(Math.max(planTargets.appointmentsHeld - ytdActuals.appointmentsHeld, 0), 0), perWk: fmtN(catchUp.perWeek.appointmentsHeld, 1), origWk: fmtN(planTargets.apptsHeldPerWeek, 1), perDay: fmtN(catchUp.perDay.appointmentsHeld, 2) },
                    { label: 'Appts Set', still: fmtN(Math.max(planTargets.appointmentsSet - ytdActuals.appointmentsSet, 0), 0), perWk: fmtN(catchUp.perWeek.appointmentsSet, 1), origWk: fmtN(planTargets.apptsSetPerWeek, 1), perDay: fmtN(catchUp.perDay.appointmentsSet, 2) },
                    { label: 'Engagements', still: fmtN(Math.max(planTargets.engagements - ytdActuals.engagements, 0), 0), perWk: fmtN(catchUp.perWeek.engagements, 1), origWk: fmtN(planTargets.engagementsPerWeek, 1), perDay: fmtN(catchUp.perDay.engagements, 2) },
                    { label: 'Calls', still: fmtN(Math.max(planTargets.calls - ytdActuals.calls, 0), 0), perWk: fmtN(catchUp.perWeek.calls, 0), origWk: fmtN(planTargets.callsPerWeek, 0), perDay: fmtN(catchUp.perDay.calls, 1) },
                  ].map(row => (
                    <tr key={row.label} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{row.label}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{row.still}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">{row.perWk}</td>
                      <td className="py-2.5 px-3 text-right text-gray-400 line-through">{row.origWk}</td>
                      <td className="py-2.5 pl-3 text-right text-gray-600">{row.perDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sandbox goal tester */}
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-5 h-5 text-slate-600" />
            What-If Goal Sandbox
          </CardTitle>
          <p className="text-xs text-gray-500">
            Test a different income goal to see how many closings and appointments you would need.
            This does not change your Business Plan.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Test Goal</label>
              <input
                type="number"
                value={sandboxGoal ?? annualIncomeGoal}
                onChange={e => setSandboxGoal(Number(e.target.value))}
                className="border rounded-lg px-3 py-1.5 text-sm w-36"
                step={5000}
                min={0}
              />
            </div>
            <div className="bg-white rounded-lg border px-4 py-2 text-center">
              <div className="text-lg font-bold text-gray-900">{sandboxClosingsNeeded}</div>
              <div className="text-xs text-gray-500">total closings needed</div>
            </div>
            <div className="bg-white rounded-lg border px-4 py-2 text-center">
              <div className="text-lg font-bold text-orange-600">{sandboxClosingsStillNeeded}</div>
              <div className="text-xs text-gray-500">still needed</div>
            </div>
            <div className="bg-white rounded-lg border px-4 py-2 text-center">
              <div className="text-lg font-bold text-blue-600">{fmt$(sandboxIncomeStillNeeded)}</div>
              <div className="text-xs text-gray-500">income still needed</div>
            </div>
            <div className="bg-white rounded-lg border px-4 py-2 text-center">
              <div className="text-lg font-bold text-violet-600">
                {fmtN(remainingWeeks > 0 ? sandboxClosingsStillNeeded / remainingWeeks : 0, 1)}/wk
              </div>
              <div className="text-xs text-gray-500">closings/week needed</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            To update your actual goal, go to the{' '}
            <a href="/dashboard/plan" className="text-blue-600 underline">Business Plan page</a>.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
