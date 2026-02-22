
'use client';
import TopAgents2025 from "./TopAgents2025";
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { AgentDashboardData, BusinessPlan } from '@/lib/types';
import { DollarSign, Activity, Users, Info, TrendingUp, Home, Handshake, AlertTriangle } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, onSnapshot, DocumentReference } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { mockAgentDashboardData } from '@/lib/mock-data';

const formatCurrency = (amount: number, minimumFractionDigits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
  }).format(amount);

const ConversionStat = ({ name, actual, plan }: { name: string; actual: number | null; plan: number }) => (
  <div className="rounded-lg border p-4">
    <p className="text-sm font-medium text-muted-foreground">{name}</p>
    <div className="mt-2 flex items-center justify-center gap-2">
      <p className="text-2xl font-bold">
        {actual != null ? `${(actual * 100).toFixed(1)}%` : '—'}
      </p>
      {actual != null && actual >= plan && <TrendingUp className="h-5 w-5 text-green-500" />}
    </div>
    <p className="text-xs text-muted-foreground">Plan: {(plan * 100).toFixed(1)}%</p>
  </div>
);

const StatTile = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | number }) => (
  <div className="flex items-center gap-4 rounded-lg border p-4">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  </div>
);

const DashboardSkeleton = () => (
    <div className="flex flex-col gap-8">
        <div>
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-5 w-1/3 mt-2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            <Card className="lg:col-span-2"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-60 w-full" /></CardContent></Card>
    </div>
);

const processMonthlyIncomeData = (monthlyIncome: AgentDashboardData['monthlyIncome'], selectedYear: string) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const displayYear = parseInt(selectedYear, 10);

    return monthlyIncome.map((monthData, index) => {
        const newMonthData = { ...monthData };

        if (displayYear > currentYear) {
            newMonthData.closed = 0;
            newMonthData.pending = 0;
        } else if (displayYear < currentYear) {
            newMonthData.pending = 0;
        } else { // Current year
            if (index < currentMonth) {
                newMonthData.pending = 0;
            }
        }
        return newMonthData;
    });
};


