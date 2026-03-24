'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics, Transaction, Opportunity } from '@/lib/types';
import type { MonthlyData, CategoryMetrics } from '@/lib/types/brokerCommandMetrics';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { YtdValueMetricsCard } from '@/components/dashboard/YtdValueMetricsCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend,
  ChartLegendContent, ChartConfig,
} from '@/components/ui/chart';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertTriangle, CalendarDays, DollarSign, Target, TrendingUp,
  ArrowUpRight, ArrowDownRight, MapPin, FileCheck2, Clock,
  BarChart3, Users, Percent, Save, ChevronDown, ChevronUp,
} from 'lucide-react';
import { RecruitingIncentiveTracker } from '@/components/dashboard/agent/RecruitingIncentiveTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { differenceInDays, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';

// ── Skeleton ────────────────────────────────────────────────────────────────

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
    </div>
    <Skeleton className="h-80" />
    <div className="grid gap-6 md:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
  </div>
);

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}
const fmtCurrencyCompact = (amount: number | null | undefined, compact = false) => {
  if (amount === null || amount === undefined) return '—';
  if (compact) {
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};
function fmtNum(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
const fmtNumNull = (num: number | null | undefined) => num != null ? num.toLocaleString() : '—';
function gradeTone(g: string) { return g === 'A' ? 'text-green-600' : g === 'B' ? 'text-primary' : g === 'C' ? 'text-yellow-600' : g === 'D' ? 'text-orange-600' : 'text-red-600'; }
function gradeBg(g: string) { return g === 'A' ? 'bg-green-500/10 border-green-500/30' : g === 'B' ? 'bg-primary/5 border-primary/30' : g === 'C' ? 'bg-yellow-500/10 border-yellow-500/30' : g === 'D' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-red-500/10 border-red-500/30'; }
const formatCurrencyLocal = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
const getTimelineBucket = (dateStr?: string | null): string => { if (!dateStr) return '—'; try { const days = differenceInDays(parseISO(dateStr), new Date()); if (days < 0) return 'Past'; if (days < 30) return 'Under 30 days'; if (days < 60) return '30–60 days'; if (days < 90) return '60–90 days'; return '90+ days'; } catch { return '—'; } };
const formatDate = (dateStr?: string | null) => { if (!dateStr) return '—'; try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; } };
const txTypeLabel: Record<string, string> = { residential_sale: 'Residential', rental: 'Rental', commercial_lease: 'Commercial Lease', commercial_sale: 'Commercial Sale' };

// ── Chart Configs ───────────────────────────────────────────────────────────

const incomeChartConfig: ChartConfig = {
  netIncome: { label: 'Net Income', color: 'hsl(var(--chart-1))' },
  pendingNetIncome: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  incomeGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareIncome: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
};
const volumeChartConfig: ChartConfig = {
  closedVolume: { label: 'Closed Volume', color: 'hsl(var(--chart-2))' },
  pendingVolume: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  volumeGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareVolume: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
};
const salesChartConfig: ChartConfig = {
  closedCount: { label: 'Closed Sales', color: 'hsl(var(--chart-1))' },
  pendingCount: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  salesCountGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareCount: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
};

// ── Performance types ───────────────────────────────────────────────────────

type AgentMetricsResponse = {
  overview: {
    year: number;
    totals: { totalGCI: number; grossMargin: number; grossMarginPct: number; transactionFees: number; closedVolume: number; pendingVolume: number; closedCount: number; pendingCount: number; netIncome: number; pendingNetIncome: number; };
    months: MonthlyData[];
    categoryBreakdown: { closed: CategoryMetrics; pending: CategoryMetrics };
  };
  prevYearStats?: { year: number; totalVolume: number; totalSales: number; totalGCI: number; totalGrossMargin: number; avgSalePrice: number; avgGCI: number; avgGrossMargin: number; avgMarginPct: number; avgCommissionPct: number; seasonality: { month: number; label: string; volumePct: number; salesPct: number; netIncome?: number }[]; };
  availableYears?: number[];
  comparisonData?: { year: number; months: { grossMargin: number; closedVolume: number; closedCount: number; totalGCI: number; netIncome: number }[] } | null;
  agentView: { view: string; viewLabel: string; isTeamLeader: boolean; availableTeams: { teamId: string; teamName: string }[]; monthlyNetIncome: number[]; monthlyPendingNetIncome: number[]; netIncome: number; pendingNetIncome: number; goalSegment: string; };
};

// ── Compare Selector ────────────────────────────────────────────────────────

function CompareSelector({ value, onChange, years }: { value: number | null; onChange: (v: number | null) => void; years: number[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Compare to:</span>
      <Select value={value ? String(value) : 'none'} onValueChange={v => onChange(v === 'none' ? null : Number(v))}>
        <SelectTrigger className="w-[120px]"><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Goals Editor ────────────────────────────────────────────────────────────

function GoalsEditor({ months, year, goalSegment, onSaved }: { months: MonthlyData[]; year: number; goalSegment: string; onSaved: () => void }) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [yearlyIncome, setYearlyIncome] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const map: typeof goals = {};
    for (const m of months) { map[m.month] = { margin: m.grossMarginGoal != null ? String(m.grossMarginGoal) : '', volume: m.volumeGoal != null ? String(m.volumeGoal) : '', sales: m.salesCountGoal != null ? String(m.salesCountGoal) : '' }; }
    setGoals(map);
  }, [months]);

  const distributeEvenly = () => { const total = parseFloat(yearlyIncome) || 0; if (total <= 0) return; const monthly = Math.round(total / 12); setGoals(prev => { const next = { ...prev }; for (let m = 1; m <= 12; m++) { next[m] = { ...next[m], margin: String(monthly) }; } return next; }); };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      for (let m = 1; m <= 12; m++) { const g = goals[m]; if (!g) continue; await fetch('/api/broker/goals', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ year, month: m, segment: goalSegment, grossMarginGoal: g.margin ? parseFloat(g.margin) : null, volumeGoal: g.volume ? parseFloat(g.volume) : null, salesCountGoal: g.sales ? parseInt(g.sales, 10) : null }) }); }
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
              <CardTitle className="text-lg">Set Monthly Goals</CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Set your monthly income, volume, and sales goals.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1"><Label className="text-xs">Yearly Income Goal ($)</Label><Input type="number" value={yearlyIncome} onChange={e => setYearlyIncome(e.target.value)} placeholder="e.g. 120000" className="w-40" /></div>
              <Button variant="outline" size="sm" onClick={distributeEvenly}>Distribute Evenly</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2 pr-4 font-medium">Month</th><th className="text-left py-2 px-2 font-medium">Income Goal ($)</th><th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th><th className="text-left py-2 px-2 font-medium">Sales Goal</th></tr></thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    return (<tr key={m} className="border-b last:border-0"><td className="py-2 pr-4 font-medium">{label}</td><td className="py-2 px-2"><Input type="number" value={g.margin} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], margin: e.target.value } }))} placeholder="0" className="h-8 w-28" /></td><td className="py-2 px-2"><Input type="number" value={g.volume} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], volume: e.target.value } }))} placeholder="0" className="h-8 w-28" /></td><td className="py-2 px-2"><Input type="number" value={g.sales} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], sales: e.target.value } }))} placeholder="0" className="h-8 w-24" /></td></tr>);
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end"><Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Goals'}</Button></div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();

  // Overview data
  const [data, setData] = useState<{ dashboard: AgentDashboardData | null; plan: BusinessPlan | null; ytdMetrics: YtdValueMetrics | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

  // Performance data
  const [perfYear, setPerfYear] = useState<number>(new Date().getFullYear());
  const [perfView, setPerfView] = useState<'personal' | 'team'>('personal');
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [perfData, setPerfData] = useState<AgentMetricsResponse | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);

  const year = new Date().getFullYear();

  // Load overview dashboard
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true); setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/dashboard?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to load dashboard'); }
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || 'API error');
        setData(d);
      } catch (err: any) { setError(err.message); console.error(err); }
      finally { setLoading(false); }
    };
    if (!userLoading && user) load();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, year]);

  // Load pipeline
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/agent/pipeline?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (d.ok) { setTransactions(d.transactions ?? []); setOpportunities(d.opportunities ?? []); }
      } catch (err) { console.error('[pipeline]', err); }
    };
    if (!userLoading && user) load();
  }, [user, userLoading, year]);

  // Load performance data
  const fetchPerf = useCallback(async () => {
    if (!user) return;
    setPerfLoading(true);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(perfYear), view: perfView });
      if (compareYear) params.set('compareYear', String(compareYear));
      const res = await fetch(`/api/agent/command-metrics?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || `Request failed (${res.status})`); }
      setPerfData(await res.json());
    } catch (e: any) { console.error('[perf]', e); }
    finally { setPerfLoading(false); }
  }, [user, perfYear, perfView, compareYear]);

  useEffect(() => { fetchPerf(); }, [fetchPerf]);

  if (userLoading) return <DashboardSkeleton />;
  if (!user) return <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Sign In Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PERFORMANCE SECTION — at the very top
         ════════════════════════════════════════════════════════════════════ */}
      <PerformanceSection
        data={perfData}
        loading={perfLoading}
        year={perfYear}
        setYear={setPerfYear}
        view={perfView}
        setView={setPerfView}
        compareYear={compareYear}
        setCompareYear={setCompareYear}
        onGoalsSaved={fetchPerf}
      />

      {/* ════════════════════════════════════════════════════════════════════
          OVERVIEW SECTION — grades, key numbers, pipeline
         ════════════════════════════════════════════════════════════════════ */}
      {loading ? <DashboardSkeleton /> : error ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : !data?.dashboard ? (
        <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No Data</AlertTitle><AlertDescription>Dashboard data for {year} not found. Check your business plan or contact support.</AlertDescription></Alert>
      ) : (
        <OverviewSection data={data} year={year} transactions={transactions} opportunities={opportunities} />
      )}
    </div>
  );
}

// ── Performance Section ─────────────────────────────────────────────────────

function PerformanceSection({ data, loading, year, setYear, view, setView, compareYear, setCompareYear, onGoalsSaved }: {
  data: AgentMetricsResponse | null; loading: boolean;
  year: number; setYear: (y: number) => void;
  view: 'personal' | 'team'; setView: (v: 'personal' | 'team') => void;
  compareYear: number | null; setCompareYear: (y: number | null) => void;
  onGoalsSaved: () => void;
}) {
  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>;
  if (!data?.overview) return null;

  const { overview, agentView } = data;
  const { totals, months } = overview;
  const { monthlyNetIncome, monthlyPendingNetIncome, isTeamLeader, availableTeams } = agentView;

  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgCommPct = totals.closedVolume > 0 ? (totals.totalGCI / totals.closedVolume) * 100 : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;
  const yearlyIncomeGoal = months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const gradeVsGoal = yearlyIncomeGoal ? Math.round((totals.netIncome / yearlyIncomeGoal) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{view === 'team' ? agentView.viewLabel : 'My'} Performance</h2>
          {view === 'team' && <Badge variant="secondary"><Users className="h-3 w-3 mr-1" /> Team</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {isTeamLeader && (
            <Tabs value={view} onValueChange={v => setView(v as 'personal' | 'team')}>
              <TabsList><TabsTrigger value="personal"><BarChart3 className="h-4 w-4 mr-1" /> Personal</TabsTrigger><TabsTrigger value="team"><Users className="h-4 w-4 mr-1" /> {availableTeams[0]?.teamName || 'Team'}</TabsTrigger></TabsList>
            </Tabs>
          )}
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PerfKPI title="Net Income (Closed)" value={fmtCurrencyCompact(totals.netIncome)} subtitle={`${fmtNumNull(totals.closedCount)} closings · ${gradeVsGoal ? `${gradeVsGoal}% of goal` : 'No goal set'}`} icon={DollarSign} highlight />
        <PerfKPI title="Pending Income" value={fmtCurrencyCompact(totals.pendingNetIncome)} subtitle={`${fmtNumNull(totals.pendingCount)} pending deals`} icon={Clock} />
        <PerfKPI title="Closed Volume" value={fmtCurrencyCompact(totals.closedVolume, true)} subtitle={`Pending: ${fmtCurrencyCompact(totals.pendingVolume, true)}`} icon={TrendingUp} />
        <PerfKPI title="Avg Sale Price" value={fmtCurrencyCompact(avgSalePrice)} subtitle={data.prevYearStats ? `vs ${fmtCurrencyCompact(data.prevYearStats.avgSalePrice)} last year` : '—'} icon={DollarSign} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PerfKPI title="Total GCI" value={fmtCurrencyCompact(totals.totalGCI)} subtitle={`Avg ${fmtCurrencyCompact(avgNetPerDeal)}/deal net`} icon={Target} />
        <PerfKPI title="Avg Commission %" value={avgCommPct > 0 ? `${avgCommPct.toFixed(2)}%` : '—'} subtitle={data.prevYearStats ? `vs ${data.prevYearStats.avgCommissionPct.toFixed(2)}% last year` : '—'} icon={Percent} />
        <PerfKPI title="Total Sales" value={fmtNumNull(totals.closedCount)} subtitle={`+ ${fmtNumNull(totals.pendingCount)} pending`} icon={BarChart3} />
        <PerfKPI title={view === 'team' ? 'Team Margin %' : 'Your Take-Home %'} value={totals.totalGCI > 0 ? `${(100 - totals.grossMarginPct).toFixed(1)}%` : '—'} subtitle={`of GCI (broker keeps ${totals.grossMarginPct.toFixed(1)}%)`} icon={Percent} />
      </div>

      {/* CHART 1: Monthly Net Income */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Net Income</CardTitle><CardDescription>Income after broker split — {year}{compareYear ? ` vs ${compareYear}` : ''}</CardDescription></div>
            <CompareSelector value={compareYear} onChange={setCompareYear} years={data.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={incomeChartConfig} className="h-[350px] w-full">
            <BarChart data={months.map((m, i) => ({ label: m.label, netIncome: monthlyNetIncome[i] || 0, pendingNetIncome: monthlyPendingNetIncome[i] || 0, incomeGoal: m.grossMarginGoal, compareIncome: data.comparisonData?.months?.[i]?.netIncome ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => fmtCurrencyCompact(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { netIncome: `${year} Income`, pendingNetIncome: 'Pending', incomeGoal: 'Goal', compareIncome: `${compareYear ?? ''} Income` }; return [fmtCurrencyCompact(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="netIncome" fill="var(--color-netIncome)" radius={[4, 4, 0, 0]} name={`${year}`} />
              {compareYear && <Bar dataKey="compareIncome" fill="var(--color-compareIncome)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingNetIncome" fill="var(--color-pendingNetIncome)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              <Bar dataKey="incomeGoal" fill="var(--color-incomeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* CHART 2: Monthly Volume */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Dollar Volume</CardTitle><CardDescription>Closed and pending — {year}{compareYear ? ` vs ${compareYear}` : ''}</CardDescription></div>
            <CompareSelector value={compareYear} onChange={setCompareYear} years={data.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({ ...m, compareVolume: data.comparisonData?.months?.[i]?.closedVolume ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => fmtCurrencyCompact(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { closedVolume: `${year} Closed`, pendingVolume: 'Pending', volumeGoal: 'Goal', compareVolume: `${compareYear ?? ''} Volume` }; return [fmtCurrencyCompact(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedVolume" fill="var(--color-closedVolume)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareVolume" fill="var(--color-compareVolume)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingVolume" fill="var(--color-pendingVolume)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              <Bar dataKey="volumeGoal" fill="var(--color-volumeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* CHART 3: Monthly Sales */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Number of Sales</CardTitle><CardDescription>Closed and pending — {year}{compareYear ? ` vs ${compareYear}` : ''}</CardDescription></div>
            <CompareSelector value={compareYear} onChange={setCompareYear} years={data.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({ ...m, compareCount: data.comparisonData?.months?.[i]?.closedCount ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { closedCount: `${year} Closed`, pendingCount: 'Pending', salesCountGoal: 'Goal', compareCount: `${compareYear ?? ''} Sales` }; return [fmtNumNull(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedCount" fill="var(--color-closedCount)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareCount" fill="var(--color-compareCount)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingCount" fill="var(--color-pendingCount)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              <Bar dataKey="salesCountGoal" fill="var(--color-salesCountGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Goals Editor */}
      <GoalsEditor months={months} year={year} goalSegment={agentView.goalSegment} onSaved={onGoalsSaved} />
    </div>
  );
}

function PerfKPI({ title, value, subtitle, icon: Icon, highlight }: { title: string; value: string; subtitle: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/50 bg-primary/5' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground mt-1">{subtitle}</p></CardContent>
    </Card>
  );
}

// ── Overview Section ────────────────────────────────────────────────────────

function OverviewSection({ data, year, transactions, opportunities }: {
  data: { dashboard: AgentDashboardData; plan: BusinessPlan | null; ytdMetrics: YtdValueMetrics | null };
  year: number; transactions: Transaction[]; opportunities: Opportunity[];
}) {
  const { dashboard, plan, ytdMetrics } = data;
  const incomeDelta = dashboard.incomeDeltaToGoal ?? 0;
  const incomeDeltaPct = dashboard.expectedYTDIncomeGoal > 0 ? Math.round((incomeDelta / dashboard.expectedYTDIncomeGoal) * 100) : 0;
  const pipelinePct = dashboard.expectedYTDIncomeGoal > 0 ? Math.round((dashboard.ytdTotalPotential / dashboard.expectedYTDIncomeGoal) * 100) : 0;
  const filteredKpis = Object.entries(dashboard.kpis || {}).filter(([key]) => key !== 'engagements');

  const effectiveStartLabel = !dashboard.effectiveStartDate ? 'Jan 1' : (() => { const d = new Date(`${dashboard.effectiveStartDate}T00:00:00`); if (Number.isNaN(d.getTime())) return dashboard.effectiveStartDate; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })();

  return (
    <div className="space-y-8">
      {/* Key Numbers */}
      <KeyNumbersCard dashboard={dashboard} year={year} />

      {/* Hero Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <HeroCard title="Net Income YTD" grade={dashboard.incomeGrade} primary={fmtCurrency(dashboard.netEarned)} secondary={incomeDelta >= 0 ? `${Math.abs(incomeDeltaPct)}% ahead of pace (${fmtCurrency(dashboard.expectedYTDIncomeGoal)} goal)` : `${Math.abs(incomeDeltaPct)}% behind pace (${fmtCurrency(dashboard.expectedYTDIncomeGoal)} goal)`} icon={DollarSign} />
        <HeroCard title="Projected with Pending" grade={dashboard.pipelineAdjustedIncome.grade} primary={fmtCurrency(dashboard.ytdTotalPotential)} secondary={`${fmtCurrency(dashboard.netPending)} pending · ${pipelinePct}% of YTD goal if pending close`} icon={TrendingUp} />
        <HeroCard title="Engagements YTD" grade={dashboard.leadIndicatorGrade} primary={`${fmtNum(dashboard.kpis.engagements.actual)} / ${fmtNum(dashboard.engagementGoalToDate ?? dashboard.kpis.engagements.target)}`} secondary={`${dashboard.leadIndicatorPerformance}% of engagement goal-to-date`} icon={Target} />
      </div>

      {/* Deals & Volume + Activity Tracker + Pacing */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DealsVolumeCard dashboard={dashboard} />
        <ActivityTrackerCard dashboard={dashboard} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pacing & Goals</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Effective Start</span><span className="font-semibold text-sm">{effectiveStartLabel}</span></div>
            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Annual Income Goal</span><span className="font-semibold text-sm">{fmtCurrency(dashboard.annualIncomeGoal ?? 0)}</span></div>
            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Net Earned</span><span className="font-semibold text-sm">{fmtCurrency(dashboard.netEarned)}</span></div>
            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Net Pending</span><span className="font-semibold text-sm">{fmtCurrency(dashboard.netPending)}</span></div>
            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Total Potential</span><span className="font-bold text-sm text-primary">{fmtCurrency(dashboard.ytdTotalPotential)}</span></div>
            <div className="border-t pt-2 flex justify-between items-center"><span className="text-sm text-muted-foreground">Pace Delta</span><span className={cn('font-semibold text-sm', incomeDelta >= 0 ? 'text-green-600' : 'text-red-600')}>{incomeDelta >= 0 ? '+' : ''}{fmtCurrency(incomeDelta)}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Grades */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {filteredKpis.map(([key, kpi]) => (
          <KpiCard key={key} title={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} actual={kpi.actual} target={kpi.target} performance={kpi.performance} grade={kpi.grade} isGracePeriod={dashboard.isLeadIndicatorGracePeriod} />
        ))}
      </div>

      {/* YTD Value Metrics */}
      <YtdValueMetricsCard metrics={ytdMetrics} loading={false} error={null} />

      {/* Pipeline Tables */}
      <OpportunitiesTable opportunities={opportunities} />
      <PendingTable transactions={transactions} />
      <ClosedTable transactions={transactions} year={year} />

      <RecruitingIncentiveTracker />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HeroCard({ title, grade, primary, secondary, icon: Icon }: { title: string; grade: string; primary: string; secondary: string; icon: React.ElementType }) {
  return (<Card className={cn('relative overflow-hidden', gradeBg(grade))}><CardHeader className="flex flex-row items-center justify-between pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent className="space-y-1"><div className="flex items-baseline gap-3"><span className={cn('text-4xl font-extrabold tracking-tight', gradeTone(grade))}>{grade}</span><span className="text-2xl font-bold">{primary}</span></div><p className="text-sm text-muted-foreground">{secondary}</p></CardContent></Card>);
}

function ActivityTrackerCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const [metric, setMetric] = useState<'engagements' | 'appointmentsHeld'>('engagements');
  const [catchUpPeriod, setCatchUpPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const kpi = dashboard.kpis[metric];
  const label = metric === 'engagements' ? 'Engagements' : 'Appointments Held';
  const delta = kpi.actual - kpi.target;
  const behindAmount = Math.max(0, kpi.target - kpi.actual);
  const catchUpWindow = dashboard.catchUpWindowDays ?? 20;
  let dailyCatchUp: number;
  if (metric === 'engagements') { dailyCatchUp = dashboard.catchUpDailyRequired ?? 0; }
  else { const engTarget = dashboard.kpis.engagements.target; const engDaily = engTarget > 0 && dashboard.catchUpDailyRequired ? (dashboard.catchUpDailyRequired - (Math.max(0, engTarget - dashboard.kpis.engagements.actual) / catchUpWindow)) : 0; const estWorkdays = engDaily > 0 ? engTarget / engDaily : (catchUpWindow * 2); const aptDailyBase = estWorkdays > 0 ? kpi.target / estWorkdays : 0; dailyCatchUp = Number((aptDailyBase + behindAmount / catchUpWindow).toFixed(2)); }
  let catchUpValue: number; let periodLabel: string;
  switch (catchUpPeriod) { case 'weekly': catchUpValue = Number((dailyCatchUp * 5).toFixed(1)); periodLabel = 'per week'; break; case 'monthly': catchUpValue = Number((dailyCatchUp * 22).toFixed(1)); periodLabel = 'per month'; break; default: catchUpValue = dailyCatchUp; periodLabel = 'per day'; }

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm font-medium text-muted-foreground">Activity Tracker</CardTitle><Select value={metric} onValueChange={v => setMetric(v as typeof metric)}><SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="engagements">Engagements</SelectItem><SelectItem value="appointmentsHeld">Appointments Held</SelectItem></SelectContent></Select></div></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={cn('flex items-center justify-center h-14 w-14 rounded-xl text-2xl font-extrabold', gradeBg(kpi.grade), gradeTone(kpi.grade))}>{kpi.grade}</div>
          <div className="flex-1 space-y-1">
            <div className="flex items-baseline justify-between"><span className="text-lg font-bold">{fmtNum(kpi.actual)}</span><span className="text-sm text-muted-foreground">/ {fmtNum(kpi.target)} goal</span></div>
            <div className="w-full bg-muted rounded-full h-2"><div className={cn('h-2 rounded-full transition-all', kpi.performance >= 100 ? 'bg-green-500' : kpi.performance >= 70 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${Math.min(kpi.performance, 100)}%` }} /></div>
            <p className="text-xs text-muted-foreground">{kpi.performance}% of {label.toLowerCase()} goal-to-date</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 space-y-0.5"><p className="text-xs text-muted-foreground font-medium">{label} Delta</p><div className="flex items-center gap-1">{delta >= 0 ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}<span className={cn('text-lg font-bold', delta >= 0 ? 'text-green-600' : 'text-red-600')}>{delta >= 0 ? '+' : ''}{fmtNum(delta)}</span></div><p className="text-xs text-muted-foreground">{delta >= 0 ? 'ahead of goal' : 'behind goal'}</p></div>
          <div className="rounded-lg border p-3 space-y-0.5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground font-medium">Catch-Up Target</p><Select value={catchUpPeriod} onValueChange={v => setCatchUpPeriod(v as typeof catchUpPeriod)}><SelectTrigger className="w-[90px] h-6 text-[10px] px-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div><span className="text-lg font-bold">{fmtNum(catchUpValue)}</span><p className="text-xs text-muted-foreground">{label.toLowerCase()} {periodLabel}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

