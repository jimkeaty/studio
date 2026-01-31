import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { AgentDashboardData } from '@/lib/types';
import { DollarSign, Phone, Users, FileText, CalendarCheck, BarChart as BarChartIcon } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, BarChart, Bar, XAxis, YAxis, CartesianGrid, ChartLegend, ChartLegendContent } from '@/components/ui/chart';

// Mock data for the agent dashboard. In a real app, this would be fetched from Firestore.
const dashboardData: AgentDashboardData = {
  userId: 'agent-1',
  leadIndicatorGrade: 'B',
  leadIndicatorPerformance: 99,
  isLeadIndicatorGracePeriod: false,
  incomeGrade: 'A',
  incomePerformance: 102,
  isIncomeGracePeriod: true, // Example of grace period
  kpis: {
    calls: { actual: 1250, target: 1500, performance: 83, grade: 'C' },
    engagements: { actual: 420, target: 500, performance: 84, grade: 'C' },
    appointmentsHeld: { actual: 45, target: 50, performance: 90, grade: 'B' },
    contractsWritten: { actual: 15, target: 12, performance: 125, grade: 'A' },
    closings: { actual: 9, target: 8, performance: 112, grade: 'A' },
  },
  netEarned: 27000,
  netPending: 12000,
  monthlyIncome: [
    { month: 'Jan', closed: 2000, pending: 1000 },
    { month: 'Feb', closed: 3000, pending: 500 },
    { month: 'Mar', closed: 2500, pending: 2000 },
    { month: 'Apr', closed: 4500, pending: 0 },
    { month: 'May', closed: 4000, pending: 3000 },
    { month: 'Jun', closed: 0, pending: 5000 },
    { month: 'Jul', closed: 0, pending: 5500 },
    { month: 'Aug', closed: 0, pending: 0 },
    { month: 'Sep', closed: 0, pending: 0 },
    { month: 'Oct', closed: 0, pending: 0 },
    { month: 'Nov', closed: 0, pending: 0 },
    { month: 'Dec', closed: 0, pending: 0 },
  ],
  forecast: {
    projectedClosings: 11,
    paceBasedNetIncome: 33000,
  },
};


export default function AgentDashboardPage() {
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
            <CardTitle>Overall Income Grade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-baseline">
                <p className="text-4xl font-bold">{dashboardData.incomeGrade}</p>
                <p className="text-muted-foreground">{dashboardData.incomePerformance}% of Goal Pace</p>
            </div>
            <Progress value={dashboardData.incomePerformance} aria-label={`${dashboardData.incomePerformance}% of goal pace`} />
             {dashboardData.isIncomeGracePeriod 
                ? <p className="text-sm text-muted-foreground pt-2">Grace Period — Income typically lags activity by ~60 days</p>
                : <p className="text-sm text-muted-foreground pt-2">Measures if you are on pace to hit your annual net income goal.</p>
            }
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard title="Calls" icon={Phone} {...dashboardData.kpis.calls} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Engagements" icon={Users} {...dashboardData.kpis.engagements} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Appts Held" icon={CalendarCheck} {...dashboardData.kpis.appointmentsHeld} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Contracts" icon={FileText} {...dashboardData.kpis.contractsWritten} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
        <KpiCard title="Closings" icon={DollarSign} {...dashboardData.kpis.closings} isGracePeriod={dashboardData.isLeadIndicatorGracePeriod} />
      </div>

       <Card>
        <CardHeader>
            <CardTitle>Agent Income by Month</CardTitle>
            <p className="text-sm text-muted-foreground">
                Showing closed (solid) and pending (lighter) income.
            </p>
        </CardHeader>
        <CardContent>
            <ChartContainer config={{
                closed: { label: 'Closed', color: 'hsl(var(--primary))' },
                pending: { label: 'Pending', color: 'hsl(var(--chart-2))' },
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
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Earned (Closed)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(dashboardData.netEarned)}
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
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(dashboardData.netPending)}
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
              ~ {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(dashboardData.forecast.paceBasedNetIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Estimated income based on current pace.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
