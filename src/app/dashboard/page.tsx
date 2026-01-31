'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { AgentDashboardData } from '@/lib/types';
import { DollarSign, BarChart as BarChartIcon, TrendingUp, Home, Handshake, Activity, Users, Info, KeyRound } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, BarChart, Bar, XAxis, YAxis, CartesianGrid, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


// Mock data for the agent dashboard. In a real app, this would be fetched from Firestore.
const monthlyIncomeData = [
    { month: 'Jan', closed: 2000, pending: 1000 },
    { month: 'Feb', closed: 2562, pending: 500 },
    { month: 'Mar', closed: 0, pending: 2000 },
    { month: 'Apr', closed: 0, pending: 0 },
    { month: 'May', closed: 0, pending: 3000 },
    { month: 'Jun', closed: 0, pending: 5000 },
    { month: 'Jul', closed: 0, pending: 500 },
    { month: 'Aug', closed: 0, pending: 0 },
    { month: 'Sep', closed: 0, pending: 0 },
    { month: 'Oct', closed: 0, pending: 0 },
    { month: 'Nov', closed: 0, pending: 0 },
    { month: 'Dec', closed: 0, pending: 0 },
];
const totalClosedIncomeForYear = monthlyIncomeData.reduce((acc, month) => acc + month.closed, 0);
const totalPendingIncomeForYear = monthlyIncomeData.reduce((acc, month) => acc + month.pending, 0);

const netEarnedYTD = 4562;
const netPendingYTD = 12000;
const expectedYTDGoal = 16733;
const ytdTotalPotential = netEarnedYTD + netPendingYTD;

const dashboardData: AgentDashboardData = {
  userId: 'agent-1',
  leadIndicatorGrade: 'B',
  leadIndicatorPerformance: 99,
  isLeadIndicatorGracePeriod: false,
  incomeGrade: 'F',
  incomePerformance: (netEarnedYTD / expectedYTDGoal) * 100,
  isIncomeGracePeriod: false,
  expectedYTDIncomeGoal: expectedYTDGoal,
  pipelineAdjustedIncome: {
    grade: 'A',
    performance: (ytdTotalPotential / expectedYTDGoal) * 100,
  },
  kpis: {
    calls: { actual: 1250, target: 1500, performance: 83, grade: 'C' },
    engagements: { actual: 420, target: 500, performance: 84, grade: 'C' },
    appointmentsSet: { actual: 50, target: 55, performance: 91, grade: 'B' },
    appointmentsHeld: { actual: 45, target: 50, performance: 90, grade: 'B' },
    contractsWritten: { actual: 15, target: 12, performance: 125, grade: 'A' },
    closings: { actual: 10, target: 8, performance: 125, grade: 'A' },
  },
  netEarned: netEarnedYTD,
  netPending: netPendingYTD,
  ytdTotalPotential: ytdTotalPotential,
  monthlyIncome: monthlyIncomeData,
  totalClosedIncomeForYear,
  totalPendingIncomeForYear,
  totalIncomeWithPipelineForYear: totalClosedIncomeForYear + totalPendingIncomeForYear,
  forecast: {
    projectedClosings: 11,
    paceBasedNetIncome: 33000,
  },
  conversions: {
    callToEngagement: { actual: (420 / 1250) * 100, plan: 25 },
    engagementToAppointmentSet: { actual: (50 / 420) * 100, plan: 10 },
    appointmentSetToHeld: { actual: (45 / 50) * 100, plan: 90 },
    appointmentHeldToContract: { actual: (15 / 45) * 100, plan: 20 },
    contractToClosing: { actual: (9 / 15) * 100, plan: 80 },
  },
  stats: {
    ytdVolume: 2700000,
    avgSalesPrice: 300000,
    buyerClosings: 6,
    sellerClosings: 4,
    renterClosings: 3,
    avgCommission: 3000,
    engagementValue: 64.28,
  },
};

const formatCurrency = (amount: number, minimumFractionDigits = 0) => 
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    minimumFractionDigits 
  }).format(amount);

const ConversionStat = ({ name, actual, plan }: { name: string; actual: number | null; plan: number }) => (
  <div className="rounded-lg border p-4">
    <p className="text-sm font-medium text-muted-foreground">{name}</p>
    <div className="mt-2 flex items-center justify-center gap-2">
      <p className="text-2xl font-bold">
        {actual != null ? `${actual.toFixed(1)}%` : '—'}
      </p>
      {actual != null && actual >= plan && <TrendingUp className="h-5 w-5 text-green-500" />}
    </div>
    <p className="text-xs text-muted-foreground">Plan: {plan.toFixed(1)}%</p>
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


export default function AgentDashboardPage() {
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  return (
    <div className="flex flex-col gap-8">
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
          <ConversionStat name="Calls to Engagements" {...dashboardData.conversions.callToEngagement} />
          <ConversionStat name="Engagements to Appts" {...dashboardData.conversions.engagementToAppointmentSet} />
          <ConversionStat name="Appts Set to Held" {...dashboardData.conversions.appointmentSetToHeld} />
          <ConversionStat name="Appts to Contracts" {...dashboardData.conversions.appointmentHeldToContract} />
          <ConversionStat name="Contracts to Closings" {...dashboardData.conversions.contractToClosing} />
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
                        Showing closed and pending income for {selectedYear}.
                         <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Pending income is not guaranteed and does not affect your Income Grade.</p>
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
                pending: { label: 'Pending (Not Guaranteed)', color: 'hsl(var(--chart-2))' },
            }} className="h-[300px] w-full">
                <BarChart data={dashboardData.monthlyIncome} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="month" type="category" tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={true} content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="closed" type="monotone" stackId="a" fill="var(--color-closed)" radius={[4, 0, 0, 4]} />
                    <Bar dataKey="pending" type="monotone" stackId="a" fill="var(--color-pending)" radius={[0, 4, 4, 0]} />
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Earned (Closed)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardData.netEarned)}
            </div>
            <p className="text-xs text-muted-foreground">Total commission earned this year.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Pending (Under Contract)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardData.netPending)}
            </div>
            <p className="text-xs text-muted-foreground">Commission from pending transactions.</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pace-Based Estimated Net</CardTitle>
            <BarChartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ~ {formatCurrency(dashboardData.forecast.paceBasedNetIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Estimated income based on current pace.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
