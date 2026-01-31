'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, DollarSign, Percent, Home, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Simulating the server-side rollup document for a given year
const scoreboardData = {
  year: 2024,
  workdaysElapsedYTD: 125,
  totalWorkdaysInYear: 251,
  ytdGoalPct: 125 / 251,
  segments: {
    TOTAL: {
      actual: { salesCount: 120, volume: 48000000, totalGCI: 1440000, agentPayout: 1008000, brokerProfit: 432000, profitMarginPct: 0.3, avgSalePrice: 400000 },
      goals: { salesYTDGoal: 250 * (125/251), volumeYTDGoal: 100000000 * (125/251), agentPayoutYTDGoal: 2100000 * (125/251), brokerProfitYTDGoal: 900000 * (125/251) },
    },
    CGL: {
      actual: { salesCount: 80, volume: 36000000, totalGCI: 1080000, agentPayout: 756000, brokerProfit: 324000, profitMarginPct: 0.3, avgSalePrice: 450000 },
      goals: { salesYTDGoal: 150 * (125/251), volumeYTDGoal: 60000000 * (125/251), agentPayoutYTDGoal: 1260000 * (125/251), brokerProfitYTDGoal: 540000 * (125/251) },
    },
    SGL: {
      actual: { salesCount: 40, volume: 12000000, totalGCI: 360000, agentPayout: 252000, brokerProfit: 108000, profitMarginPct: 0.3, avgSalePrice: 300000 },
      goals: { salesYTDGoal: 100 * (125/251), volumeYTDGoal: 40000000 * (125/251), agentPayoutYTDGoal: 840000 * (125/251), brokerProfitYTDGoal: 360000 * (125/251) },
    },
  },
};

// Compute vsGoal within the data for easier access
Object.values(scoreboardData.segments).forEach((segment: any) => {
  segment.vsGoal = {
    salesDelta: segment.actual.salesCount - segment.goals.salesYTDGoal,
    salesPct: segment.goals.salesYTDGoal > 0 ? segment.actual.salesCount / segment.goals.salesYTDGoal : null,
    volumeDelta: segment.actual.volume - segment.goals.volumeYTDGoal,
    volumePct: segment.goals.volumeYTDGoal > 0 ? segment.actual.volume / segment.goals.volumeYTDGoal : null,
    agentPayoutDelta: segment.actual.agentPayout - segment.goals.agentPayoutYTDGoal,
    agentPayoutPct: segment.goals.agentPayoutYTDGoal > 0 ? segment.actual.agentPayout / segment.goals.agentPayoutYTDGoal : null,
    brokerProfitDelta: segment.actual.brokerProfit - segment.goals.brokerProfitYTDGoal,
    brokerProfitPct: segment.goals.brokerProfitYTDGoal > 0 ? segment.actual.brokerProfit / segment.goals.brokerProfitYTDGoal : null,
  };
});

const formatCurrency = (amount: number, compact = false) => {
  if (compact) {
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
};
const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(Math.round(num));
const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 0 }).format(value);
};


const ScoreboardMetricCard = ({ title, icon: Icon, actual, goal, vsGoal, formatAs = 'number' }: { title: string, icon: React.ElementType, actual: number, goal: number, vsGoal: { delta: number, pct: number | null }, formatAs?: 'number' | 'currency' }) => {
    const formatter = formatAs === 'currency' ? (val: number) => formatCurrency(val, true) : formatNumber;
    const progress = vsGoal.pct !== null ? Math.min(vsGoal.pct * 100, 100) : 0;
    const isAhead = vsGoal.delta >= 0;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{formatter(actual)}</div>
                <p className="text-xs text-muted-foreground">
                    YTD Goal: {formatter(goal)}
                </p>
                <Progress value={progress} className="mt-4 h-2" />
                <div className={cn("text-sm font-medium mt-2 flex items-center flex-wrap", isAhead ? 'text-green-600' : 'text-red-600')}>
                    <TrendingUp className={cn("mr-1 h-4 w-4", !isAhead && 'rotate-180 transform')} />
                    <span>{formatPercent(vsGoal.pct)} of goal</span>
                    <span className="text-muted-foreground mx-1">|</span>
                    <span>{formatter(vsGoal.delta)} {isAhead ? 'ahead' : 'behind'}</span>
                </div>
            </CardContent>
        </Card>
    );
};

const StatCard = ({ title, icon: Icon, value, description }: { title: string, icon: React.ElementType, value: string, description?: string }) => (
    <Card>
        <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span>{title}</span>
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="text-3xl font-bold">{value}</div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </CardContent>
    </Card>
);

const ScoreboardSegment = ({ segment }: { segment: any }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ScoreboardMetricCard title="Sales" icon={TrendingUp} actual={segment.actual.salesCount} goal={segment.goals.salesYTDGoal} vsGoal={{delta: segment.vsGoal.salesDelta, pct: segment.vsGoal.salesPct}} formatAs="number" />
        <ScoreboardMetricCard title="Volume" icon={DollarSign} actual={segment.actual.volume} goal={segment.goals.volumeYTDGoal} vsGoal={{delta: segment.vsGoal.volumeDelta, pct: segment.vsGoal.volumePct}} formatAs="currency" />
        <ScoreboardMetricCard title="Broker Profit" icon={DollarSign} actual={segment.actual.brokerProfit} goal={segment.goals.brokerProfitYTDGoal} vsGoal={{delta: segment.vsGoal.brokerProfitDelta, pct: segment.vsGoal.brokerProfitPct}} formatAs="currency" />
        <ScoreboardMetricCard title="Paid to Agents" icon={Users} actual={segment.actual.agentPayout} goal={segment.goals.agentPayoutYTDGoal} vsGoal={{delta: segment.vsGoal.agentPayoutDelta, pct: segment.vsGoal.agentPayoutPct}} formatAs="currency" />
        <StatCard title="Profit Margin" icon={Percent} value={formatPercent(segment.actual.profitMarginPct)} description="Broker Profit / Total GCI" />
        <StatCard title="Avg. Sale Price" icon={Home} value={formatCurrency(segment.actual.avgSalePrice)} description="Total Volume / Sales Count" />
    </div>
);


export function Scoreboard() {
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    // In a real app, we would fetch data for the selected year. Here we just use the same mock data.
  const data = scoreboardData;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>YTD Scoreboard</CardTitle>
            <CardDescription>
              Brokerage performance vs. workday-paced goals for {selectedYear}.
            </CardDescription>
          </div>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {[...Array(5)].map((_, i) => {
                const year = new Date().getFullYear() - i;
                return <SelectItem key={year} value={String(year)}>{year}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="TOTAL" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="TOTAL">Total</TabsTrigger>
            <TabsTrigger value="CGL">CGL</TabsTrigger>
            <TabsTrigger value="SGL">SGL</TabsTrigger>
          </TabsList>
          <TabsContent value="TOTAL" className="mt-6">
            <ScoreboardSegment segment={data.segments.TOTAL} />
          </TabsContent>
          <TabsContent value="CGL" className="mt-6">
            <ScoreboardSegment segment={data.segments.CGL} />
          </TabsContent>
          <TabsContent value="SGL" className="mt-6">
            <ScoreboardSegment segment={data.segments.SGL} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}