export default function AgentDashboardPage() {
  const [selectedYear, setSelectedYear] = useState('');
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();

  // Use `undefined` as initial state to signify "loading"
  const [liveDashboardData, setLiveDashboardData] = useState<AgentDashboardData | null | undefined>(undefined);
  const [businessPlan, setBusinessPlan] = useState<BusinessPlan | null | undefined>(undefined);
  const [dataError, setDataError] = useState<Error | null>(null);

  useEffect(() => {
    setSelectedYear(String(new Date().getFullYear()));
  }, []);

  const dashboardDocRef = useMemo(() => {
    if (!user?.uid || !db || !selectedYear) return null;
    return doc(db, 'dashboards', user.uid, 'agent', selectedYear) as DocumentReference<AgentDashboardData>;
  }, [user?.uid, db, selectedYear]);

  const planDocRef = useMemo(() => {
    if (!user?.uid || !db || !selectedYear) return null;
    return doc(db, 'users', user.uid, 'plans', selectedYear) as DocumentReference<BusinessPlan>;
  }, [user?.uid, db, selectedYear]);


  useEffect(() => {
    if (!dashboardDocRef) {
      setLiveDashboardData(null); // No user/ref, so data is loaded and is null
      return;
    }
    const unsubscribe = onSnapshot(dashboardDocRef,
      (snapshot) => {
        setLiveDashboardData(snapshot.exists() ? snapshot.data() : null);
        setDataError(null);
      },
      (err) => {
        console.error(`[AgentDashboard] Error fetching dashboard document at ${dashboardDocRef.path}:`, err);
        setDataError(err);
        setLiveDashboardData(null); // Error occurred, so data is loaded and is null
      }
    );
    return () => unsubscribe();
  }, [dashboardDocRef]);

  useEffect(() => {
    if (!planDocRef) {
      setBusinessPlan(null); // No user/ref, so plan is loaded and is null
      return;
    }
    const unsubscribe = onSnapshot(planDocRef,
      (snapshot) => {
        setBusinessPlan(snapshot.exists() ? snapshot.data() : null);
      },
      (err) => {
        console.error(`[AgentDashboard] Error fetching business plan at ${planDocRef.path}:`, err);
        setBusinessPlan(null); // Error occurred, so plan is loaded and is null
      }
    );
    return () => unsubscribe();
  }, [planDocRef]);

  const dataHasLoaded = liveDashboardData !== undefined && businessPlan !== undefined;
  const loading = userLoading || !dataHasLoaded;

  const displayData = useMemo(() => {
    if (loading) return null;

    const monthlyGoal = businessPlan?.calculatedTargets?.monthlyNetIncome || mockAgentDashboardData.monthlyIncome[0].goal;
    
    let baseData: AgentDashboardData;
    if (liveDashboardData) {
      baseData = liveDashboardData;
    } else {
      // Create a fresh, resettable copy of the mock data
      baseData = JSON.parse(JSON.stringify(mockAgentDashboardData)); 
      
      Object.keys(baseData.kpis).forEach(key => {
        const kpi = key as keyof typeof baseData.kpis;
        baseData.kpis[kpi].actual = 0;
        baseData.kpis[kpi].performance = 0;
        baseData.kpis[kpi].grade = 'F';
      });
      
      baseData.netEarned = 0;
      baseData.netPending = 0;
      baseData.ytdTotalPotential = 0;
      baseData.expectedYTDIncomeGoal = 0;
      baseData.totalClosedIncomeForYear = 0;
      baseData.totalPendingIncomeForYear = 0;
      baseData.totalIncomeWithPipelineForYear = 0;
      
      baseData.monthlyIncome = baseData.monthlyIncome.map(m => ({ ...m, closed: 0, pending: 0 }));
      
      baseData.incomeGrade = 'F';
      baseData.leadIndicatorGrade = 'F';
      baseData.pipelineAdjustedIncome = { grade: 'F', performance: 0 };
    }
    
    const ensuredMonthlyIncome = (baseData.monthlyIncome || []).map(monthData => ({
        ...monthData,
        goal: monthlyGoal,
    }));

    return {
        ...baseData,
        monthlyIncome: ensuredMonthlyIncome,
    };

  }, [loading, liveDashboardData, businessPlan]);

  if (loading || !displayData) {
    return <DashboardSkeleton />;
  }

  const isUsingMockData = !liveDashboardData;

  const processedMonthlyIncome = processMonthlyIncomeData(displayData.monthlyIncome, selectedYear);
  const processedDashboardData = {
    ...displayData,
    monthlyIncome: processedMonthlyIncome,
  };


  return (
    <div className="flex flex-col gap-8">
      {isUsingMockData && (
        <Alert variant="default" className="bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
            <AlertTitle>{dataError ? 'Error Loading Live Data' : 'Displaying Sample Data'}</AlertTitle>
            <AlertDescription>
                {dataError ? `We encountered an issue fetching your live data: ${dataError.message}. This can happen due to network or permission issues.` : `Could not find live data for your user for the year ${selectedYear}. This is expected for new users or for years without imported historical data. We're showing you sample data in the meantime.`}
            </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
          <p className="text-muted-foreground">Your performance at a glance for {selectedYear}.</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
                {[...Array(5)].map((_, i) => {
                const year = new Date().getFullYear() + 2 - i;
                return <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                })}
            </SelectContent>
        </Select>
      </div>
      <TopAgents2025 year={Number(selectedYear)} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 flex flex-col items-center justify-center text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-muted-foreground font-medium">Lead Indicator Grade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-9xl font-bold text-primary">{processedDashboardData.leadIndicatorGrade}</p>
            <p className="text-muted-foreground mt-2">On pace with your lead generation activities</p>
             {processedDashboardData.isLeadIndicatorGracePeriod && <p className="text-xs text-muted-foreground mt-1">Grace Period — establishing baseline</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Agent Income</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="text-center md:text-left">
                            <p className="text-sm font-medium text-muted-foreground">Grade (Closed Only)</p>
                            <div className="flex items-baseline justify-center md:justify-start gap-2">
                                <p className={cn("text-5xl font-bold", processedDashboardData.incomeGrade === 'F' || processedDashboardData.incomeGrade === 'D' ? 'text-destructive' : 'text-primary')}>{processedDashboardData.incomeGrade}</p>
                                <span className="text-lg text-muted-foreground">{processedDashboardData.incomePerformance.toFixed(0)}% of Goal</span>
                            </div>
                            {processedDashboardData.isIncomeGracePeriod && <Badge variant="secondary">Grace Period</Badge>}
                        </div>
                        <Separator />
                        <div className="text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-2">
                                <p className="text-sm font-medium text-muted-foreground">Grade (If Pipeline Closes)</p>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Pending income is not guaranteed. This is a what-if view only.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                             <div className="flex items-baseline justify-center md:justify-start gap-2">
                                <p className={cn("text-5xl font-bold", processedDashboardData.pipelineAdjustedIncome.grade === 'F' || processedDashboardData.pipelineAdjustedIncome.grade === 'D' ? 'text-destructive' : 'text-primary')}>{processedDashboardData.pipelineAdjustedIncome.grade}</p>
                                <span className="text-lg text-muted-foreground">{processedDashboardData.pipelineAdjustedIncome.performance.toFixed(0)}% of Goal</span>
                            </div>
                             <p className="text-xs text-muted-foreground mt-1">
                                Based on Total Potential YTD: {formatCurrency(processedDashboardData.ytdTotalPotential)}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">YTD Net Earned</p>
                            <p className="text-2xl font-bold">{formatCurrency(processedDashboardData.netEarned)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">YTD Goal</p>
                            <p className="text-2xl font-bold">{formatCurrency(processedDashboardData.expectedYTDIncomeGoal)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Est. Pipeline</p>
                            <p className="text-2xl font-bold">{formatCurrency(processedDashboardData.netPending)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-primary">Total Potential YTD</p>
                            <p className="text-2xl font-bold text-primary">{formatCurrency(processedDashboardData.ytdTotalPotential)}</p>
                        </div>
                    </div>
                </div>

                <Separator className="my-4" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Closings (YTD)</p>
                  <p className="text-sm">
                    Buyer: <span className="font-semibold text-foreground">{processedDashboardData.stats.buyerClosings}</span> | 
                    Seller: <span className="font-semibold text-foreground">{processedDashboardData.stats.sellerClosings}</span> | 
                    Renter: <span className="font-semibold text-foreground">{processedDashboardData.stats.renterClosings}</span>
                  </p>
                </div>
                
                {processedDashboardData.isIncomeGracePeriod && <p className="text-xs text-muted-foreground text-center mt-4">Income typically lags activity by ~60 days.</p>}
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard title="Calls" {...processedDashboardData.kpis.calls} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Engagements" {...processedDashboardData.kpis.engagements} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Appts Set" {...processedDashboardData.kpis.appointmentsSet} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Appts Held" {...processedDashboardData.kpis.appointmentsHeld} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Contracts" {...processedDashboardData.kpis.contractsWritten} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Closings" {...processedDashboardData.kpis.closings} isGracePeriod={processedDashboardData.isLeadIndicatorGracePeriod} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity /> Funnel Conversions (Actual vs. Plan)</CardTitle>
          <CardDescription>Your year-to-date conversion rates compared to your business plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-center">
          <ConversionStat name="Calls → Engagements" actual={processedDashboardData.conversions.callToEngagement.actual} plan={processedDashboardData.conversions.callToEngagement.plan} />
          <ConversionStat name="Engagements → Appts" actual={processedDashboardData.conversions.engagementToAppointmentSet.actual} plan={processedDashboardData.conversions.engagementToAppointmentSet.plan} />
          <ConversionStat name="Appts Set → Held" actual={processedDashboardData.conversions.appointmentSetToHeld.actual} plan={processedDashboardData.conversions.appointmentSetToHeld.plan} />
          <ConversionStat name="Appts → Contracts" actual={processedDashboardData.conversions.appointmentHeldToContract.actual} plan={processedDashboardData.conversions.appointmentHeldToContract.plan} />
          <ConversionStat name="Contracts → Closings" actual={processedDashboardData.conversions.contractToClosing.actual} plan={processedDashboardData.conversions.contractToClosing.plan} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Agent Stats (Not Graded)</CardTitle>
            <CardDescription>Key production and income statistics for the year.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile icon={DollarSign} label="YTD Volume" value={`$${(processedDashboardData.stats.ytdVolume / 1000000).toFixed(1)}M`} />
            <StatTile icon={Home} label="Avg. Sales Price" value={formatCurrency(processedDashboardData.stats.avgSalesPrice)} />
            <StatTile icon={Handshake} label="Avg. Net Commission" value={formatCurrency(processedDashboardData.stats.avgCommission)} />
            <StatTile icon={Users} label="Buyer Closings" value={processedDashboardData.stats.buyerClosings} />
            <StatTile icon={Users} label="Seller Closings" value={processedDashboardData.stats.sellerClosings} />
            <StatTile icon={DollarSign} label="Avg $ Per Engagement" value={formatCurrency(processedDashboardData.stats.engagementValue)} />
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>Agent Income by Month</CardTitle>
          <CardDescription className="flex items-center gap-1.5 pt-1">
              Showing goal, closed, and pending income for {selectedYear}.
                <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                          <p>Pending income is not guaranteed and does not affect your Income Grade. The goal is based on your business plan.</p>
                      </TooltipContent>
                  </Tooltip>
              </TooltipProvider>
          </CardDescription>
        </CardHeader>
        <CardContent>
            <ChartContainer config={{
                closed: { label: 'Closed', color: 'hsl(var(--primary))' },
                pending: { label: 'Pending', color: 'hsl(var(--chart-2))' },
                goal: { label: 'Monthly Goal', color: 'hsl(var(--chart-3))' },
            }} className="h-[300px] w-full">
                <BarChart data={processedDashboardData.monthlyIncome} margin={{ right: 5 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                    />
                    <YAxis
                        tickFormatter={(value) => `$${Number(value) / 1000}k`}
                        domain={[0, 'dataMax + 2000']}
                    />
                    <ChartTooltip
                        cursor={true}
                        content={<ChartTooltipContent indicator="dot" />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="closed" stackId="a" fill="var(--color-closed)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="goal" stroke="var(--color-goal)" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                </BarChart>
            </ChartContainer>
        </CardContent>
        <CardFooter className="border-t p-4">
            <div className="grid w-full grid-cols-4 items-center gap-2 text-center">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">YTD Goal</p>
                    <p className="text-lg font-bold">{formatCurrency(processedDashboardData.expectedYTDIncomeGoal)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">YTD Closed</p>
                    <p className="text-lg font-bold">{formatCurrency(processedDashboardData.totalClosedIncomeForYear)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">YTD Pending</p>
                    <p className="text-lg font-bold">{formatCurrency(processedDashboardData.totalPendingIncomeForYear)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-primary">Potential</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(processedDashboardData.totalIncomeWithPipelineForYear)}</p>
                </div>
            </div>
        </CardFooter>
      </Card>
    </div>
  );
}

    