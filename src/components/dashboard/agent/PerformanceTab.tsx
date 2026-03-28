'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  DollarSign, TrendingUp, Target, Percent, Clock,
  ChevronDown, ChevronUp, Save, Users, BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
import { Badge } from '@/components/ui/badge';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle } from 'lucide-react';
import type { MonthlyData, CategoryMetrics } from '@/lib/types/brokerCommandMetrics';

// ── Formatters ──────────────────────────────────────────────────────────────

const formatCurrency = (amount: number | null | undefined, compact = false) => {
  if (amount === null || amount === undefined) return '—';
  if (compact) {
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
};
const formatNumber = (num: number | null | undefined) => num != null ? num.toLocaleString() : '—';

// ── Chart Configs ───────────────────────────────────────────────────────────

const incomeChartConfig: ChartConfig = {
  netIncome: { label: 'Net Income', color: 'hsl(var(--chart-1))' },
  pendingNetIncome: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  incomeGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareIncome: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
  projectedIncome: { label: 'Projected', color: 'hsl(38 92% 50%)' },
};

const volumeChartConfig: ChartConfig = {
  closedVolume: { label: 'Closed Volume', color: 'hsl(var(--chart-2))' },
  pendingVolume: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  volumeGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareVolume: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
  projectedVolume: { label: 'Projected', color: 'hsl(38 92% 50%)' },
};

const salesChartConfig: ChartConfig = {
  closedCount: { label: 'Closed Sales', color: 'hsl(var(--chart-1))' },
  pendingCount: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  salesCountGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareCount: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
  projectedCount: { label: 'Projected', color: 'hsl(38 92% 50%)' },
};

// ── Types ───────────────────────────────────────────────────────────────────

type AgentMetricsResponse = {
  overview: {
    year: number;
    totals: {
      totalGCI: number; grossMargin: number; grossMarginPct: number;
      transactionFees: number; closedVolume: number; pendingVolume: number;
      closedCount: number; pendingCount: number;
      netIncome: number; pendingNetIncome: number;
    };
    months: MonthlyData[];
    categoryBreakdown: { closed: CategoryMetrics; pending: CategoryMetrics };
  };
  prevYearStats?: {
    year: number; totalVolume: number; totalSales: number;
    totalGCI: number; totalGrossMargin: number;
    avgSalePrice: number; avgGCI: number; avgGrossMargin: number;
    avgMarginPct: number; avgCommissionPct: number;
    seasonality: { month: number; label: string; volumePct: number; salesPct: number; netIncome?: number }[];
  };
  availableYears?: number[];
  comparisonData?: { year: number; months: { grossMargin: number; closedVolume: number; closedCount: number; totalGCI: number; netIncome: number }[] } | null;
  agentView: {
    view: string;
    viewLabel: string;
    isTeamLeader: boolean;
    availableTeams: { teamId: string; teamName: string }[];
    monthlyNetIncome: number[];
    monthlyPendingNetIncome: number[];
    netIncome: number;
    pendingNetIncome: number;
    goalSegment: string;
  };
};

// ── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ title, value, subtitle, icon: Icon, highlight }: {
  title: string; value: string; subtitle: string;
  icon: React.ElementType; highlight?: boolean;
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

// ── Chart overlay controls (reusable) ──────────────────────────────────────

function ChartControls({ compareYear, setCompareYear, showGoals, setShowGoals, showProjected, setShowProjected, years, isCurrentYear }: {
  compareYear: number | null; setCompareYear: (v: number | null) => void;
  showGoals: boolean; setShowGoals: (v: boolean) => void;
  showProjected: boolean; setShowProjected: (v: boolean) => void;
  years: number[]; isCurrentYear: boolean;
}) {
  const toggleCls = (on: boolean, amber = false) =>
    `px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${on
      ? amber ? 'bg-amber-500 text-white border-amber-500' : 'bg-primary text-primary-foreground border-primary'
      : 'bg-background text-muted-foreground border-border hover:bg-muted'}`;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={compareYear ? String(compareYear) : 'none'} onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}>
        <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Year: None</SelectItem>
          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={() => setShowGoals(!showGoals)} className={toggleCls(showGoals)}>Goals</button>
      {isCurrentYear && (
        <button type="button" onClick={() => setShowProjected(!showProjected)} className={toggleCls(showProjected, true)}>📈 Projected</button>
      )}
    </div>
  );
}

