'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  DollarSign, TrendingUp, Target, AlertCircle, Percent, Clock,
  ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend,
  ChartLegendContent, ChartConfig,
} from '@/components/ui/chart';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { BrokerCommandMetrics, MonthlyData } from '@/lib/types/brokerCommandMetrics';

// ── Formatters ──────────────────────────────────────────────────────────────

const formatCurrency = (amount: number | null | undefined, compact = false) => {
  if (amount === null || amount === undefined) return '—';
  if (compact) {
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number | null | undefined) =>
  num != null ? num.toLocaleString() : '—';

// ── Chart configs ───────────────────────────────────────────────────────────

const marginChartConfig: ChartConfig = {
  grossMargin: { label: 'Gross Margin', color: 'hsl(var(--chart-1))' },
  grossMarginGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
};

const volumeChartConfig: ChartConfig = {
  closedVolume: { label: 'Closed Volume', color: 'hsl(var(--chart-2))' },
  pendingVolume: { label: 'Pending Volume', color: 'hsl(var(--chart-4))' },
};

const salesChartConfig: ChartConfig = {
  closedCount: { label: 'Closed Sales', color: 'hsl(var(--chart-1))' },
  pendingCount: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  salesCountGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
};

// ── Skeleton ────────────────────────────────────────────────────────────────

const BrokerDashboardSkeleton = () => (
  <div className="space-y-8">
    <Skeleton className="h-12 w-1/2" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent>
        </Card>
      ))}
    </div>
    <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
  </div>
);

// ── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  title, value, subtitle, icon: Icon, highlight,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/50 bg-primary/5' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ── Goals Editor ────────────────────────────────────────────────────────────

function GoalsEditor({
  months, year, onSaved,
}: {
  months: MonthlyData[];
  year: number;
  onSaved: () => void;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const map: typeof goals = {};
    for (const m of months) {
      map[m.month] = {
        margin: m.grossMarginGoal != null ? String(m.grossMarginGoal) : '',
        volume: m.volumeGoal != null ? String(m.volumeGoal) : '',
        sales: m.salesCountGoal != null ? String(m.salesCountGoal) : '',
      };
    }
    setGoals(map);
  }, [months]);

  const update = (month: number, field: 'margin' | 'volume' | 'sales', val: string) => {
    setGoals(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      for (let m = 1; m <= 12; m++) {
        const g = goals[m];
        if (!g) continue;
        const marginVal = g.margin ? parseFloat(g.margin) : null;
        const volumeVal = g.volume ? parseFloat(g.volume) : null;
        const salesVal = g.sales ? parseInt(g.sales, 10) : null;

        await fetch('/api/broker/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            year,
            month: m,
            segment: 'TOTAL',
            grossMarginGoal: marginVal,
            volumeGoal: volumeVal,
            salesCountGoal: salesVal,
          }),
        });
      }
      onSaved();
    } catch (err) {
      console.error('Failed to save goals:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg">Monthly Goals</CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Set gross margin, volume, and sales count goals for each month.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Month</th>
                    <th className="text-left py-2 px-2 font-medium">Gross Margin Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Count Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{label}</td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.margin}
                            onChange={e => update(m, 'margin', e.target.value)}
                            placeholder="0"
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.volume}
                            onChange={e => update(m, 'volume', e.target.value)}
                            placeholder="0"
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.sales}
                            onChange={e => update(m, 'sales', e.target.value)}
                            placeholder="0"
                            className="h-8 w-28"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={save} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Goals'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Main Dashboard Component ────────────────────────────────────────────────

