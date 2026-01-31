'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Target, TrendingUp, RefreshCw, Save, CheckCircle, Phone, Users, CalendarCheck, FileText } from 'lucide-react';

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

// Mock data, assuming this is fetched from a server-side source.
const initialProjectionData = {
  annualIncomeGoal: 120000,
  netEarnedYTD: 45000,
  avgNetPerClosing: 3000,
  workdaysElapsed: 125,
  totalWorkdaysInYear: 251,
  monthsElapsed: 6,
  ytdActuals: {
    calls: 1250,
    engagements: 420,
    appointmentsSet: 50,
    appointmentsHeld: 45,
    contractsWritten: 18,
    closings: 15,
  },
  planConversionRatios: {
    closingPerContract: 0.8,
    contractPerApptHeld: 0.2,
    apptHeldPerApptSet: 0.9,
    apptSetPerEngagement: 0.1,
    engagementPerCall: 0.25,
  },
  planTargets: {
      dailyCalls: 45,
      dailyEngagements: 11,
      dailyAppointmentsHeld: 1,
      dailyContractsWritten: 0.2,
      closings: 40,
  }
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

const MetricDisplay = ({ label, value, isCurrency = false }: { label: string, value: number, isCurrency?: boolean }) => (
    <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{isCurrency ? formatCurrency(value) : formatNumber(value)}</p>
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

    const calculateCatchUpMetrics = useCallback((goal: number): CatchUpMetrics => {
        const { netEarnedYTD, avgNetPerClosing, workdaysElapsed, totalWorkdaysInYear, monthsElapsed, ytdActuals, planConversionRatios } = initialProjectionData;

        const workdaysRemaining = totalWorkdaysInYear - workdaysElapsed;
        const monthsRemaining = 12 - monthsElapsed;
        const weeksRemaining = workdaysRemaining / 5;

        const incomeLeftToGo = Math.max(goal - netEarnedYTD, 0);
        
        const requiredAnnualClosings = Math.ceil(goal / avgNetPerClosing);
        const remainingClosingsNeeded = Math.max(requiredAnnualClosings - ytdActuals.closings, 0);

        const requiredAnnualContracts = Math.ceil(requiredAnnualClosings / planConversionRatios.closingPerContract);
        const remainingContractsNeeded = Math.max(requiredAnnualContracts - ytdActuals.contractsWritten, 0);

        const requiredAnnualApptsHeld = Math.ceil(requiredAnnualContracts / planConversionRatios.contractPerApptHeld);
        const remainingApptsHeldNeeded = Math.max(requiredAnnualApptsHeld - ytdActuals.appointmentsHeld, 0);

        const requiredAnnualApptsSet = Math.ceil(requiredAnnualApptsHeld / planConversionRatios.apptHeldPerApptSet);
        const remainingApptsSetNeeded = Math.max(requiredAnnualApptsSet - ytdActuals.appointmentsSet, 0);

        const requiredAnnualEngagements = Math.ceil(requiredAnnualApptsSet / planConversionRatios.apptSetPerEngagement);
        const remainingEngagementsNeeded = Math.max(requiredAnnualEngagements - ytdActuals.engagements, 0);
        
        const requiredAnnualCalls = Math.ceil(requiredAnnualEngagements / planConversionRatios.engagementPerCall);
        const remainingCallsNeeded = Math.max(requiredAnnualCalls - ytdActuals.calls, 0);

        const createMetric = (remaining: number): CatchUpMetricValues => ({
            remaining: remaining,
            perDay: workdaysRemaining > 0 ? remaining / workdaysRemaining : 0,
            perWeek: weeksRemaining > 0 ? remaining / weeksRemaining : 0,
            perMonth: monthsRemaining > 0 ? remaining / monthsRemaining : 0,
        });

        return {
            incomeLeftToGo,
            remainingClosingsNeeded,
            metrics: {
                closings: createMetric(remainingClosingsNeeded),
                contractsWritten: createMetric(remainingContractsNeeded),
                appointmentsHeld: createMetric(remainingApptsHeldNeeded),
                appointmentsSet: createMetric(remainingApptsSetNeeded),
                engagements: createMetric(remainingEngagementsNeeded),
                calls: createMetric(remainingCallsNeeded),
            }
        };
    }, []);

    const catchUpMetrics = useMemo(() => calculateCatchUpMetrics(displayGoal), [displayGoal, calculateCatchUpMetrics]);

    const handleApply = () => {
        setDisplayGoal(sandboxGoal);
    };

    const handleReset = () => {
        setSandboxGoal(initialProjectionData.annualIncomeGoal);
        setDisplayGoal(initialProjectionData.annualIncomeGoal);
    };

    const handleSave = () => {
        // TODO: Implement server action to save the new goal to the agent's business plan.
        console.log("Saving new goal:", sandboxGoal);
        alert("Goal saved! (This is a placeholder)");
    };

    const { paceIncome, paceClosings } = useMemo(() => {
        const pacePerDay = initialProjectionData.ytdActuals.closings / initialProjectionData.workdaysElapsed;
        const paceClosings = isFinite(pacePerDay) ? pacePerDay * initialProjectionData.totalWorkdaysInYear : 0;
        const paceIncome = paceClosings * initialProjectionData.avgNetPerClosing;
        return { paceIncome, paceClosings };
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Income Projections</h1>
                <p className="text-muted-foreground">Analyze your pace, plan, and catch-up scenarios.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp/> Current Pace</CardTitle>
                        <CardDescription>If you continue at your current YTD pace.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <MetricDisplay label="Projected Annual Income" value={paceIncome} isCurrency />
                        <MetricDisplay label="Projected Annual Closings" value={paceClosings} />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target/> Original Plan</CardTitle>
                        <CardDescription>Based on your saved business plan.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <MetricDisplay label="Annual Income Goal" value={initialProjectionData.annualIncomeGoal} isCurrency />
                        <MetricDisplay label="Required Annual Closings" value={initialProjectionData.planTargets.closings} />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign/> Catch-Up</CardTitle>
                        <CardDescription>To hit your currently selected goal.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <MetricDisplay label="Income Left To Go" value={catchUpMetrics.incomeLeftToGo} isCurrency />
                        <MetricDisplay label="Closings Still Needed" value={catchUpMetrics.remainingClosingsNeeded} />
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>To Still Hit Your Goal ({formatCurrency(displayGoal)}), You Will Need</CardTitle>
                    <CardDescription>This is what it takes from today forward — not what you ‘should have done.’</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ActivityPaceCard title="Closings" icon={CheckCircle} {...catchUpMetrics.metrics.closings} />
                            <ActivityPaceCard title="Contracts Written" icon={FileText} {...catchUpMetrics.metrics.contractsWritten} />
                            <ActivityPaceCard title="Appointments Held" icon={CalendarCheck} {...catchUpMetrics.metrics.appointmentsHeld} />
                            <ActivityPaceCard title="Engagements" icon={Users} {...catchUpMetrics.metrics.engagements} />
                            <ActivityPaceCard title="Calls" icon={Phone} {...catchUpMetrics.metrics.calls} />
                        </div>
                    </div>
                    <div className="lg:col-span-1">
                        <Card className="bg-muted/50">
                            <CardHeader>
                                <Label htmlFor="current-goal">Agent Income Goal</Label>
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
                                <Button onClick={handleApply} className="w-full">Apply</Button>
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