// ── Goals Editor ────────────────────────────────────────────────────────────

function GoalsEditor({ months, year, goalSegment, onSaved }: {
  months: MonthlyData[]; year: number; goalSegment: string; onSaved: () => void;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [yearlyIncome, setYearlyIncome] = useState('');
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

  const distributeEvenly = () => {
    const total = parseFloat(yearlyIncome) || 0;
    if (total <= 0) return;
    const monthly = Math.round(total / 12);
    setGoals(prev => {
      const next = { ...prev };
      for (let m = 1; m <= 12; m++) {
        next[m] = { ...next[m], margin: String(monthly) };
      }
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      for (let m = 1; m <= 12; m++) {
        const g = goals[m];
        if (!g) continue;
        await fetch('/api/broker/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            year, month: m, segment: goalSegment,
            grossMarginGoal: g.margin ? parseFloat(g.margin) : null,
            volumeGoal: g.volume ? parseFloat(g.volume) : null,
            salesCountGoal: g.sales ? parseInt(g.sales, 10) : null,
          }),
        });
      }
      onSaved();
    } catch (err) { console.error('Failed to save goals:', err); }
    finally { setSaving(false); }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg">My Goals</CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Set your monthly income, volume, and sales goals.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Yearly Income Goal ($)</Label>
                <Input type="number" value={yearlyIncome} onChange={e => setYearlyIncome(e.target.value)}
                  placeholder="e.g. 120000" className="w-40" />
              </div>
              <Button variant="outline" size="sm" onClick={distributeEvenly}>Distribute Evenly</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Month</th>
                    <th className="text-left py-2 px-2 font-medium">Income Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Goal</th>
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
                          <Input type="number" value={g.margin}
                            onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], margin: e.target.value } }))}
                            placeholder="0" className="h-8 w-28" />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" value={g.volume}
                            onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], volume: e.target.value } }))}
                            placeholder="0" className="h-8 w-28" />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" value={g.sales}
                            onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], sales: e.target.value } }))}
                            placeholder="0" className="h-8 w-24" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Goals'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Main Performance Tab Component ──────────────────────────────────────────

