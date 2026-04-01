'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Target, TrendingUp, RefreshCw, Save, CheckCircle, Filter, MapPin, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (amount: number, minimumFractionDigits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
  }).format(amount);

const formatNumber = (num: number | undefined | null, dec = 0) => {
    if (num === undefined || num === null || !isFinite(num)) return '—';
    return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

// Mock data structure representing server-side computed values
const initialProjectionData = {
  annualIncomeGoal: 120000,
  avgNetPerClosing: 3000,
  workdaysElapsed: 125,
  totalWorkdaysInYear: 251,
  monthsElapsed: 6,
  ytdActuals: {
    calls: 1850,
    engagements: 420,
    appointmentsSet: 50,
    appointmentsHeld: 45,
    contractsWritten: 18,
    closings: 15,
    netEarned: 45000,
  },
  planConversions: {
    callsPerEngagement: 4,
    engagementsPerApptSet: 10,
    apptSetPerApptHeld: 1.11,
    apptHeldPerContract: 5,
    contractsPerClosing: 1.25,
  },
  planAnnualTargets: {
    calls: 11250,
    engagements: 2813,
    appointmentsSet: 281,
    appointmentsHeld: 253,
    contractsWritten: 51,
    closings: 40,
  },
};

type CatchUpMetrics = {
    incomeLeftToGo: number;
    remainingClosingsNeeded: number;
    metrics: {
        closings: CatchUpMetricValues;
        contractsWritten: CatchUpMetricValues;
        appointmentsHeld: CatchUpMetricValues;
        appointmentsSet: CatchUpMetricValues;
        engagements: CatchUpMetricValues;
        calls: CatchUpMetricValues;
    }
};
type CatchUpMetricValues = { remaining: number; perDay: number; perWeek: number; perMonth: number; };
type ConversionMetric = { name: string; actual: number | null; plan: number; };

const CatchUpMetric = ({ title, data }: { title: string, data: CatchUpMetricValues }) => (
    <Card className="flex flex-col items-center justify-center p-4 text-center">
        <p className="text-xs text-muted-foreground uppercase">{title}</p>
        <p className="text-4xl font-bold text-destructive">{formatNumber(data.remaining)}</p>
        <p className="text-sm font-medium">Needed</p>
        <Separator className="my-2" />
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold">{formatNumber(data.perMonth, 1)}</span>
            <span className="font-semibold">{formatNumber(data.perWeek, 1)}</span>
            <span className="font-semibold">{formatNumber(data.perDay, 1)}</span>
            <span className="text-muted-foreground">/mo</span>
            <span className="text-muted-foreground">/wk</span>
            <span className="text-muted-foreground">/day</span>
        </div>
    </Card>
);

// ── "You Are Here" Hero Timeline ─────────────────────────────────────────────
function ProjectionsHero({
  ytdEarned,
  projectedIncome,
  goal,
  workdaysElapsed,
  totalWorkdays,
}: {
  ytdEarned: number;
  projectedIncome: number;
  goal: number;
  workdaysElapsed: number;
  totalWorkdays: number;
}) {
  const ytdPct = Math.min((ytdEarned / goal) * 100, 100);
  const projectedPct = Math.min((projectedIncome / goal) * 100, 100);
  const dayPct = Math.min((workdaysElapsed / totalWorkdays) * 100, 100);
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
              You Are Here — Income Projections {new Date().getFullYear()}
            </CardTitle>
            <CardDescription>
              Day {workdaysElapsed} of {totalWorkdays} work days · {Math.round(dayPct)}% of year elapsed
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
        {/* Visual progress track */}
        <div className="relative px-1">
          {/* Track */}
          <div className="relative h-5 bg-muted rounded-full overflow-visible">
            {/* YTD actual fill */}
            <div
              className="absolute left-0 top-0 h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${ytdPct}%` }}
            />
            {/* Projected fill (dashed overlay) */}
            <div
              className="absolute top-0 h-full rounded-r-full transition-all duration-700"
              style={{
                left: `${ytdPct}%`,
                width: `${Math.max(projectedPct - ytdPct, 0)}%`,
                background: 'repeating-linear-gradient(90deg, #86efac 0px, #86efac 8px, transparent 8px, transparent 16px)',
              }}
            />
            {/* "You are here" pin */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${ytdPct}%` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-5 h-5 rounded-full bg-green-600 border-2 border-white shadow-md flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>
            </div>
            {/* Goal marker */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-blue-500 rounded-full" />
          </div>
          {/* Labels below track */}
          <div className="flex justify-between mt-3 text-xs">
            <span className="text-muted-foreground">$0</span>
            <div className="flex flex-col items-center" style={{ position: 'absolute', left: `${ytdPct}%`, transform: 'translateX(-50%)' }}>
              <span className="font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                📍 {formatCurrency(ytdEarned)}
              </span>
              <span className="text-muted-foreground text-[10px]">YTD Actual</span>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(goal)} Goal</span>
          </div>
        </div>

        {/* 3 stat boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="rounded-xl border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-4 text-center">
            <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">YTD Actual</p>
            <p className="text-3xl font-black text-green-700 dark:text-green-300">{formatCurrency(ytdEarned)}</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">{Math.round(ytdPct)}% of goal</p>
          </div>
          <div className={cn('rounded-xl border p-4 text-center', isOnTrack
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            : isClose
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          )}>
            <p className={cn('text-xs font-bold uppercase tracking-wider mb-1', statusColor)}>Full-Year Projection</p>
            <p className={cn('text-3xl font-black', statusColor)}>{formatCurrency(projectedIncome)}</p>
            <p className={cn('text-xs mt-1', statusColor)}>
              {isOnTrack
                ? `↑ ${formatCurrency(surplus)} above goal`
                : `↓ ${formatCurrency(shortfall)} short of goal`}
            </p>
          </div>
          <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4 text-center">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">
              {isOnTrack ? 'You\'re Ahead!' : 'To Hit Goal'}
            </p>
            {isOnTrack ? (
              <>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300">🎯</p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Keep your current pace</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300">
                  {formatCurrency(shortfall / Math.max(totalWorkdays - workdaysElapsed, 1))}/day
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">For remaining {totalWorkdays - workdaysElapsed} work days</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectionsPage() {
    const { toast } = useToast();
    const [projectionData, setProjectionData] = useState(initialProjectionData);
    const [sandboxGoal, setSandboxGoal] = useState<number>(projectionData.annualIncomeGoal);
    const [displayGoal, setDisplayGoal] = useState<number>(projectionData.annualIncomeGoal);

    const paceProjection = useMemo(() => {
        const { ytdActuals, workdaysElapsed, totalWorkdaysInYear, planConversions, avgNetPerClosing } = projectionData;
        if (workdaysElapsed === 0) return null;
        const projectedCalls = (ytdActuals.calls / workdaysElapsed) * totalWorkdaysInYear;
        const projectedEngagements = projectedCalls / planConversions.callsPerEngagement;
        const projectedApptsSet = projectedEngagements / planConversions.engagementsPerApptSet;
        const projectedApptsHeld = projectedApptsSet / planConversions.apptSetPerApptHeld;
        const projectedContracts = projectedApptsHeld / planConversions.apptHeldPerContract;
        const projectedClosings = projectedContracts / planConversions.contractsPerClosing;
        const projectedIncome = projectedClosings * avgNetPerClosing;
        return { calls: projectedCalls, engagements: projectedEngagements, appointmentsSet: projectedApptsSet, appointmentsHeld: projectedApptsHeld, contractsWritten: projectedContracts, closings: projectedClosings, income: projectedIncome };
    }, [projectionData]);

    const actualConversions = useMemo(() => {
        const { ytdActuals, planConversions } = projectionData;
        const safeDivide = (num: number, den: number) => den > 0 ? (num / den) : null;
        return [
            { name: "Calls → Engagements", actual: safeDivide(ytdActuals.engagements, ytdActuals.calls), plan: 1 / planConversions.callsPerEngagement },
            { name: "Engagements → Appts Set", actual: safeDivide(ytdActuals.appointmentsSet, ytdActuals.engagements), plan: 1 / planConversions.engagementsPerApptSet },
            { name: "Appts Set → Appts Held", actual: safeDivide(ytdActuals.appointmentsHeld, ytdActuals.appointmentsSet), plan: 1 / planConversions.apptSetPerApptHeld },
            { name: "Appts Held → Contracts", actual: safeDivide(ytdActuals.contractsWritten, ytdActuals.appointmentsHeld), plan: 1 / planConversions.apptHeldPerContract },
            { name: "Contracts → Closings", actual: safeDivide(ytdActuals.closings, ytdActuals.contractsWritten), plan: 1 / planConversions.contractsPerClosing },
        ] as ConversionMetric[];
    }, [projectionData]);

    const calculateCatchUpMetrics = useCallback((goal: number): CatchUpMetrics => {
        const { ytdActuals, avgNetPerClosing, workdaysElapsed, totalWorkdaysInYear, monthsElapsed, planConversions } = projectionData;
        const workdaysRemaining = totalWorkdaysInYear - workdaysElapsed;
        const monthsRemaining = 12 - monthsElapsed;
        const weeksRemaining = workdaysRemaining / 5;
        const incomeLeftToGo = Math.max(goal - ytdActuals.netEarned, 0);
        const requiredAnnualClosings = Math.ceil(goal / avgNetPerClosing);
        const requiredAnnualContracts = Math.ceil(requiredAnnualClosings * planConversions.contractsPerClosing);
        const requiredAnnualApptsHeld = Math.ceil(requiredAnnualContracts * planConversions.apptHeldPerContract);
        const requiredAnnualApptsSet = Math.ceil(requiredAnnualApptsHeld * planConversions.apptSetPerApptHeld);
        const requiredAnnualEngagements = Math.ceil(requiredAnnualApptsSet * planConversions.engagementsPerApptSet);
        const requiredAnnualCalls = Math.ceil(requiredAnnualEngagements * planConversions.callsPerEngagement);
        const remainingNeeded = {
            closings: Math.max(requiredAnnualClosings - ytdActuals.closings, 0),
            contracts: Math.max(requiredAnnualContracts - ytdActuals.contractsWritten, 0),
            apptsHeld: Math.max(requiredAnnualApptsHeld - ytdActuals.appointmentsHeld, 0),
            apptsSet: Math.max(requiredAnnualApptsSet - ytdActuals.appointmentsSet, 0),
            engagements: Math.max(requiredAnnualEngagements - ytdActuals.engagements, 0),
            calls: Math.max(requiredAnnualCalls - ytdActuals.calls, 0),
        };
        const createMetric = (remaining: number): CatchUpMetricValues => ({
            remaining,
            perDay: workdaysRemaining > 0 ? remaining / workdaysRemaining : 0,
            perWeek: weeksRemaining > 0 ? remaining / weeksRemaining : 0,
            perMonth: monthsRemaining > 0 ? remaining / monthsRemaining : 0,
        });
        return {
            incomeLeftToGo,
            remainingClosingsNeeded: remainingNeeded.closings,
            metrics: {
                closings: createMetric(remainingNeeded.closings),
                contractsWritten: createMetric(remainingNeeded.contracts),
                appointmentsHeld: createMetric(remainingNeeded.apptsHeld),
                appointmentsSet: createMetric(remainingNeeded.apptsSet),
                engagements: createMetric(remainingNeeded.engagements),
                calls: createMetric(remainingNeeded.calls),
            }
        };
    }, [projectionData]);

    const catchUpMetrics = useMemo(() => calculateCatchUpMetrics(displayGoal), [displayGoal, calculateCatchUpMetrics]);

    const handleApply = () => setDisplayGoal(sandboxGoal);
    const handleReset = () => { setSandboxGoal(projectionData.annualIncomeGoal); setDisplayGoal(projectionData.annualIncomeGoal); };
    const handleSave = () => {
        setProjectionData({ ...projectionData, annualIncomeGoal: sandboxGoal });
        setDisplayGoal(sandboxGoal);
        toast({ title: "New Goal Saved!", description: `Annual income goal updated to ${formatCurrency(sandboxGoal)}.`, action: <CheckCircle className="h-5 w-5 text-green-500" /> });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Income Projections</h1>
                <p className="text-muted-foreground">Analyze your pace, plan, and catch-up scenarios.</p>
            </div>

            {/* ── Hero: You Are Here ─────────────────────────────────────── */}
            <ProjectionsHero
              ytdEarned={projectionData.ytdActuals.netEarned}
              projectedIncome={paceProjection?.income ?? 0}
              goal={displayGoal}
              workdaysElapsed={projectionData.workdaysElapsed}
              totalWorkdays={projectionData.totalWorkdaysInYear}
            />

            {/* ── Annual Plan Targets ────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" /> Annual Plan Targets</CardTitle>
                    <CardDescription>Your business plan benchmarks for the full year.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto -mx-2 px-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 min-w-[320px]">
                        {[
                            { label: 'Income Goal', value: formatCurrency(projectionData.annualIncomeGoal) },
                            { label: 'Calls', value: formatNumber(projectionData.planAnnualTargets.calls) },
                            { label: 'Engagements', value: formatNumber(projectionData.planAnnualTargets.engagements) },
                            { label: 'Appts Set', value: formatNumber(projectionData.planAnnualTargets.appointmentsSet) },
                            { label: 'Appts Held', value: formatNumber(projectionData.planAnnualTargets.appointmentsHeld) },
                            { label: 'Contracts', value: formatNumber(projectionData.planAnnualTargets.contractsWritten) },
                            { label: 'Closings', value: formatNumber(projectionData.planAnnualTargets.closings) },
                        ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg bg-muted/40 p-3 text-center">
                                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                <p className="text-lg font-black">{value}</p>
                            </div>
                        ))}
                    </div>
                    </div>
                </CardContent>
            </Card>
            {/* ── Catch-Up Calculatorr ────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Catch-Up Calculator</CardTitle>
                    <CardDescription>
                        What it takes from today forward to hit {formatCurrency(displayGoal)}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col lg:flex-row gap-6">
                    <Card className="flex flex-col items-center justify-center p-6 bg-muted/30 flex-shrink-0">
                        <p className="text-sm text-muted-foreground">Income Left To Go</p>
                        <p className="text-4xl font-bold text-destructive">{formatCurrency(catchUpMetrics.incomeLeftToGo)}</p>
                        <Separator className="my-2" />
                        <p className="text-sm text-muted-foreground">Closings Needed: {formatNumber(catchUpMetrics.remainingClosingsNeeded)}</p>
                    </Card>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <CatchUpMetric title="Calls" data={catchUpMetrics.metrics.calls} />
                        <CatchUpMetric title="Engagements" data={catchUpMetrics.metrics.engagements} />
                        <CatchUpMetric title="Appts Set" data={catchUpMetrics.metrics.appointmentsSet} />
                        <CatchUpMetric title="Appts Held" data={catchUpMetrics.metrics.appointmentsHeld} />
                        <CatchUpMetric title="Contracts" data={catchUpMetrics.metrics.contractsWritten} />
                    </div>
                    <Card className="bg-muted/50 lg:w-64 flex-shrink-0">
                        <CardHeader className="pb-2">
                            <Label htmlFor="current-goal">Original Plan Goal</Label>
                            <p id="current-goal" className="text-xl font-bold">{formatCurrency(projectionData.annualIncomeGoal)}</p>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-3">
                            <Separator />
                            <div className="space-y-2">
                                <Label htmlFor="change-goal" className="font-semibold">Change Goal (Sandbox)</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        id="change-goal"
                                        type="number"
                                        className="pl-10"
                                        placeholder="Enter new goal"
                                        value={sandboxGoal}
                                        onChange={(e) => setSandboxGoal(Number(e.target.value))}
                                        suppressHydrationWarning
                                    />
                                </div>
                            </div>
                            <Button onClick={handleApply} className="w-full">Apply Change</Button>
                            <Button onClick={handleReset} variant="outline" className="w-full">
                                <RefreshCw className="mr-2 h-4 w-4" /> Reset to Original
                            </Button>
                        </CardContent>
                        <CardFooter>
                            <Button variant="secondary" className="w-full" onClick={handleSave}>
                                <Save className="mr-2 h-4 w-4" /> Save New Goal to Plan
                            </Button>
                        </CardFooter>
                    </Card>
                </CardContent>
            </Card>

            {/* ── Actual vs Plan Conversions ─────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> Actual vs. Plan Conversions (YTD)</CardTitle>
                    <CardDescription>Diagnostic only. Projections use your business plan conversion assumptions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Funnel Stage</TableHead>
                                <TableHead className="text-right">Actual (YTD)</TableHead>
                                <TableHead className="text-right">Plan</TableHead>
                                <TableHead className="text-right">Delta</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {actualConversions.map((conv) => {
                                const delta = conv.actual !== null ? conv.actual - conv.plan : null;
                                const isPositive = delta !== null && delta > 0;
                                const isNegative = delta !== null && delta < 0;
                                return (
                                    <TableRow key={conv.name}>
                                        <TableCell className="font-medium">{conv.name}</TableCell>
                                        <TableCell className="text-right font-mono">{conv.actual !== null ? `${(conv.actual * 100).toFixed(1)}%` : '—'}</TableCell>
                                        <TableCell className="text-right font-mono">{(conv.plan * 100).toFixed(1)}%</TableCell>
                                        <TableCell className="text-right">
                                            {delta !== null ? (
                                                <Badge variant="outline" className={cn(
                                                    'font-bold text-xs',
                                                    isPositive && 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400',
                                                    isNegative && 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400',
                                                    !isPositive && !isNegative && 'bg-muted text-muted-foreground'
                                                )}>
                                                    {isPositive ? '+' : ''}{(delta * 100).toFixed(1)}%
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
