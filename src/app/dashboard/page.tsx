import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { AgentDashboardData } from '@/lib/types';
import { DollarSign, Phone, Users, FileText, CalendarCheck, BarChart } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, LineChart, Line, XAxis, YAxis, CartesianGrid } from '@/components/ui/chart';

// Mock data for the agent dashboard. In a real app, this would be fetched from Firestore.
const dashboardData: AgentDashboardData = {
  userId: 'agent-1',
  grade: 'A',
  progress: 85, // Pace vs. Plan percentage
  kpis: {
    calls: { actual: 1250, target: 1500 },
    engagements: { actual: 420, target: 500 },
    appointmentsHeld: { actual: 45, target: 50 },
    contractsWritten: { actual: 15, target: 12 },
    closings: { actual: 9, target: 8 },
  },
  netEarned: 27000,
  netPending: 12000,
  forecast: {
    projectedClosings: 11,
    paceBasedNetIncome: 33000,
  },
};

const forecastChartData = [
  { month: 'Jan', income: 2000 },
  { month: 'Feb', income: 3000 },
  { month: 'Mar', income: 2500 },
  { month: 'Apr', income: 4500 },
  { month: 'May', income: 4000 },
  { month: 'Jun', income: 5000, projected: true },
  { month: 'Jul', income: 5500, projected: true },
];

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
            <CardTitle className="text-muted-foreground font-medium">Your Grade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-9xl font-bold text-primary">{dashboardData.grade}</p>
            <p className="text-muted-foreground mt-2">On pace to exceed your goals</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
           <CardHeader>
            <CardTitle>Pace to Quarterly Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-baseline">
                <p className="text-4xl font-bold">{dashboardData.progress}%</p>
                <p className="text-muted-foreground">Target: 100%</p>
            </div>
            <Progress value={dashboardData.progress} aria-label={`${dashboardData.progress}% complete`} />
            <p className="text-sm text-muted-foreground pt-2">
                {/* Grading logic would exist in a Cloud Function */}
                Week 1 is a grace period. Grading starts in Week 2 based on your pace vs. your business plan targets. Keep up the great work!
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard title="Calls" icon={Phone} actual={dashboardData.kpis.calls.actual} target={dashboardData.kpis.calls.target} />
        <KpiCard title="Engagements" icon={Users} actual={dashboardData.kpis.engagements.actual} target={dashboardData.kpis.engagements.target} />
        <KpiCard title="Appts Held" icon={CalendarCheck} actual={dashboardData.kpis.appointmentsHeld.actual} target={dashboardData.kpis.appointmentsHeld.target} />
        <KpiCard title="Contracts" icon={FileText} actual={dashboardData.kpis.contractsWritten.actual} target={dashboardData.kpis.contractsWritten.target} />
        <KpiCard title="Closings" icon={DollarSign} actual={dashboardData.kpis.closings.actual} target={dashboardData.kpis.closings.target} />
      </div>

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
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ~ {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(dashboardData.forecast.paceBasedNetIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Estimated income based on current pace.</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
            <CardTitle>Income Forecast</CardTitle>
            <p className="text-sm text-muted-foreground">
                {/* This forecast is based on a calculation, but could be enhanced by a GenAI model */}
                Projected income based on your appointment-to-closing conversion rate.
            </p>
        </CardHeader>
        <CardContent>
            <ChartContainer config={{}} className="h-[250px] w-full">
                <LineChart data={forecastChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line dataKey="income" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line dataKey="projected" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
            </ChartContainer>
        </CardContent>
      </Card>

    </div>
  );
}
