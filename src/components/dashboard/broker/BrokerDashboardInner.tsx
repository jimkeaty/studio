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
import { Badge } from '@/components/ui/badge';
import type { BrokerCommandMetrics, MonthlyData, PrevYearStats } from '@/lib/types/brokerCommandMetrics';

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

// ── Goals Editor with Yearly Goal + Seasonality Auto-Distribution ───────────

function GoalsEditor({
  months, year, prevYearStats, onSaved,
}: {
  months: MonthlyData[];
  year: number;
  prevYearStats?: PrevYearStats;
  onSaved: () => void;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyMargin, setYearlyMargin] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // Initialize from current goals
  useEffect(() => {
    const map: typeof goals = {};
    let totalMargin = 0;
    let totalVolume = 0;
    let totalSales = 0;
    for (const m of months) {
      map[m.month] = {
        margin: m.grossMarginGoal != null ? String(Math.round(m.grossMarginGoal)) : '',
        volume: m.volumeGoal != null ? String(Math.round(m.volumeGoal)) : '',
        sales: m.salesCountGoal != null ? String(Math.round(m.salesCountGoal)) : '',
      };
      totalMargin += m.grossMarginGoal ?? 0;
      totalVolume += m.volumeGoal ?? 0;
      totalSales += m.salesCountGoal ?? 0;
    }
    setGoals(map);
    if (totalVolume > 0) setYearlyVolume(String(Math.round(totalVolume)));
    if (totalSales > 0) setYearlySales(String(Math.round(totalSales)));
    if (totalMargin > 0) setYearlyMargin(String(Math.round(totalMargin)));
  }, [months]);

  const update = (month: number, field: 'margin' | 'volume' | 'sales', val: string) => {
    setGoals(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }));
  };

  // Auto-distribute yearly goal across months using previous year seasonality
  const distribute = () => {
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const margin = parseFloat(yearlyMargin) || 0;
    const seasonality = prevYearStats?.seasonality;

    const newGoals: typeof goals = {};
    for (let m = 1; m <= 12; m++) {
      // Use previous year seasonality % if available, otherwise even split (8.33%)
      const volPct = seasonality?.[m - 1]?.volumePct ?? 8.33;
      const salesPct = seasonality?.[m - 1]?.salesPct ?? 8.33;
      // Use sales seasonality for margin distribution (correlated with deal count)
      const marginPct = salesPct;

      newGoals[m] = {
        margin: margin > 0 ? String(Math.round(margin * (marginPct / 100))) : '',
        volume: vol > 0 ? String(Math.round(vol * (volPct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (salesPct / 100))) : '',
      };
    }
    setGoals(newGoals);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        const g = goals[m];
        if (!g) continue;
        promises.push(
          fetch('/api/broker/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              year,
              month: m,
              segment: 'TOTAL',
              grossMarginGoal: g.margin ? parseFloat(g.margin) : null,
              volumeGoal: g.volume ? parseFloat(g.volume) : null,
              salesCountGoal: g.sales ? parseInt(g.sales, 10) : null,
            }),
          })
        );
      }
      await Promise.all(promises);
      onSaved();
    } catch (err) {
      console.error('Failed to save goals:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasPrevData = prevYearStats && prevYearStats.totalSales > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" /> Goal Setting
              </CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>
            Enter yearly goals and auto-distribute using {hasPrevData ? `${prevYearStats.year}` : 'previous year'} seasonality, or manually set each month.
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Previous Year Reference Stats */}
            {hasPrevData && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  {prevYearStats.year} Reference Data
                  <Badge variant="secondary" className="text-xs">Previous Year</Badge>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Volume</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats.totalVolume, true)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Sales</span>
                    <p className="font-semibold">{formatNumber(prevYearStats.totalSales)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Sale Price</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats.avgSalePrice)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Gross Margin</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats.avgGrossMargin)}/deal ({prevYearStats.avgMarginPct}%)</p>
                  </div>
                </div>
              </div>
            )}

            {/* Yearly Goal Inputs */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-sm">Yearly Goals for {year}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="yearly-volume" className="text-xs">Total Volume Goal ($)</Label>
                  <Input
                    id="yearly-volume"
                    type="number"
                    value={yearlyVolume}
                    onChange={e => setYearlyVolume(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats.totalVolume, true)}` : 'e.g. 50000000'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yearly-sales" className="text-xs">Total Sales Goal (#)</Label>
                  <Input
                    id="yearly-sales"
                    type="number"
                    value={yearlySales}
                    onChange={e => setYearlySales(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${prevYearStats.totalSales}` : 'e.g. 200'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yearly-margin" className="text-xs">Total Gross Margin Goal ($)</Label>
                  <Input
                    id="yearly-margin"
                    type="number"
                    value={yearlyMargin}
                    onChange={e => setYearlyMargin(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats.totalGrossMargin, true)}` : 'e.g. 500000'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={distribute} disabled={!yearlyVolume && !yearlySales && !yearlyMargin}>
                  <Target className="mr-2 h-4 w-4" />
                  {hasPrevData ? `Auto-Distribute Using ${prevYearStats.year} Seasonality` : 'Distribute Evenly Across Months'}
                </Button>
                {hasPrevData && (
                  <span className="text-xs text-muted-foreground">
                    Uses each month&apos;s % of last year&apos;s total to weight goals
                  </span>
                )}
              </div>
            </div>

            {/* Monthly Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 font-medium">Month</th>
                    {hasPrevData && <th className="text-left py-2 px-2 font-medium text-muted-foreground">Seasonality %</th>}
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Goal (#)</th>
                    <th className="text-left py-2 px-2 font-medium">Margin Goal ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    const season = prevYearStats?.seasonality?.[m - 1];
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{label}</td>
                        {hasPrevData && (
                          <td className="py-2 px-2 text-muted-foreground">
                            {season?.salesPct.toFixed(1)}% sales / {season?.volumePct.toFixed(1)}% vol
                          </td>
                        )}
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
                            className="h-8 w-24"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.margin}
                            onChange={e => update(m, 'margin', e.target.value)}
                            placeholder="0"
                            className="h-8 w-32"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-2">Total</td>
                    {hasPrevData && <td className="py-2 px-2">100%</td>}
                    <td className="py-2 px-2">
                      {formatCurrency(Object.values(goals).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0), true)}
                    </td>
                    <td className="py-2 px-2">
                      {Object.values(goals).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0)}
                    </td>
                    <td className="py-2 px-2">
                      {formatCurrency(Object.values(goals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0), true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3">
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
      <GoalsEditor months={months} year={year} prevYearStats={data.prevYearStats} onSaved={fetchData} />
    </div>
  );
}