export function PerformanceTab() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [view, setView] = useState<'personal' | 'team'>('personal');
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showProjected, setShowProjected] = useState(false);
  const [data, setData] = useState<AgentMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catYear, setCatYear] = useState<number>(new Date().getFullYear());
  const [catBreakdown, setCatBreakdown] = useState<{ closed: CategoryMetrics; pending: CategoryMetrics } | null>(null);
  const [catLoading, setCatLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(year), view });
      if (compareYear) params.set('compareYear', String(compareYear));
      const res = await fetch(`/api/agent/command-metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [user, year, view, compareYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset catYear when main year changes
  useEffect(() => { setCatYear(year); setCatBreakdown(null); }, [year]);

  // Fetch category breakdown for a different year
  useEffect(() => {
    if (!user || catYear === year) { setCatBreakdown(null); return; }
    setCatLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken(true);
        const params = new URLSearchParams({ year: String(catYear), view });
        const res = await fetch(`/api/agent/command-metrics?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setCatBreakdown(d.overview?.categoryBreakdown ?? null);
      } catch { /* silent */ }
      finally { setCatLoading(false); }
    })();
  }, [catYear, year, user, view]);

  if (userLoading || loading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!user) {
    return <Alert><AlertTitle>Sign In Required</AlertTitle><AlertDescription>Please sign in to view your performance.</AlertDescription></Alert>;
  }

  if (error) {
    return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  if (!data?.overview) return null;

  const { overview, agentView } = data;
  const { totals, months } = overview;
  const { monthlyNetIncome, monthlyPendingNetIncome, isTeamLeader, availableTeams } = agentView;

  // ── YTD / Current Month ────────────────────────────────────────────────────
  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYear = year === currentYear;
  const currentMonthIdx = today.getMonth(); // 0-indexed

  // ── Seasonality Projection ────────────────────────────────────────────────
  const projectedMonthData = (() => {
    if (!isCurrentYear) return null;
    const completedMonths = months.slice(0, currentMonthIdx + 1);
    const completedIncome = monthlyNetIncome.slice(0, currentMonthIdx + 1);

    const compute = (ytdActual: number, goalKey: keyof typeof months[0]) => {
      const yearlyGoalTotal = months.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0);
      const ytdGoalShare = yearlyGoalTotal > 0
        ? completedMonths.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0) / yearlyGoalTotal
        : (currentMonthIdx + 1) / 12;
      const projectedFullYear = ytdGoalShare > 0 ? ytdActual / ytdGoalShare : 0;
      return months.map((m, i) => {
        if (i <= currentMonthIdx) return null;
        const monthShare = yearlyGoalTotal > 0
          ? ((m[goalKey] as number) ?? 0) / yearlyGoalTotal
          : 1 / 12;
        return Math.round(projectedFullYear * monthShare);
      });
    };

    const ytdIncome = completedIncome.reduce((s, v) => s + v, 0);
    const ytdVolume = completedMonths.reduce((s, m) => s + m.closedVolume, 0);
    const ytdSales = completedMonths.reduce((s, m) => s + m.closedCount, 0);

    const fullYear = (ytdActual: number, goalKey: keyof typeof months[0]) => {
      const yearlyGoalTotal = months.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0);
      const share = yearlyGoalTotal > 0
        ? completedMonths.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0) / yearlyGoalTotal
        : (currentMonthIdx + 1) / 12;
      return share > 0 ? Math.round(ytdActual / share) : 0;
    };

    return {
      income: compute(ytdIncome, 'grossMarginGoal'),
      volume: compute(ytdVolume, 'volumeGoal'),
      sales: compute(ytdSales, 'salesCountGoal'),
      fullYearMargin: fullYear(ytdIncome, 'grossMarginGoal'),
      fullYearVolume: fullYear(ytdVolume, 'volumeGoal'),
      fullYearSales: fullYear(ytdSales, 'salesCountGoal'),
    };
  })();
  // isProjected removed — use showProjected state directly

  // Calculate averages
  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgCommPct = totals.closedVolume > 0 ? (totals.totalGCI / totals.closedVolume) * 100 : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;

  // Goal progress
  const yearlyIncomeGoal = months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const gradeVsGoal = yearlyIncomeGoal ? Math.round((totals.netIncome / yearlyIncomeGoal) * 100) : null;

  return (
    <div className="space-y-8">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              {view === 'team' ? agentView.viewLabel : 'My'} Performance
            </h2>
            {view === 'team' && <Badge variant="secondary"><Users className="h-3 w-3 mr-1" /> Team View</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {view === 'team'
              ? 'Team-level performance metrics and goals'
              : 'Your personal income, volume, and sales performance'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Team toggle for leaders */}
          {isTeamLeader && (
            <Tabs value={view} onValueChange={v => setView(v as 'personal' | 'team')}>
              <TabsList>
                <TabsTrigger value="personal"><BarChart3 className="h-4 w-4 mr-1" /> Personal</TabsTrigger>
                <TabsTrigger value="team"><Users className="h-4 w-4 mr-1" /> {availableTeams[0]?.teamName || 'Team'}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards — 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Net Income (Closed)"
          value={formatCurrency(totals.netIncome)}
          subtitle={`${formatNumber(totals.closedCount)} closings · ${gradeVsGoal ? `${gradeVsGoal}% of goal` : 'No goal set'}`}
          icon={DollarSign}
          highlight
        />
        <KPICard
          title="Pending Income"
          value={formatCurrency(totals.pendingNetIncome)}
          subtitle={`${formatNumber(totals.pendingCount)} pending deals`}
          icon={Clock}
        />
        <KPICard
          title="Closed Volume"
          value={formatCurrency(totals.closedVolume, true)}
          subtitle={`Pending: ${formatCurrency(totals.pendingVolume, true)}`}
          icon={TrendingUp}
        />
        <KPICard
          title="Total GCI"
          value={formatCurrency(totals.totalGCI)}
          subtitle={`Avg ${formatCurrency(avgNetPerDeal)}/deal net`}
          icon={Target}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Avg Sale Price"
          value={formatCurrency(avgSalePrice)}
          subtitle={data.prevYearStats ? `vs ${formatCurrency(data.prevYearStats.avgSalePrice)} last year` : '—'}
          icon={DollarSign}
        />
        <KPICard
          title="Avg Commission %"
          value={avgCommPct > 0 ? `${avgCommPct.toFixed(2)}%` : '—'}
          subtitle={data.prevYearStats ? `vs ${data.prevYearStats.avgCommissionPct.toFixed(2)}% last year` : '—'}
          icon={Percent}
        />
        <KPICard
          title="Total Sales"
          value={formatNumber(totals.closedCount)}
          subtitle={`+ ${formatNumber(totals.pendingCount)} pending`}
          icon={BarChart3}
        />
        <KPICard
          title={view === 'team' ? 'Team Margin %' : 'Your Take-Home %'}
          value={totals.totalGCI > 0 ? `${(100 - totals.grossMarginPct).toFixed(1)}%` : '—'}
          subtitle={`of GCI (broker keeps ${totals.grossMarginPct.toFixed(1)}%)`}
          icon={Percent}
        />
      </div>

      {/* ── CHART 1: Monthly Net Income ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Net Income</CardTitle>
              <CardDescription>Income after broker split — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear} showGoals={showGoals} setShowGoals={setShowGoals} showProjected={showProjected} setShowProjected={setShowProjected} years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={incomeChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                label: m.label,
                netIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyNetIncome[i] || 0),
                pendingNetIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyPendingNetIncome[i] || 0),
                incomeGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.grossMarginGoal) : null,
                compareIncome: compareYear ? (data.comparisonData?.months?.[i]?.netIncome ?? null) : null,
                projectedIncome: showProjected ? (projectedMonthData?.income[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => {
                const labels: Record<string, string> = {
                  netIncome: `${year} Income`, pendingNetIncome: 'Pending',
                  incomeGoal: 'Goal', compareIncome: `${compareYear} Income`, projectedIncome: 'Projected',
                };
                return [formatCurrency(Number(v)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="netIncome" fill="var(--color-netIncome)" radius={[4, 4, 0, 0]} name={`${year}`} />
              {compareYear && <Bar dataKey="compareIncome" fill="var(--color-compareIncome)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="incomeGoal" fill="var(--color-incomeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedIncome" fill="var(--color-projectedIncome)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
              <Bar dataKey="pendingNetIncome" fill="var(--color-pendingNetIncome)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
            </BarChart>
          </ChartContainer>
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const compIncome = data.comparisonData.months.reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const diff = totals.netIncome - compIncome;
                const pct = compIncome > 0 ? (diff / compIncome * 100) : 0;
                const compVol = data.comparisonData.months.reduce((s, m) => s + m.closedVolume, 0);
                const compSales = data.comparisonData.months.reduce((s, m) => s + m.closedCount, 0);
                return <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Income vs {compareYear}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Total Volume</span><p className="font-semibold">{formatCurrency(compVol, true)}</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Total Sales</span><p className="font-semibold">{formatNumber(compSales)}</p></div>
                </div>;
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 2: Monthly Volume ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Dollar Volume</CardTitle>
              <CardDescription>Closed and pending deal value — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear} showGoals={showGoals} setShowGoals={setShowGoals} showProjected={showProjected} setShowProjected={setShowProjected} years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeChartConfig} className="h-[300px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                closedVolume: isCurrentYear && i > currentMonthIdx ? null : m.closedVolume,
                pendingVolume: isCurrentYear && i > currentMonthIdx ? null : m.pendingVolume,
                volumeGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.volumeGoal) : null,
                compareVolume: compareYear ? (data.comparisonData?.months?.[i]?.closedVolume ?? null) : null,
                projectedVolume: showProjected ? (projectedMonthData?.volume[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => {
                const labels: Record<string, string> = {
                  closedVolume: `${year} Closed`, pendingVolume: 'Pending',
                  volumeGoal: 'Goal', compareVolume: `${compareYear} Volume`, projectedVolume: 'Projected',
                };
                return [formatCurrency(Number(v)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedVolume" fill="var(--color-closedVolume)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareVolume" fill="var(--color-compareVolume)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="volumeGoal" fill="var(--color-volumeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedVolume" fill="var(--color-projectedVolume)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
              <Bar dataKey="pendingVolume" fill="var(--color-pendingVolume)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
            </BarChart>
          </ChartContainer>
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const compVol = data.comparisonData.months.reduce((s, m) => s + m.closedVolume, 0);
                const diff = totals.closedVolume - compVol;
                const pct = compVol > 0 ? (diff / compVol * 100) : 0;
                const compSales = data.comparisonData.months.reduce((s, m) => s + m.closedCount, 0);
                return <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Volume vs {compareYear}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Volume</span><p className="font-semibold">{formatCurrency(compVol, true)}</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Total Sales</span><p className="font-semibold">{formatNumber(compSales)}</p></div>
                </div>;
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 3: Monthly Sales ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Number of Sales</CardTitle>
              <CardDescription>Closed and pending — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear} showGoals={showGoals} setShowGoals={setShowGoals} showProjected={showProjected} setShowProjected={setShowProjected} years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                closedCount: isCurrentYear && i > currentMonthIdx ? null : m.closedCount,
                pendingCount: isCurrentYear && i > currentMonthIdx ? null : m.pendingCount,
                salesCountGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.salesCountGoal) : null,
                compareCount: compareYear ? (data.comparisonData?.months?.[i]?.closedCount ?? null) : null,
                projectedCount: showProjected ? (projectedMonthData?.sales[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => {
                const labels: Record<string, string> = {
                  closedCount: `${year} Closed`, pendingCount: 'Pending',
                  salesCountGoal: 'Goal', compareCount: `${compareYear} Sales`, projectedCount: 'Projected',
                };
                return [formatNumber(Number(v)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedCount" fill="var(--color-closedCount)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareCount" fill="var(--color-compareCount)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="salesCountGoal" fill="var(--color-salesCountGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedCount" fill="var(--color-projectedCount)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
              <Bar dataKey="pendingCount" fill="var(--color-pendingCount)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
            </BarChart>
          </ChartContainer>
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const compSales = data.comparisonData.months.reduce((s, m) => s + m.closedCount, 0);
                const diff = totals.closedCount - compSales;
                const pct = compSales > 0 ? (diff / compSales * 100) : 0;
                const compVol = data.comparisonData.months.reduce((s, m) => s + m.closedVolume, 0);
                return <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Sales vs {compareYear}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{diff} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Total Volume</span><p className="font-semibold">{formatCurrency(compVol, true)}</p></div>
                  <div><span className="text-muted-foreground">{compareYear} Total Sales</span><p className="font-semibold">{formatNumber(compSales)}</p></div>
                </div>;
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Category Breakdown ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle>Category Breakdown — {catYear}</CardTitle>
            {(data.availableYears ?? []).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">View year:</span>
                <Select value={String(catYear)} onValueChange={v => setCatYear(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[year, ...(data.availableYears ?? [])].sort((a, b) => b - a).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {catLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading {catYear} data…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                ['Residential Sale', 'residential_sale'], ['Commercial Sale', 'commercial_sale'],
                ['Commercial Lease', 'commercial_lease'], ['Land', 'land'], ['Rental / Lease', 'rental'],
              ] as const).map(([label, key]) => {
                const activeCat = catBreakdown ?? overview.categoryBreakdown;
                const c = activeCat.closed[key];
                const p = activeCat.pending[key];
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
          )}
        </CardContent>
      </Card>

      {/* ── Goals Editor ───────────────────────────────────────────────────── */}
      <GoalsEditor
        months={months}
        year={year}
        goalSegment={agentView.goalSegment}
        onSaved={fetchData}
      />
    </div>
  );
}
