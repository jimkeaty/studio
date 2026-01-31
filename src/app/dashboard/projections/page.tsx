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

const MetricDisplay = ({ label, value, isCurrency = false, isCompact = false }: { label: string, value: number, isCurrency?: boolean, isCompact?: boolean }) => (
    <div>
        <p className={cn("text-muted-foreground", isCompact ? "text-xs" : "text-sm")}>{label}</p>
        <p className={cn("font-bold", isCompact ? "text-lg" : "text-2xl")}>{isCurrency ? formatCurrency(value) : formatNumber(value)}</p>
    </div>
);

const ActivityPaceCard = ({ title, icon: Icon, perDay, perWeek, perMonth }: { title: string, icon: React.ElementType, perDay: number, perWeek: number, perMonth: number }) => (
    <div className="rounded-lg border p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <p className="font-semibold">{title}</p>
        </div>
        <div className="grid grid-cols-3 divide-x">
            <div>
                <p className="text-lg font-bold">{formatNumber(perDay, 1)}</p>
                <p className="text-xs text-muted-foreground">/ Day</p>
            </div>
            <div>
                <p className="text-lg font-bold">{formatNumber(perWeek, 1)}</p>
                <p className="text-xs text-muted-foreground">/ Week</p>
            </div>
            <div>
                <p className="text-lg font-bold">{formatNumber(perMonth, 1)}</p>
                <p className="text-xs text-muted-foreground">/ Month</p>
            </div>
        </div>
    </div>
)


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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target/> Your Business Plan</CardTitle>
                        <CardDescription>Your annual targets for the year.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <MetricDisplay label="Annual Income Goal" value={initialProjectionData.annualIncomeGoal} isCurrency />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2">
                            <MetricDisplay label="Closings" value={initialProjectionData.planAnnualTargets.closings} isCompact/>
                            <MetricDisplay label="Contracts" value={initialProjectionData.planAnnualTargets.contractsWritten} isCompact/>
                            <MetricDisplay label="Appts Held" value={initialProjectionData.planAnnualTargets.appointmentsHeld} isCompact/>
                            <MetricDisplay label="Engagements" value={initialProjectionData.planAnnualTargets.engagements} isCompact/>
                            <MetricDisplay label="Calls" value={initialProjectionData.planAnnualTargets.calls} isCompact/>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp/> Projected Pace</CardTitle>
                        <CardDescription>Using calls pace & plan conversions.</CardDescription>
                    </CardHeader>
                     <CardContent className="space-y-4">
                        <MetricDisplay label="Projected Annual Income" value={paceProjection?.income ?? 0} isCurrency />
                         <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2">
                            <MetricDisplay label="Closings" value={paceProjection?.closings ?? 0} isCompact/>
                            <MetricDisplay label="Contracts" value={paceProjection?.contractsWritten ?? 0} isCompact/>
                            <MetricDisplay label="Appts Held" value={paceProjection?.appointmentsHeld ?? 0} isCompact/>
                            <MetricDisplay label="Engagements" value={paceProjection?.engagements ?? 0} isCompact/>
                            <MetricDisplay label="Calls" value={paceProjection?.calls ?? 0} isCompact/>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign/> Catch-Up To Goal</CardTitle>
                        <CardDescription>To hit your selected goal of {formatCurrency(displayGoal)}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <MetricDisplay label="Actual Net Earned YTD" value={initialProjectionData.ytdActuals.netEarned} isCurrency />
                        <MetricDisplay label="Income Left To Go" value={catchUpMetrics.incomeLeftToGo} isCurrency />
                        <MetricDisplay label="Closings Still Needed" value={catchUpMetrics.remainingClosingsNeeded} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter /> Actual vs. Plan Conversions (YTD)</CardTitle>
                    <CardDescription>Diagnostic only. Projections are based on plan conversions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Funnel Stage</TableHead>
                                <TableHead className="text-right">Actual (YTD)</TableHead>
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
            
            <Card>
                <CardHeader>
                    <CardTitle>To Still Hit Your Goal ({formatCurrency(displayGoal)}), You Will Need:</CardTitle>
                    <CardDescription>This is what it takes from today forward — not what you ‘should have done.’</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ActivityPaceCard title="Closings" icon={CheckCircle} {...catchUpMetrics.metrics.closings} />
                            <ActivityPaceCard title="Contracts Written" icon={FileText} {...catchUpMetrics.metrics.contractsWritten} />
                            <ActivityPaceCard title="Appointments Held" icon={CalendarCheck} {...catchUpMetrics.metrics.appointmentsHeld} />
                            <ActivityPaceCard title="Appointments Set" icon={CalendarPlus} {...catchUpMetrics.metrics.appointmentsSet} />
                            <ActivityPaceCard title="Engagements" icon={Users} {...catchUpMetrics.metrics.engagements} />
                            <ActivityPaceCard title="Calls" icon={Phone} {...catchUpMetrics.metrics.calls} />
                        </div>
                    </div>
                    <div className="lg:col-span-1">
                        <Card className="bg-muted/50">
                            <CardHeader>
                                <Label htmlFor="current-goal">Original Plan Goal</Label>
                                <p id="current-goal" className="text-2xl font-bold">{formatCurrency(initialProjectionData.annualIncomeGoal)}</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                </CardContent>
            </Card>
        </div>
    );
}
