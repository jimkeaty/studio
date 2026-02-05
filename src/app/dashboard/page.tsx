'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { AgentDashboardData } from '@/lib/types';
import { DollarSign, Activity, Users, Info, TrendingUp, Home, Handshake, AlertTriangle } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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


export default function AgentDashboardPage() {
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [dashboardData, setDashboardData] = useState<AgentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingMockData, setIsUsingMockData] = useState(false);

  useEffect(() => {
    async function fetchData() {
        setLoading(true);
        setIsUsingMockData(false);

        // In a real app, you'd get the user's ID from an auth context.
        // For now, we'll hardcode an agent ID to fetch the data for.
        const userId = 'agent-1'; 
        
        // This is the assumed path for the agent's yearly dashboard rollup document.
        const docRef = doc(db, 'dashboards', userId, 'agent', selectedYear);
        
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setDashboardData(docSnap.data() as AgentDashboardData);
            } else {
                console.warn(`[DEVELOPER WARNING] No live data found at '${docRef.path}'. Falling back to mock data. Ensure your Cloud Functions are running and data exists at this path.`);
                setDashboardData(mockAgentDashboardData);
                setIsUsingMockData(true);
            }
        } catch (e) {
            console.error("Error fetching dashboard data:", e);
            console.warn(`[DEVELOPER WARNING] Failed to fetch live data due to an error. Falling back to mock data. This could be a Firestore permissions issue or a configuration problem.`);
            setDashboardData(mockAgentDashboardData);
            setIsUsingMockData(true);
        } finally {
            setLoading(false);
        }
    }

    fetchData();
  }, [selectedYear]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!dashboardData) {
    // This case should ideally not be hit if we always fall back to mock data,
    // but it's good practice as a safeguard.
    return (
        <Alert variant="destructive">
            <AlertTitle>Error Loading Dashboard</AlertTitle>
            <AlertDescription>Could not load dashboard data. Please try again later.</AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {isUsingMockData && (
        <Alert variant="default" className="bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
            <AlertTitle>Displaying Mock Data</AlertTitle>
            <AlertDescription>
                Could not load live data from Firestore. Please check your console for details and ensure your backend is configured correctly.
            </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 flex flex-col items-center justify-center text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-muted-foreground font-medium">Lead Indicator Grade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-9xl font-bold text-primary">{dashboardData.leadIndicatorGrade}</p>
            <p className="text-muted-foreground mt-2">On pace with your lead generation activities</p>
             {dashboardData.isLeadIndicatorGracePeriod && <p className="text-xs text-muted-foreground mt-1">Grace Period — establishing baseline</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Agent Income</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Grades Section */}
                    <div className="space-y-4">
                        <div className="text-center md:text-left">
                            <p className="text-sm font-medium text-muted-foreground">Grade (Closed Only)</p>
                            <div className="flex items-baseline justify-center md:justify-start gap-2">
                                <p className={cn("text-5xl font-bold", dashboardData.incomeGrade === 'F' || dashboardData.incomeGrade === 'D' ? 'text-destructive' : 'text-primary')}>{dashboardData.incomeGrade}</p>
                                <span className="text-lg text-muted-foreground">{dashboardData.incomePerformance.toFixed(0)}% of Goal</span>
                            </div>
                            {dashboardData.isIncomeGracePeriod && <Badge variant="secondary">Grace Period</Badge>}
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
                                <p className={cn("text-5xl font-bold", dashboardData.pipelineAdjustedIncome.grade === 'F' || dashboardData.pipelineAdjustedIncome.grade === 'D' ? 'text-destructive' : 'text-primary')}>{dashboardData.pipelineAdjustedIncome.grade}</p>
                                <span className="text-lg text-muted-foreground">{dashboardData.pipelineAdjustedIncome.performance.toFixed(0)}% of Goal</span>
                            </div>
                             <p className="text-xs text-muted-foreground mt-1">
                                Based on Total Potential YTD: {formatCurrency(dashboardData.ytdTotalPotential)}
                            </p>
                        </div>
                    </div>

                    {/* Numbers Section */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">YTD Net Earned</p>
                            <p className="text-2xl font-bold">{formatCurrency(dashboardData.netEarned)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">YTD Goal</p>
                            <p className="text-2xl font-bold">{formatCurrency(dashboardData.expectedYTDIncomeGoal)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Est. Pipeline</p>
                            <p className="text-2xl font-bold">{formatCurrency(dashboardData.netPending)}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-primary">Total Potential YTD</p>
                            <p className="text-2xl font-bold text-primary">{formatCurrency(dashboardData.ytdTotalPotential)}</p>
                        </div>
                    </div>
                </div>

                <Separator className="my-4" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Closings (YTD)</p>
                  <p className="text-sm">
                    Buyer: <span className="font-semibold text-foreground">{dashboardData.stats.buyerClosings}</span> | 
                    Seller: <span className="font-semibold text-foreground">{dashboardData.stats.sellerClosings}</span> | 
                    Renter: <span className="font-semibold text-foreground">{dashboardData.stats.renterClosings}</span>
                  </p>
                </div>
                
                {dashboardData.isIncomeGracePeriod && <p className="text-xs text-muted-foreground text-center mt-4">Income typically lags activity by ~60 days.</p>}
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard title="Calls" {...dashboardData.kpis.calls} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Engagements" {...dashboardData.kpis.engagements} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Appts Set" {...dashboardData.kpis.appointmentsSet} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Appts Held" {...dashboardData.kpis.appointmentsHeld} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Contracts" {...dashboardData.kpis.contractsWritten} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Closings" {...dashboardData.kpis.closings} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity /> Funnel Conversions (Actual vs. Plan)</CardTitle>
          <CardDescription>Your year-to-date conversion rates compared to your business plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-center">
          <ConversionStat name="Calls → Engagements" actual={dashboardData.conversions.callToEngagement.actual} plan={dashboardData.conversions.callToEngagement.plan} />
          <ConversionStat name="Engagements → Appts" actual={dashboardData.conversions.engagementToAppointmentSet.actual} plan={dashboardData.conversions.engagementToAppointmentSet.plan} />
          <ConversionStat name="Appts Set → Held" actual={dashboardData.conversions.appointmentSetToHeld.actual} plan={dashboardData.conversions.appointmentSetToHeld.plan} />
          <ConversionStat name="Appts → Contracts" actual={dashboardData.conversions.appointmentHeldToContract.actual} plan={dashboardData.conversions.appointmentHeldToContract.plan} />
          <ConversionStat name="Contracts → Closings" actual={dashboardData.conversions.contractToClosing.actual} plan={dashboardData.conversions.contractToClosing.plan} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Agent Stats (Not Graded)</CardTitle>
            <CardDescription>Key production and income statistics for the year.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile icon={DollarSign} label="YTD Volume" value={`$${(dashboardData.stats.ytdVolume / 1000000).toFixed(1)}M`} />
            <StatTile icon={Home} label="Avg. Sales Price" value={formatCurrency(dashboardData.stats.avgSalesPrice)} />
            <StatTile icon={Handshake} label="Avg. Net Commission" value={formatCurrency(dashboardData.stats.avgCommission)} />
            <StatTile icon={Users} label="Buyer Closings" value={dashboardData.stats.buyerClosings} />
            <StatTile icon={Users} label="Seller Closings" value={dashboardData.stats.sellerClosings} />
            <StatTile icon={DollarSign} label="Avg $ Per Engagement" value={formatCurrency(dashboardData.stats.engagementValue)} />
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
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
                </div>
                 <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                         {[...Array(5)].map((_, i) => {
                            const year = new Date().getFullYear() - i;
                            return <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                        })}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            <ChartContainer config={{
                closed: { label: 'Closed', color: 'hsl(var(--primary))' },
                pending: { label: 'Pending', color: 'hsl(var(--chart-2))' },
                goal: { label: 'Monthly Goal', color: 'hsl(var(--muted-foreground))' },
            }} className="h-[300px] w-full">
                <BarChart data={dashboardData.monthlyIncome} margin={{ right: 5 }}>
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
            <div className="grid w-full grid-cols-3 items-center gap-4">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Closed</p>
                    <p className="text-lg font-bold">{formatCurrency(dashboardData.totalClosedIncomeForYear)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Pending</p>
                    <p className="text-lg font-bold">{formatCurrency(dashboardData.totalPendingIncomeForYear)}</p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="text-sm font-semibold text-primary">Total Income (Incl. Pipeline)</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(dashboardData.totalIncomeWithPipelineForYear)}</p>
                </div>
            </div>
        </CardFooter>
      </Card>
    </div>
  );
}
