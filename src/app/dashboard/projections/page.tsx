'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DollarSign, Target, TrendingUp, RefreshCw, Save, CheckCircle,
  Filter, MapPin, AlertTriangle, Info, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const fmtNum = (n: number | null | undefined, dec = 0) => {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const fmtPct = (n: number | null | undefined) => {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
};

// ── Types ─────────────────────────────────────────────────────────────────────

type RateValues = { remaining: number; perDay: number; perWeek: number; perMonth: number };

type ProjectionData = {
  year: number;
  annualIncomeGoal: number;
  avgNetPerClosing: number;
  totalWorkdaysInYear: number;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  weeksRemaining: number;
  monthsRemaining: number;
  yearPct: number;
  hasPlan: boolean;
  ytdActuals: {
    calls: number;
    engagements: number;
    appointmentsSet: number;
    appointmentsHeld: number;
    contractsWritten: number;
    closings: number;
    pendingUnits: number;
    netEarned: number;
    pendingNetIncome: number;
  };
  planTargets: {
    calls: number;
    engagements: number;
    appointmentsSet: number;
    appointmentsHeld: number;
    contractsWritten: number;
    closings: number;
  };
  actualConversions: {
    callToEngagement: number | null;
    engagementToAppointmentSet: number | null;
    appointmentSetToHeld: number | null;
    appointmentHeldToContract: number | null;
    contractToClosing: number | null;
  };
  planConversions: {
    callToEngagement: number;
    engagementToAppointmentSet: number;
    appointmentSetToHeld: number;
    appointmentHeldToContract: number;
    contractToClosing: number;
  };
  projection: {
    calls: number;
    engagements: number;
    appointmentsSet: number;
    appointmentsHeld: number;
    contractsWritten: number;
    closings: number;
    income: number;
  };
  catchUp: {
    incomeLeftToGo: number;
    closingsNeeded: number;
    metrics: {
      closings: RateValues;
      contractsWritten: RateValues;
      appointmentsHeld: RateValues;
      appointmentsSet: RateValues;
      engagements: RateValues;
      calls: RateValues;
    };
  };
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CatchUpMetric({ title, data }: { title: string; data: RateValues }) {
  return (
    <Card className="flex flex-col items-center justify-center p-4 text-center">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
      <p className="text-3xl font-black text-destructive">{fmtNum(data.remaining, 1)}</p>
      <p className="text-xs font-medium text-muted-foreground mb-2">Remaining Needed</p>
      <Separator className="mb-2" />
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs w-full">
        <span className="font-bold text-sm">{fmtNum(data.perMonth, 1)}</span>
        <span className="font-bold text-sm">{fmtNum(data.perWeek, 1)}</span>
        <span className="font-bold text-sm">{fmtNum(data.perDay, 1)}</span>
        <span className="text-muted-foreground">/mo</span>
        <span className="text-muted-foreground">/wk</span>
        <span className="text-muted-foreground">/day</span>
      </div>
    </Card>
  );
}

function ProjectionsHero({
  data,
  displayGoal,
}: {
  data: ProjectionData;
  displayGoal: number;
}) {
  const { ytdActuals, projection, elapsedWorkdays, totalWorkdaysInYear } = data;
  const ytdEarned = ytdActuals.netEarned;
  const projectedIncome = projection.income;
  const goal = displayGoal;

  const ytdPct = goal > 0 ? Math.min((ytdEarned / goal) * 100, 100) : 0;
  const projectedPct = goal > 0 ? Math.min((projectedIncome / goal) * 100, 100) : 0;
  const dayPct = totalWorkdaysInYear > 0 ? Math.min((elapsedWorkdays / totalWorkdaysInYear) * 100, 100) : 0;

  const isOnTrack = projectedIncome >= goal;
  const isClose = projectedIncome >= goal * 0.85;
  const shortfall = Math.max(goal - projectedIncome, 0);
  const surplus = Math.max(projectedIncome - goal, 0);

  const statusColor = isOnTrack
    ? 'text-green-600 dark:text-green-400'
    : isClose
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  const statusBg = isOnTrack
    ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
    : isClose
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
    : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800';

  return (
    <Card className={cn('border-2', statusBg)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              You Are Here — Income Projections {data.year}
            </CardTitle>
            <CardDescription>
              Day {elapsedWorkdays} of {totalWorkdaysInYear} work days · {Math.round(dayPct)}% of year elapsed
            </CardDescription>
          </div>
          <Badge
            className={cn(
              'text-sm px-3 py-1 font-bold',
              isOnTrack
                ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300'
                : isClose
                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300'
            )}
            variant="outline"
          >
            {isOnTrack ? '✓ On Track to Hit Goal' : isClose ? '⚡ Close — Push Harder' : '⚠ Behind Pace'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress track */}
        <div className="relative px-1 pt-2">
          <div className="relative h-5 bg-muted rounded-full overflow-visible">
            <div
              className="absolute left-0 top-0 h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${ytdPct}%` }}
            />
            <div
              className="absolute top-0 h-full rounded-r-full transition-all duration-700"
              style={{
                left: `${ytdPct}%`,
                width: `${Math.max(projectedPct - ytdPct, 0)}%`,
                background: 'repeating-linear-gradient(90deg, #86efac 0px, #86efac 8px, transparent 8px, transparent 16px)',
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${ytdPct}%` }}
            >
              <div className="w-5 h-5 rounded-full bg-green-600 border-2 border-white shadow-md flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-blue-500 rounded-full" />
          </div>
          <div className="flex justify-between mt-3 text-xs relative">
            <span className="text-muted-foreground">$0</span>
            <div
              className="flex flex-col items-center absolute"
              style={{ left: `${ytdPct}%`, transform: 'translateX(-50%)' }}
            >
              <span className="font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                📍 {fmtCurrency(ytdEarned)}
              </span>
              <span className="text-muted-foreground text-[10px]">YTD Actual</span>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{fmtCurrency(goal)} Goal</span>
          </div>
        </div>

        {/* 3 stat boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          {/* YTD Actual */}
          <div className="rounded-xl border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-4 text-center">
            <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">YTD Actual</p>
            <p className="text-3xl font-black text-green-700 dark:text-green-300">{fmtCurrency(ytdEarned)}</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              {goal > 0 ? `${Math.round(ytdPct)}% of goal` : `${ytdActuals.closings} closings`}
            </p>
            {ytdActuals.pendingNetIncome > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                + {fmtCurrency(ytdActuals.pendingNetIncome)} pending
              </p>
            )}
          </div>

          {/* Full-Year Projection */}
          <div className={cn('rounded-xl border p-4 text-center', isOnTrack
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            : isClose
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          )}>
            <p className={cn('text-xs font-bold uppercase tracking-wider mb-1', statusColor)}>
              Full-Year Projection
            </p>
            <p className={cn('text-3xl font-black', statusColor)}>{fmtCurrency(projectedIncome)}</p>
            <p className={cn('text-xs mt-1', statusColor)}>
              {isOnTrack
                ? `↑ ${fmtCurrency(surplus)} above goal`
                : `↓ ${fmtCurrency(shortfall)} short of goal`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on your actual pace
            </p>
          </div>

          {/* To Hit Goal / Ahead */}
          <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4 text-center">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">
              {isOnTrack ? "You're Ahead!" : 'Income Left to Goal'}
            </p>
            {isOnTrack ? (
              <>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300">🎯</p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Keep your current pace</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300">
                  {fmtCurrency(shortfall)}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                  {data.remainingWorkdays} work days remaining
                </p>
              </>
            )}
          </div>
        </div>

        {/* Projection note */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Full-year projection = YTD actual ({fmtCurrency(ytdEarned)}) + projected remaining closings at your current
            conversion rates × avg net per closing ({fmtCurrency(data.avgNetPerClosing)}).
            {data.ytdActuals.closings === 0 && ' Using plan avg commission since no closings recorded yet.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ProjectionsPageInner() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const viewAs = searchParams.get('viewAs');

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayGoal, setDisplayGoal] = useState<number>(0);
  const [sandboxGoal, setSandboxGoal] = useState<number>(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const url = viewAs
        ? `/api/projections?year=${year}&viewAs=${viewAs}`
        : `/api/projections?year=${year}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ProjectionData = await res.json();
      setData(json);
      setDisplayGoal(json.annualIncomeGoal);
      setSandboxGoal(json.annualIncomeGoal);
    } catch (e) {
      setError('Failed to load projection data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, year, viewAs]);

  useEffect(() => {
    if (!userLoading && user) load();
  }, [user, userLoading, load]);

  const catchUpForGoal = useMemo(() => {
    if (!data) return null;
    if (displayGoal === data.annualIncomeGoal) return data.catchUp;

    // Recalculate catch-up for the sandbox goal
    const { ytdActuals, actualConversions, planConversions, remainingWorkdays, weeksRemaining, monthsRemaining } = data;
    const useConv = (actual: number | null, plan: number) => actual ?? plan;
    const useContractToClose = useConv(actualConversions.contractToClosing, planConversions.contractToClosing);
    const useHeldToContract = useConv(actualConversions.appointmentHeldToContract, planConversions.appointmentHeldToContract);
    const useApptToHeld = useConv(actualConversions.appointmentSetToHeld, planConversions.appointmentSetToHeld);
    const useEngToAppt = useConv(actualConversions.engagementToAppointmentSet, planConversions.engagementToAppointmentSet);
    const useCallToEng = useConv(actualConversions.callToEngagement, planConversions.callToEngagement);

    const incomeLeftToGo = Math.max(displayGoal - ytdActuals.netEarned, 0);
    const closingsNeeded = data.avgNetPerClosing > 0 ? Math.ceil(incomeLeftToGo / data.avgNetPerClosing) : 0;
    const contractsNeeded = useContractToClose > 0 ? Math.ceil(closingsNeeded / useContractToClose) : 0;
    const apptsHeldNeeded = useHeldToContract > 0 ? Math.ceil(contractsNeeded / useHeldToContract) : 0;
    const apptsSetNeeded = useApptToHeld > 0 ? Math.ceil(apptsHeldNeeded / useApptToHeld) : 0;
    const engagementsNeeded = useEngToAppt > 0 ? Math.ceil(apptsSetNeeded / useEngToAppt) : 0;
    const callsNeeded = useCallToEng > 0 ? Math.ceil(engagementsNeeded / useCallToEng) : 0;

    const makeRate = (total: number, done: number): RateValues => {
      const remaining = Math.max(total - done, 0);
      return {
        remaining,
        perDay: remainingWorkdays > 0 ? remaining / remainingWorkdays : 0,
        perWeek: weeksRemaining > 0 ? remaining / weeksRemaining : 0,
        perMonth: monthsRemaining > 0 ? remaining / monthsRemaining : 0,
      };
    };

    return {
      incomeLeftToGo,
      closingsNeeded: Math.max(closingsNeeded - ytdActuals.closings, 0),
      metrics: {
        closings: makeRate(closingsNeeded, ytdActuals.closings),
        contractsWritten: makeRate(contractsNeeded, ytdActuals.contractsWritten),
        appointmentsHeld: makeRate(apptsHeldNeeded, ytdActuals.appointmentsHeld),
        appointmentsSet: makeRate(apptsSetNeeded, ytdActuals.appointmentsSet),
        engagements: makeRate(engagementsNeeded, ytdActuals.engagements),
        calls: makeRate(callsNeeded, ytdActuals.calls),
      },
    };
  }, [data, displayGoal]);

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { ytdActuals, planTargets, actualConversions, planConversions, projection } = data;

  const conversionRows = [
    {
      name: 'Calls → Engagements',
      actual: actualConversions.callToEngagement,
      plan: planConversions.callToEngagement,
    },
    {
      name: 'Engagements → Appts Set',
      actual: actualConversions.engagementToAppointmentSet,
      plan: planConversions.engagementToAppointmentSet,
    },
    {
      name: 'Appts Set → Appts Held',
      actual: actualConversions.appointmentSetToHeld,
      plan: planConversions.appointmentSetToHeld,
    },
    {
      name: 'Appts Held → Contracts',
      actual: actualConversions.appointmentHeldToContract,
      plan: planConversions.appointmentHeldToContract,
    },
    {
      name: 'Contracts → Closings',
      actual: actualConversions.contractToClosing,
      plan: planConversions.contractToClosing,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Income Projections</h1>
          <p className="text-muted-foreground">
            Full-year forecast based on your actual {year} pace and conversion rates.
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!data.hasPlan && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No business plan found for {year}. Go to the <strong>Business Plan</strong> tab to set your annual income goal and KPI targets. Using default assumptions for now.
          </AlertDescription>
        </Alert>
      )}

      {/* Hero: You Are Here */}
      <ProjectionsHero data={data} displayGoal={displayGoal} />

      {/* YTD Actuals vs Plan Targets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            YTD Actuals vs. Annual Plan Targets
          </CardTitle>
          <CardDescription>
            Your actual activity so far in {year} compared to your full-year business plan targets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  <TableHead className="text-right">YTD Actual</TableHead>
                  <TableHead className="text-right">Full-Year Target</TableHead>
                  <TableHead className="text-right">Projected Full Year</TableHead>
                  <TableHead className="text-right">On Track?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {([
                  { label: 'Calls', actual: ytdActuals.calls, target: planTargets.calls, projected: projection.calls },
                  { label: 'Engagements', actual: ytdActuals.engagements, target: planTargets.engagements, projected: projection.engagements },
                  { label: 'Appts Set', actual: ytdActuals.appointmentsSet, target: planTargets.appointmentsSet, projected: projection.appointmentsSet },
                  { label: 'Appts Held', actual: ytdActuals.appointmentsHeld, target: planTargets.appointmentsHeld, projected: projection.appointmentsHeld },
                  { label: 'Contracts', actual: ytdActuals.contractsWritten, target: planTargets.contractsWritten, projected: projection.contractsWritten },
                  { label: 'Closings', actual: ytdActuals.closings, target: planTargets.closings, projected: projection.closings },
                ] as { label: string; actual: number; target: number; projected: number }[]).map(({ label, actual, target, projected }) => {
                  const onTrack = target > 0 ? projected >= target * 0.9 : null;
                  return (
                    <TableRow key={label}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(actual)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {target > 0 ? fmtNum(target) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmtNum(projected, 1)}</TableCell>
                      <TableCell className="text-right">
                        {onTrack === null ? (
                          <span className="text-muted-foreground text-xs">No target</span>
                        ) : onTrack ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> On Track
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-xs">
                            <ArrowDownRight className="h-3 w-3 mr-1" /> Behind
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Income row */}
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>Net Income</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{fmtCurrency(ytdActuals.netEarned)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{fmtCurrency(data.annualIncomeGoal)}</TableCell>
                  <TableCell className="text-right font-mono text-blue-600">{fmtCurrency(projection.income)}</TableCell>
                  <TableCell className="text-right">
                    {projection.income >= data.annualIncomeGoal ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                        <ArrowUpRight className="h-3 w-3 mr-1" /> On Track
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-xs">
                        <ArrowDownRight className="h-3 w-3 mr-1" /> Behind
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Catch-Up Calculator */}
      {catchUpForGoal && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Catch-Up Calculator
            </CardTitle>
            <CardDescription>
              What you need to do from today forward to hit {fmtCurrency(displayGoal)}.
              Uses your actual conversion rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col lg:flex-row gap-6">
            {/* Summary */}
            <Card className="flex flex-col items-center justify-center p-6 bg-muted/30 flex-shrink-0 min-w-[180px]">
              <p className="text-sm text-muted-foreground mb-1">Income Left to Goal</p>
              <p className="text-4xl font-black text-destructive">{fmtCurrency(catchUpForGoal.incomeLeftToGo)}</p>
              <Separator className="my-3" />
              <p className="text-sm text-muted-foreground">
                Closings Still Needed: <strong>{fmtNum(catchUpForGoal.closingsNeeded)}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Avg net/closing: {fmtCurrency(data.avgNetPerClosing)}
              </p>
            </Card>

            {/* KPI catch-up grid */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <CatchUpMetric title="Calls" data={catchUpForGoal.metrics.calls} />
              <CatchUpMetric title="Engagements" data={catchUpForGoal.metrics.engagements} />
              <CatchUpMetric title="Appts Set" data={catchUpForGoal.metrics.appointmentsSet} />
              <CatchUpMetric title="Appts Held" data={catchUpForGoal.metrics.appointmentsHeld} />
              <CatchUpMetric title="Contracts" data={catchUpForGoal.metrics.contractsWritten} />
              <CatchUpMetric title="Closings" data={catchUpForGoal.metrics.closings} />
            </div>
          </CardContent>

          {/* Goal sandbox */}
          <CardFooter className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-t pt-4">
            <div className="flex-1 space-y-1">
              <Label className="text-sm font-semibold">Original Plan Goal</Label>
              <p className="text-xl font-black">{fmtCurrency(data.annualIncomeGoal)}</p>
              <p className="text-xs text-muted-foreground">Set in your Business Plan</p>
            </div>
            <Separator orientation="vertical" className="hidden sm:block h-16" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="sandbox-goal" className="text-sm font-semibold">
                Adjust Goal (Sandbox)
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="sandbox-goal"
                    type="number"
                    className="pl-9"
                    value={sandboxGoal}
                    onChange={(e) => setSandboxGoal(Number(e.target.value))}
                  />
                </div>
                <Button onClick={() => setDisplayGoal(sandboxGoal)} size="sm">Apply</Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSandboxGoal(data.annualIncomeGoal);
                    setDisplayGoal(data.annualIncomeGoal);
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Change the goal to see how the catch-up calculator adjusts.
              </p>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Actual vs Plan Conversion Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Actual vs. Plan Conversion Rates (YTD)
          </CardTitle>
          <CardDescription>
            Your actual conversion rates drive the full-year projection above.
            Plan rates are shown for comparison only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funnel Stage</TableHead>
                <TableHead className="text-right">Your Actual Rate</TableHead>
                <TableHead className="text-right">Plan Rate</TableHead>
                <TableHead className="text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversionRows.map((row) => {
                const delta = row.actual !== null ? row.actual - row.plan : null;
                const isPositive = delta !== null && delta > 0;
                const isNegative = delta !== null && delta < 0;
                return (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {row.actual !== null ? fmtPct(row.actual) : (
                        <span className="text-muted-foreground text-xs">Not enough data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmtPct(row.plan)}
                    </TableCell>
                    <TableCell className="text-right">
                      {delta !== null ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-bold text-xs',
                            isPositive && 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400',
                            isNegative && 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400',
                            !isPositive && !isNegative && 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isPositive ? '+' : ''}{fmtPct(delta)}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProjectionsPage() {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-80" /></div>}>
      <ProjectionsPageInner />
    </Suspense>
  );
}
