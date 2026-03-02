'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import type { AgentDashboardData, BusinessPlan } from '@/lib/types';
import { DollarSign, Target, TrendingUp, CheckCircle } from 'lucide-react';

const chartConfig = {
  closed: { label: 'Closed', color: 'hsl(var(--chart-1))' },
  pending: { label: 'Pending', color: 'hsl(var(--chart-2))' },
  goal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
};

const formatCurrency = (amount: number, compact = false) => {
  if (compact) {
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
};

const SummaryStat = ({ title, value, icon: Icon }: { title: string, value: string, icon: React.ElementType }) => (
    <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-sm font-semibold">{value}</p>
        </div>
    </div>
);

export function AgentIncomeByMonthCard({
  year,
  dashboard,
  plan,
}: {
  year: number;
  dashboard: AgentDashboardData | null;
  plan: BusinessPlan | null;
}) {
  const monthlyIncomeData = dashboard?.monthlyIncome || [];
  
  // Safe defaults from the dashboard data
  const ytdGoal = dashboard?.expectedYTDIncomeGoal ?? 0;
  const ytdClosed = dashboard?.totalClosedIncomeForYear ?? 0;
  const ytdPending = dashboard?.totalPendingIncomeForYear ?? 0;
  const ytdPotential = dashboard?.totalIncomeWithPipelineForYear ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income by Month ({year})</CardTitle>
        <CardDescription>Your closed and pending income vs. your monthly goal.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={monthlyIncomeData} margin={{ top: 20 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <YAxis tickFormatter={(value) => formatCurrency(value, true)} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="closed" stackId="a" fill="var(--color-closed)" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="closed" position="top" formatter={(val: number) => val > 0 ? formatCurrency(val, true) : ''} className="fill-foreground text-xs" />
            </Bar>
            <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" />
            <Line type="monotone" dataKey="goal" stroke="var(--color-goal)" strokeWidth={2} dot={false} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-4 border-t pt-6">
        <p className="font-semibold">Year-to-Date Summary</p>
        <div className="grid w-full grid-cols-2 lg:grid-cols-4 gap-4">
             <SummaryStat title="YTD Goal" value={formatCurrency(ytdGoal)} icon={Target} />
             <SummaryStat title="YTD Closed" value={formatCurrency(ytdClosed)} icon={DollarSign} />
             <SummaryStat title="YTD Pending" value={formatCurrency(ytdPending)} icon={TrendingUp} />
             <SummaryStat title="Total Potential" value={formatCurrency(ytdPotential)} icon={CheckCircle} />
        </div>
      </CardFooter>
    </Card>
  );
}