function KeyNumbersCard({ dashboard, year }: { dashboard: AgentDashboardData; year: number }) {
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const prev = dashboard.prevYearComparison;
  const availableYears = dashboard.availableComparisonYears ?? [];
  const showCompare = prev && (compareYear === null || compareYear === prev.year);
  const compLabel = prev ? String(prev.year) : '';
  const stats = dashboard.stats;

  const StatRow = ({ label, current, previous, isCurrency = true, suffix = '' }: { label: string; current: number; previous?: number; isCurrency?: boolean; suffix?: string }) => {
    const fmt = isCurrency ? fmtCurrency : (v: number) => fmtNum(v) + suffix;
    const d = previous && previous > 0 ? ((current - previous) / previous) * 100 : null;
    return (<div className="flex items-center justify-between py-2 border-b last:border-0"><span className="text-sm text-muted-foreground">{label}</span><div className="flex items-center gap-3"><span className="font-semibold text-sm">{fmt(current)}</span>{showCompare && previous != null && previous > 0 && d != null && (<span className={cn('text-xs font-medium flex items-center gap-0.5', d >= 0 ? 'text-green-600' : 'text-red-600')}>{d >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(d).toFixed(0)}%<span className="text-muted-foreground ml-1">vs {compLabel}</span></span>)}</div></div>);
  };

  return (
    <Card>
      <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base font-semibold">Key Numbers</CardTitle><Select value={compareYear != null ? String(compareYear) : 'default'} onValueChange={v => setCompareYear(v === 'default' ? null : Number(v))}><SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Compare to..." /></SelectTrigger><SelectContent><SelectItem value="default">{prev ? `vs ${prev.year}` : 'No comparison'}</SelectItem>{availableYears.map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent></Select></div></CardHeader>
      <CardContent className="space-y-0">
        <StatRow label="Avg Sale Price" current={stats.avgSalesPrice} previous={showCompare ? prev?.avgSalesPrice : undefined} />
        <StatRow label="Avg Commission %" current={stats.avgCommissionPct} previous={showCompare ? prev?.avgCommissionPct : undefined} isCurrency={false} suffix="%" />
        <StatRow label="$ per Engagement" current={stats.engagementValue} previous={showCompare ? prev?.engagementValue : undefined} />
        <StatRow label="$ per Appointment" current={stats.appointmentValue} previous={showCompare ? prev?.appointmentValue : undefined} />
        <StatRow label="Avg Net per Deal" current={stats.avgCommission} previous={prev && prev.closedDeals > 0 ? prev.netEarned / prev.closedDeals : undefined} />
      </CardContent>
    </Card>
  );
}

function DealsVolumeCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const vm = dashboard.volumeMetrics;
  if (!vm) return null;
  const GradeRow = ({ label, actual, goal, grade, performance, subtitle }: { label: string; actual: string; goal: string | null; grade: string; performance: number; subtitle?: string }) => (
    <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span><div className={cn('flex items-center justify-center h-8 w-8 rounded-lg text-sm font-extrabold', gradeBg(grade), gradeTone(grade))}>{grade}</div></div><div className="flex items-baseline justify-between"><span className="text-lg font-bold">{actual}</span>{goal && <span className="text-sm text-muted-foreground">/ {goal} goal</span>}</div><div className="w-full bg-muted rounded-full h-1.5"><div className={cn('h-1.5 rounded-full transition-all', performance >= 100 ? 'bg-green-500' : performance >= 70 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${Math.min(performance, 100)}%` }} /></div>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
  );
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Deals & Volume</CardTitle><CardDescription>Closed performance vs goals</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <GradeRow label="Deals Closed" actual={`${vm.closedDeals} closed`} goal={vm.dealsGoal != null ? `${vm.dealsGoal}` : null} grade={vm.dealsGrade} performance={vm.dealsPerformance} subtitle={`+ ${vm.pendingDeals} pending`} />
        <GradeRow label="$ Volume Sold" actual={fmtCurrency(vm.closedVolume)} goal={vm.volumeGoal != null ? fmtCurrency(vm.volumeGoal) : null} grade={vm.volumeGrade} performance={vm.volumePerformance} subtitle={`${fmtCurrency(vm.pendingVolume)} pending`} />
        <div className="border-t pt-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">Projected Volume (w/ Pending)</span><div className={cn('flex items-center justify-center h-8 w-8 rounded-lg text-sm font-extrabold', gradeBg(vm.projectedVolumeGrade), gradeTone(vm.projectedVolumeGrade))}>{vm.projectedVolumeGrade}</div></div><div className="flex items-baseline justify-between mt-1"><span className="text-lg font-bold">{fmtCurrency(vm.totalVolume)}</span><span className="text-xs text-muted-foreground">{vm.projectedVolumePerformance}% of YTD goal</span></div></div>
      </CardContent>
    </Card>
  );
}

// ── Pipeline Tables ─────────────────────────────────────────────────────────

function OpportunitiesTable({ opportunities }: { opportunities: Opportunity[] }) {
  const activeOpps = opportunities.filter(o => o.isActive).sort((a, b) => (a.appointmentDate ?? '') < (b.appointmentDate ?? '') ? -1 : 1);
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Appointments & Active Opportunities</CardTitle><CardDescription>Your current pipeline — sorted by appointment date.</CardDescription></CardHeader>
      <CardContent>{activeOpps.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">No active opportunities.</p>) : (
        <Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Appt Date</TableHead><TableHead>Price Range</TableHead><TableHead>Stage</TableHead><TableHead>Timeline</TableHead></TableRow></TableHeader>
          <TableBody>{activeOpps.map(opp => (<TableRow key={opp.id}><TableCell className="font-medium">{opp.contactName}</TableCell><TableCell>{formatDate(opp.appointmentDate)}</TableCell><TableCell>{opp.priceRangeLow && opp.priceRangeHigh ? `${formatCurrencyLocal(opp.priceRangeLow)} – ${formatCurrencyLocal(opp.priceRangeHigh)}` : opp.priceRangeLow ? `${formatCurrencyLocal(opp.priceRangeLow)}+` : '—'}</TableCell><TableCell><Badge className={cn(opp.stage === 'Hot' && 'bg-red-500/80 text-white', opp.stage === 'Nurture' && 'bg-yellow-500/80 text-white', opp.stage === 'Watch' && 'bg-blue-500/80 text-white')}>{opp.stage}</Badge></TableCell><TableCell><span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3 w-3" />{getTimelineBucket(opp.appointmentDate)}</span></TableCell></TableRow>))}</TableBody></Table>
      )}</CardContent></Card>
  );
}

function PendingTable({ transactions }: { transactions: Transaction[] }) {
  const pending = transactions.filter(t => t.status === 'pending' || t.status === 'under_contract');
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Pending / Under Contract</CardTitle><CardDescription>Deals in progress — not yet closed.</CardDescription></CardHeader>
      <CardContent>{pending.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">No pending transactions.</p>) : (
        <Table><TableHeader><TableRow><TableHead>Address</TableHead><TableHead>Client</TableHead><TableHead>Contract Date</TableHead><TableHead>Est. Close</TableHead><TableHead className="text-right">Deal Value</TableHead><TableHead className="text-right">Proj. Net</TableHead></TableRow></TableHeader>
          <TableBody>{pending.map(t => { const projNet = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0; return (<TableRow key={t.id}><TableCell className="font-medium">{t.address}</TableCell><TableCell>{t.clientName ?? '—'}</TableCell><TableCell>{formatDate(t.contractDate)}</TableCell><TableCell><span className="text-sm">{formatDate(t.closedDate ?? t.closingDate)}</span>{(t.closedDate || t.closingDate) && <span className="block text-xs text-muted-foreground">{getTimelineBucket(t.closedDate ?? t.closingDate)}</span>}</TableCell><TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell><TableCell className="text-right font-semibold text-primary">{projNet ? formatCurrencyLocal(projNet) : '—'}</TableCell></TableRow>); })}</TableBody></Table>
      )}</CardContent></Card>
  );
}

function ClosedTable({ transactions, year }: { transactions: Transaction[]; year: number }) {
  const closed = transactions.filter(t => t.status === 'closed' && (t.year === year || (t.closedDate ?? t.closingDate ?? '').startsWith(String(year)))).sort((a, b) => ((b.closedDate ?? b.closingDate ?? '') > (a.closedDate ?? a.closingDate ?? '') ? 1 : -1));
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Closed Transactions — {year}</CardTitle><CardDescription>All transactions you closed this calendar year.</CardDescription></CardHeader>
      <CardContent>{closed.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">No closed transactions for {year}.</p>) : (
        <Table><TableHeader><TableRow><TableHead>Address</TableHead><TableHead>Closed Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Deal Value</TableHead><TableHead className="text-right">Gross Comm.</TableHead><TableHead className="text-right">Net to Agent</TableHead></TableRow></TableHeader>
          <TableBody>{closed.map(t => { const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0; const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0; return (<TableRow key={t.id}><TableCell className="font-medium">{t.address}</TableCell><TableCell>{formatDate(t.closedDate ?? t.closingDate)}</TableCell><TableCell>{t.transactionType ? <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge> : '—'}</TableCell><TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell><TableCell className="text-right">{gross ? formatCurrencyLocal(gross) : '—'}</TableCell><TableCell className="text-right font-semibold">{net ? formatCurrencyLocal(net) : '—'}</TableCell></TableRow>); })}</TableBody></Table>
      )}</CardContent></Card>
  );
}