export function BrokerDashboardInner() {
  const { user } = useUser();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<BrokerCommandMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch(
        `/api/broker/command-metrics?year=${year}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const metrics: BrokerCommandMetrics = await res.json();
      setData(metrics);
    } catch (e: any) {
      console.error('[BrokerCommand] fetch error:', e);
      setError(e.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [user, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Guards ──────────────────────────────────────────────────────────────
  if (loading) return <BrokerDashboardSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data?.overview) return <BrokerDashboardSkeleton />;

  const { totals, months, categoryBreakdown } = data.overview;

  // Yearly goal totals (sum of monthly goals)
  const yearlyGrossMarginGoal = months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const gradeVsGoal = yearlyGrossMarginGoal
    ? Math.round((totals.grossMargin / yearlyGrossMarginGoal) * 100)
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Broker Command Center</h1>
          <p className="text-muted-foreground">
            Aggregated brokerage performance — all teams, all transaction types.
          </p>
        </div>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Commission Income"
          value={formatCurrency(totals.totalGCI)}
          subtitle={`From ${formatNumber(totals.closedCount)} closed transactions + ${formatCurrency(totals.transactionFees)} in fees`}
          icon={DollarSign}
        />
        <KPICard
          title="Actual Gross Margin"
          value={formatCurrency(totals.grossMargin)}
          subtitle="Company retained after paying agents"
          icon={TrendingUp}
          highlight
        />
        <KPICard
          title="Gross Margin %"
          value={totals.grossMarginPct > 0 ? `${totals.grossMarginPct.toFixed(1)}%` : '—'}
          subtitle={gradeVsGoal ? `${gradeVsGoal}% of yearly goal` : 'Set monthly goals below'}
          icon={Percent}
        />
        <KPICard
          title="Total Pending Volume"
          value={formatCurrency(totals.pendingVolume)}
          subtitle={`${formatNumber(totals.pendingCount)} deals in pipeline`}
          icon={Clock}
        />
      </div>

      {/* ── CHART 1: Gross Margin vs Goal ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Gross Margin vs Goal</CardTitle>
          <CardDescription>
            Company retained revenue after agent payouts — {year}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={marginChartConfig} className="h-[350px] w-full">
            <BarChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [formatCurrency(Number(value)), name === 'grossMargin' ? 'Gross Margin' : 'Goal']}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="grossMargin" fill="var(--color-grossMargin)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="grossMarginGoal" fill="var(--color-grossMarginGoal)" radius={[4, 4, 0, 0]} opacity={0.5} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── CHART 2: Total $ Volume ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Dollar Volume</CardTitle>
          <CardDescription>
            Closed and pending deal value — {year}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeChartConfig} className="h-[300px] w-full">
            <BarChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      name === 'closedVolume' ? 'Closed' : 'Pending',
                    ]}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedVolume" fill="var(--color-closedVolume)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pendingVolume" fill="var(--color-pendingVolume)" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── CHART 3: Number of Sales ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Number of Sales</CardTitle>
          <CardDescription>
            Closed and pending transaction counts — {year}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <BarChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      formatNumber(Number(value)),
                      name === 'closedCount' ? 'Closed' : name === 'pendingCount' ? 'Pending' : 'Goal',
                    ]}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedCount" fill="var(--color-closedCount)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pendingCount" fill="var(--color-pendingCount)" radius={[4, 4, 0, 0]} opacity={0.6} />
              <Bar dataKey="salesCountGoal" fill="var(--color-salesCountGoal)" radius={[4, 4, 0, 0]} opacity={0.4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── Category Breakdown ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown — {year}</CardTitle>
          <CardDescription>Closed vs pending by transaction type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {([
              ['Residential Sale', 'residential_sale'],
              ['Commercial Sale', 'commercial_sale'],
              ['Commercial Lease', 'commercial_lease'],
              ['Land', 'land'],
              ['Rental / Lease', 'rental'],
            ] as const).map(([label, key]) => {
              const c = categoryBreakdown.closed[key];
              const p = categoryBreakdown.pending[key];
              if (c.count === 0 && p.count === 0) return null;
              return (
                <div key={key} className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold">{label}</h4>
                  <div className="grid grid-cols-2 text-sm gap-1">
                    <span className="text-muted-foreground">Closed:</span>
                    <span className="font-medium">{c.count} ({formatCurrency(c.netRevenue)})</span>
                    <span className="text-muted-foreground">Pending:</span>
                    <span className="font-medium">{p.count} ({formatCurrency(p.netRevenue)})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Goals Editor ───────────────────────────────────────────────────── */}
      <GoalsEditor months={months} year={year} onSaved={fetchData} />
    </div>
  );
}
