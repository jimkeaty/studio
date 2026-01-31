'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Target, TrendingUp, RefreshCw, Save, CheckCircle, Phone, Users, CalendarCheck, FileText, Filter, CalendarPlus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const formatCurrency = (amount: number, minimumFractionDigits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
  }).format(amount);

const formatNumber = (num: number | undefined | null, dec = 0) => {
    if (num === undefined || num === null || !isFinite(num)) return '—';
    return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

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
  // Plan conversions from agent's profile. Format: units of prior stage per 1 unit of this stage
  planConversions: {
    callsPerEngagement: 4,       // 4 calls to get 1 engagement (25%)
    engagementsPerApptSet: 10,   // 10 engagements to get 1 appt set (10%)
    apptSetPerApptHeld: 1.11,    // 1.11 appts set to get 1 held (90%)
    apptHeldPerContract: 5,      // 5 appts held to get 1 contract (20%)
    contractsPerClosing: 1.25,   // 1.25 contracts to get 1 closing (80%)
  },
  // Annual targets derived from business plan
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
}
type CatchUpMetricValues = { remaining: number; perDay: number; perWeek: number; perMonth: number; }
type ConversionMetric = { name: string; actual: number | null; plan: number; };

const ProjectionRowMetric = ({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) => (
    <div className="text-center">
        <p className={cn("text-3xl font-bold", valueClass)}>{value}</p>
        <p className="text-xs text-muted-foreground uppercase">{label}</p>
    </div>
);

const CatchUpMetricDisplay = ({ title, data }: { title: string, data: CatchUpMetricValues }) => {
  const needsImprovement = data.remaining > 0;
  return (
    <div className="text-center">
      <p className={cn("text-3xl font-bold", needsImprovement ? "text-destructive" : "text-green-600")}>
        {formatNumber(data.remaining)}
      </p>
      <p className="text-xs text-muted-foreground uppercase">{title}</p>
      {needsImprovement && (
        <div className="mt-2 text-xs text-muted-foreground border-t pt-1 grid">
            <span>{formatNumber(data.perMonth, 1)}/mo</span>
            <span>{formatNumber(data.perWeek, 1)}/wk</span>
            <span>{formatNumber(data.perDay, 1)}/day</span>
        </div>
      )}
    </div>
  )
}

export default function ProjectionsPage() {
    const [sandboxGoal, setSandboxGoal] = useState<number>(initialProjectionData.annualIncomeGoal);
    const [displayGoal, setDisplayGoal] = useState<number>(initialProjectionData.annualIncomeGoal);

    // Section C: "At Your Current Pace..."
    const paceProjection = useMemo(() => {
        const { ytdActuals, workdaysElapsed, totalWorkdaysInYear, planConversions, avgNetPerClosing } = initialProjectionData;

        if (workdaysElapsed === 0) return null;

        const projectedCalls = (ytdActuals.calls / workdaysElapsed) * totalWorkdaysInYear;
        const projectedEngagements = projectedCalls / planConversions.callsPerEngagement;
        const projectedApptsSet = projectedEngagements / planConversions.engagementsPerApptSet;
        const projectedApptsHeld = projectedApptsSet / planConversions.apptSetPerApptHeld;
        const projectedContracts = projectedApptsHeld / planConversions.apptHeldPerContract;
        const projectedClosings = projectedContracts / planConversions.contractsPerClosing;
        const projectedIncome = projectedClosings * avgNetPerClosing;

        return {
            calls: projectedCalls,
            engagements: projectedEngagements,
            appointmentsSet: projectedApptsSet,
            appointmentsHeld: projectedApptsHeld,
            contractsWritten: projectedContracts,
            closings: projectedClosings,
            income: projectedIncome
        }
    }, []);

    // Section E: Actual vs. Plan Conversions
    const actualConversions = useMemo(() => {
        const { ytdActuals, planConversions } = initialProjectionData;
        const safeDivide = (num: number, den: number) => den > 0 ? (num / den) : null;
        
        return [
            { name: "Calls → Engagements", actual: safeDivide(ytdActuals.engagements, ytdActuals.calls), plan: 1 / planConversions.callsPerEngagement },
            { name: "Engagements → Appts Set", actual: safeDivide(ytdActuals.appointmentsSet, ytdActuals.engagements), plan: 1 / planConversions.engagementsPerApptSet },
            { name: "Appts Set → Appts Held", actual: safeDivide(ytdActuals.appointmentsHeld, ytdActuals.appointmentsSet), plan: 1 / planConversions.apptSetPerApptHeld },
            { name: "Appts Held → Contracts", actual: safeDivide(ytdActuals.contractsWritten, ytdActuals.appointmentsHeld), plan: 1 / planConversions.apptHeldPerContract },
            { name: "Contracts → Closings", actual: safeDivide(ytdActuals.closings, ytdActuals.contractsWritten), plan: 1 / planConversions.contractsPerClosing },
        ] as ConversionMetric[];
    }, []);

    // Section D: Catch-Up Calculations
    const calculateCatchUpMetrics = useCallback((goal: number): CatchUpMetrics => {
        const { ytdActuals, avgNetPerClosing, workdaysElapsed, totalWorkdaysInYear, monthsElapsed, planConversions } = initialProjectionData;

        const workdaysRemaining = totalWorkdaysInYear - workdaysElapsed;
        const monthsRemaining = 12 - monthsElapsed;
        const weeksRemaining = workdaysRemaining / 5;

        const incomeLeftToGo = Math.max(goal - ytdActuals.netEarned, 0);
        
        // Use plan conversions to determine targets based on the goal
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
        }

        const createMetric = (remaining: number): CatchUpMetricValues => ({
            remaining: remaining,
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
    }, []);

    const catchUpMetrics = useMemo(() => calculateCatchUpMetrics(displayGoal), [displayGoal, calculateCatchUpMetrics]);

    const handleApply = () => setDisplayGoal(sandboxGoal);
    const handleReset = () => {
        setSandboxGoal(initialProjectionData.annualIncomeGoal);
        setDisplayGoal(initialProjectionData.annualIncomeGoal);
    };

    const handleSave = () => {
        // TODO: Implement server action to save the new goal to the agent's business plan.
        console.log("Saving new goal:", sandboxGoal);
        alert("Goal saved! (This is a placeholder)");
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Income Projections</h1>
                <p className="text-muted-foreground">Analyze your pace, plan, and catch-up scenarios.</p>
            </div>
            
            {/* Business Plan Row */}
            <div className="space-y-2">
                <CardHeader className="p-0 mb-2">
                    <CardTitle className="text-center text-lg">Your Business Plan</CardTitle>
                </CardHeader>
                <div className="relative flex items-center">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-primary -translate-y-1/2 z-0"></div>
                    <div className="bg-primary text-primary-foreground p-4 rounded-lg text-center w-48 z-10">
                        <p className="text-xl font-bold">{formatCurrency(initialProjectionData.annualIncomeGoal)}</p>
                        <p className="text-xs">Annual Goal</p>
                    </div>
                    <div className="flex-1 bg-background z-10 px-4">
                        <div className="grid grid-cols-6 gap-2">
                            <ProjectionRowMetric label="Calls" value={formatNumber(initialProjectionData.planAnnualTargets.calls)} />
                            <ProjectionRowMetric label="Engagements" value={formatNumber(initialProjectionData.planAnnualTargets.engagements)} />
                            <ProjectionRowMetric label="Appts Set" value={formatNumber(initialProjectionData.planAnnualTargets.appointmentsSet)} />
                            <ProjectionRowMetric label="Appts Held" value={formatNumber(initialProjectionData.planAnnualTargets.appointmentsHeld)} />
                            <ProjectionRowMetric label="Contracts" value={formatNumber(initialProjectionData.planAnnualTargets.contractsWritten)} />
                            <ProjectionRowMetric label="Closings" value={formatNumber(initialProjectionData.planAnnualTargets.closings)} />
                        </div>
                    </div>
                    <div className="bg-primary text-primary-foreground p-4 rounded-lg text-center w-48 z-10">
                        <p className="text-xl font-bold">Business Plan</p>
                    </div>
                </div>
            </div>

            {/* Projected Pace Row */}
            <div className="space-y-2">
                <CardHeader className="p-0 mb-2">
                    <CardTitle className="text-center text-lg">At Your Current Pace, You Will Achieve</CardTitle>
                </CardHeader>
                <div className="relative flex items-center">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-green-600 -translate-y-1/2 z-0"></div>
                    <div className="bg-green-600 text-white p-4 rounded-lg text-center w-48 z-10">
                        <p className="text-xl font-bold">{formatCurrency(initialProjectionData.ytdActuals.netEarned)}</p>
                        <p className="text-xs">Actual Income</p>
                    </div>
                    <div className="flex-1 bg-background z-10 px-4">
                        <div className="grid grid-cols-6 gap-2">
                            <ProjectionRowMetric label="Calls" value={formatNumber(paceProjection?.calls)} />
                            <ProjectionRowMetric label="Engagements" value={formatNumber(paceProjection?.engagements)} />
                            <ProjectionRowMetric label="Appts Set" value={formatNumber(paceProjection?.appointmentsSet)} />
                            <ProjectionRowMetric label="Appts Held" value={formatNumber(paceProjection?.appointmentsHeld)} />
                            <ProjectionRowMetric label="Contracts" value={formatNumber(paceProjection?.contractsWritten)} />
                            <ProjectionRowMetric label="Closings" value={formatNumber(paceProjection?.closings)} />
                        </div>
                    </div>
                    <div className="bg-green-600 text-white p-4 rounded-lg text-center w-48 z-10">
                        <p className="text-xl font-bold">{formatCurrency(paceProjection?.income ?? 0)}</p>
                        <p className="text-xs">Projected Income</p>
                    </div>
                </div>
            </div>

            {/* Catch Up Row */}
            <div className="space-y-2">
                <CardHeader className="p-0 mb-2">
                    <CardTitle className="text-center text-lg">To Meet Your Goal ({formatCurrency(displayGoal)}), You Will Need</CardTitle>
                    <CardDescription className="text-center text-sm">This is what it takes from today forward — not what you ‘should have done.’</CardDescription>
                </CardHeader>
                <div className="flex items-start gap-4">
                    <div className="flex-1">
                        <div className="relative flex items-center">
                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-destructive -translate-y-1/2 z-0"></div>
                            <div className="bg-destructive text-destructive-foreground p-4 rounded-lg text-center w-48 z-10">
                                <p className="text-xl font-bold">{formatCurrency(catchUpMetrics.incomeLeftToGo)}</p>
                                <p className="text-xs">Income Left To Go</p>
                            </div>
                            <div className="flex-1 bg-background z-10 px-4">
                                <div className="grid grid-cols-6 gap-2">
                                    <CatchUpMetricDisplay title="Calls" data={catchUpMetrics.metrics.calls} />
                                    <CatchUpMetricDisplay title="Engagements" data={catchUpMetrics.metrics.engagements} />
                                    <CatchUpMetricDisplay title="Appts Set" data={catchUpMetrics.metrics.appointmentsSet} />
                                    <CatchUpMetricDisplay title="Appts Held" data={catchUpMetrics.metrics.appointmentsHeld} />
                                    <CatchUpMetricDisplay title="Contracts" data={catchUpMetrics.metrics.contractsWritten} />
                                    <CatchUpMetricDisplay title="Closings" data={catchUpMetrics.metrics.closings} />
                                </div>
                            </div>
                            <div className="bg-destructive text-destructive-foreground p-4 rounded-lg text-center w-48 z-10">
                                <p className="text-xl font-bold">{formatCurrency(displayGoal)}</p>
                                <p className="text-xs">Agent Income Goal</p>
                            </div>
                        </div>
                    </div>
                    <Card className="bg-muted/50 w-64 flex-shrink-0">
                        <CardHeader className="pb-2">
                            <Label htmlFor="current-goal">Original Plan Goal</Label>
                            <p id="current-goal" className="text-xl font-bold">{formatCurrency(initialProjectionData.annualIncomeGoal)}</p>
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
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter /> Actual vs. Plan Conversions (YTD)</CardTitle>
                    <CardDescription>Diagnostic only. Projections are based on your business plan&apos;s conversion assumptions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Funnel Stage</TableHead>
                                <TableHead className="text-right">Actual Conversion (YTD)</TableHead>
                                <TableHead className="text-right">Plan Assumption</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {actualConversions.map((conv) => (
                                <TableRow key={conv.name}>
                                    <TableCell className="font-medium">{conv.name}</TableCell>
                                    <TableCell className="text-right font-mono">{conv.actual !== null ? `${(conv.actual * 100).toFixed(1)}%` : '—'}</TableCell>
                                    <TableCell className="text-right font-mono">{(conv.plan * 100).toFixed(1)}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
