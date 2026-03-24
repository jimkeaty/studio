'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics, Transaction, Opportunity } from '@/lib/types';
import type { MonthlyData, CategoryMetrics } from '@/lib/types/brokerCommandMetrics';
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
  Phone, MessageSquare, CalendarCheck, CalendarCheck2, FileSignature, CheckCircle2,
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

// ── KPI icon map ────────────────────────────────────────────────────────────

const kpiMeta: Record<string, { label: string; icon: React.ElementType; unit: string }> = {
  calls: { label: 'Calls', icon: Phone, unit: 'calls' },
  engagements: { label: 'Engagements', icon: MessageSquare, unit: 'engagements' },
  appointmentsSet: { label: 'Appointments Set', icon: CalendarCheck, unit: 'appts set' },
  appointmentsHeld: { label: 'Appointments Held', icon: CalendarCheck2, unit: 'appts held' },
  contractsWritten: { label: 'Contracts Written', icon: FileSignature, unit: 'contracts' },
  closings: { label: 'Closings', icon: CheckCircle2, unit: 'closings' },
};

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

  const dashboard = data?.dashboard;
  const plan = data?.plan ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          1. MY PERFORMANCE — metrics at the very top
         ════════════════════════════════════════════════════════════════════ */}
      <MyPerformanceSection
        perfData={perfData}
        perfLoading={perfLoading}
        dashboard={dashboard}
        year={perfYear}
        setYear={setPerfYear}
        view={perfView}
        setView={setPerfView}
      />

      {/* ════════════════════════════════════════════════════════════════════
          2. PACING & GOALS
         ════════════════════════════════════════════════════════════════════ */}
      {!loading && dashboard && <PacingGoalsCard dashboard={dashboard} />}

      {/* ════════════════════════════════════════════════════════════════════
          3. REPORT CARD — Hero Grade Cards
         ════════════════════════════════════════════════════════════════════ */}
      {loading ? <DashboardSkeleton /> : error ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : !dashboard ? (
        <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No Data</AlertTitle><AlertDescription>Dashboard data for {year} not found.</AlertDescription></Alert>
      ) : (
        <>
          <ReportCardSection dashboard={dashboard} />

          {/* ════════════════════════════════════════════════════════════════
              4. KPIs — All 6 with uniform activity-tracker style
             ════════════════════════════════════════════════════════════════ */}
          <KpiSection dashboard={dashboard} plan={plan} />

          {/* ════════════════════════════════════════════════════════════════
              5. CHARTS — Monthly Net Income, Volume, Sales
             ════════════════════════════════════════════════════════════════ */}
          <ChartsSection
            perfData={perfData}
            perfLoading={perfLoading}
            year={perfYear}
            compareYear={compareYear}
            setCompareYear={setCompareYear}
          />

          {/* ════════════════════════════════════════════════════════════════
              6. SET MONTHLY GOALS
             ════════════════════════════════════════════════════════════════ */}
          {perfData?.overview && (
            <GoalsEditor
              months={perfData.overview.months}
              year={perfYear}
              goalSegment={perfData.agentView.goalSegment}
              onSaved={fetchPerf}
            />
          )}

          {/* ════════════════════════════════════════════════════════════════
              7. RECRUITING INCENTIVE TRACKER
             ════════════════════════════════════════════════════════════════ */}
          <RecruitingIncentiveTracker />

          {/* ════════════════════════════════════════════════════════════════
              8. PIPELINE TABLES
             ════════════════════════════════════════════════════════════════ */}
          <OpportunitiesTable opportunities={opportunities} />
          <PendingTable transactions={transactions} />
          <ClosedTable transactions={transactions} year={year} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MY PERFORMANCE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function MyPerformanceSection({ perfData, perfLoading, dashboard, year, setYear, view, setView }: {
  perfData: AgentMetricsResponse | null; perfLoading: boolean;
  dashboard: AgentDashboardData | null;
  year: number; setYear: (y: number) => void;
  view: 'personal' | 'team'; setView: (v: 'personal' | 'team') => void;
}) {
  if (perfLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  if (!perfData?.overview) return null;

  const { overview, agentView, prevYearStats } = perfData;
  const { totals } = overview;
  const { isTeamLeader, availableTeams } = agentView;

  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgCommPct = totals.closedVolume > 0 ? (totals.totalGCI / totals.closedVolume) * 100 : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;
  const yearlyIncomeGoal = overview.months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const gradeVsGoal = yearlyIncomeGoal ? Math.round((totals.netIncome / yearlyIncomeGoal) * 100) : null;

  // $ per engagement & $ per appointment from overview dashboard data
  const perEngagement = dashboard?.stats?.engagementValue ?? 0;
  const perAppointment = dashboard?.stats?.appointmentValue ?? 0;
  const prevPerEngagement = dashboard?.prevYearComparison?.engagementValue;
  const prevPerAppointment = dashboard?.prevYearComparison?.appointmentValue;
  const prevAvgNetPerDeal = (dashboard?.prevYearComparison && dashboard.prevYearComparison.closedDeals > 0)
    ? dashboard.prevYearComparison.netEarned / dashboard.prevYearComparison.closedDeals : undefined;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl font-semibold">{view === 'team' ? agentView.viewLabel : 'My'} Performance</CardTitle>
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
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricTile title="Net Income (Closed)" value={fmtCurrencyCompact(totals.netIncome)} subtitle={`${fmtNumNull(totals.closedCount)} closings · ${gradeVsGoal ? `${gradeVsGoal}% of goal` : 'No goal set'}`} icon={DollarSign} highlight />
          <MetricTile title="Pending Income" value={fmtCurrencyCompact(totals.pendingNetIncome)} subtitle={`${fmtNumNull(totals.pendingCount)} pending deals`} icon={Clock} />
          <MetricTile title="Closed Volume" value={fmtCurrencyCompact(totals.closedVolume, true)} subtitle={`Pending: ${fmtCurrencyCompact(totals.pendingVolume, true)}`} icon={TrendingUp} />
          <MetricTile title="Avg Sale Price" value={fmtCurrencyCompact(avgSalePrice)} subtitle={prevYearStats ? `vs ${fmtCurrencyCompact(prevYearStats.avgSalePrice)} prev year` : '—'} icon={DollarSign} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <MetricTile title="Total GCI" value={fmtCurrencyCompact(totals.totalGCI)} subtitle={`Avg Commission: ${avgCommPct > 0 ? `${avgCommPct.toFixed(2)}%` : '—'}`} icon={Target} />
          <MetricTileWithDelta title="$ per Engagement" value={fmtCurrencyCompact(perEngagement)} previous={prevPerEngagement} icon={MessageSquare} />
          <MetricTileWithDelta title="$ per Appointment" value={fmtCurrencyCompact(perAppointment)} previous={prevPerAppointment} icon={CalendarCheck2} />
          <MetricTileWithDelta title="Avg Net per Deal" value={fmtCurrencyCompact(avgNetPerDeal)} previous={prevAvgNetPerDeal} icon={DollarSign} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({ title, value, subtitle, icon: Icon, highlight }: { title: string; value: string; subtitle: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-1', highlight ? 'border-primary/50 bg-primary/5' : '')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function MetricTileWithDelta({ title, value, previous, icon: Icon }: { title: string; value: string; previous?: number; icon: React.ElementType }) {
  const currentNum = parseFloat(value.replace(/[^0-9.-]/g, ''));
  const delta = previous && previous > 0 && currentNum > 0 ? ((currentNum - previous) / previous) * 100 : null;
  return (
    <div className="rounded-lg border p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      {delta != null ? (
        <span className={cn('text-xs font-medium flex items-center gap-0.5', delta >= 0 ? 'text-green-600' : 'text-red-600')}>
          {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta).toFixed(0)}% vs prev year
        </span>
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PACING & GOALS
// ═══════════════════════════════════════════════════════════════════════════════

function PacingGoalsCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const incomeDelta = dashboard.incomeDeltaToGoal ?? 0;
  const effectiveStartLabel = !dashboard.effectiveStartDate ? 'Jan 1' : (() => {
    const d = new Date(`${dashboard.effectiveStartDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dashboard.effectiveStartDate;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Pacing & Goals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <PacingItem label="Effective Start" value={effectiveStartLabel} />
          <PacingItem label="Annual Income Goal" value={fmtCurrency(dashboard.annualIncomeGoal ?? 0)} />
          <PacingItem label="Net Earned" value={fmtCurrency(dashboard.netEarned)} />
          <PacingItem label="Net Pending" value={fmtCurrency(dashboard.netPending)} />
          <PacingItem label="Total Potential" value={fmtCurrency(dashboard.ytdTotalPotential)} highlight />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground font-medium">Pace Delta</p>
            <p className={cn('text-lg font-bold mt-0.5', incomeDelta >= 0 ? 'text-green-600' : 'text-red-600')}>
              {incomeDelta >= 0 ? '+' : ''}{fmtCurrency(incomeDelta)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PacingItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5', highlight && 'text-primary')}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REPORT CARD — Hero Grade Cards
// ═══════════════════════════════════════════════════════════════════════════════

function gradeColorScheme(g: string) {
  switch (g) {
    case 'A': return { bg: 'bg-gradient-to-br from-green-500/15 to-emerald-500/10', border: 'border-green-500/40', badge: 'bg-green-500 text-white', text: 'text-green-700 dark:text-green-400' };
    case 'B': return { bg: 'bg-gradient-to-br from-blue-500/15 to-sky-500/10', border: 'border-blue-500/40', badge: 'bg-blue-500 text-white', text: 'text-blue-700 dark:text-blue-400' };
    case 'C': return { bg: 'bg-gradient-to-br from-yellow-500/15 to-amber-500/10', border: 'border-yellow-500/40', badge: 'bg-yellow-500 text-white', text: 'text-yellow-700 dark:text-yellow-400' };
    case 'D': return { bg: 'bg-gradient-to-br from-orange-500/15 to-orange-400/10', border: 'border-orange-500/40', badge: 'bg-orange-500 text-white', text: 'text-orange-700 dark:text-orange-400' };
    default: return { bg: 'bg-gradient-to-br from-red-500/15 to-rose-500/10', border: 'border-red-500/40', badge: 'bg-red-500 text-white', text: 'text-red-700 dark:text-red-400' };
  }
}

function HeroCard({ title, grade, primary, secondary, performancePct, icon: Icon, isGracePeriod }: {
  title: string; grade: string; primary: string; secondary: string;
  performancePct?: number; icon: React.ElementType; isGracePeriod?: boolean;
}) {
  const colors = gradeColorScheme(grade);
  return (
    <Card className={cn('relative overflow-hidden border-2 shadow-sm', colors.bg, colors.border)}>
      <div className="absolute -right-4 -top-4 text-[120px] font-black leading-none opacity-[0.06] pointer-events-none select-none">{grade}</div>
      <CardHeader className="flex flex-row items-center justify-between pb-1 relative z-10">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', colors.badge)}><Icon className="h-4 w-4" /></div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-2">
        <div className="flex items-end gap-3">
          <span className={cn('text-5xl font-black tracking-tighter leading-none', colors.text)}>{grade}</span>
          <div className="flex flex-col pb-0.5">
            <span className="text-xl font-bold leading-tight">{primary}</span>
            {performancePct != null && <span className={cn('text-sm font-semibold', colors.text)}>{performancePct}% of goal</span>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-snug">{secondary}</p>
        {isGracePeriod && (
          <Badge variant="outline" className="text-[10px] border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock className="h-2.5 w-2.5 mr-1" /> 90-Day Grace Period
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function ReportCardSection({ dashboard }: { dashboard: AgentDashboardData }) {
  const incomeDelta = dashboard.incomeDeltaToGoal ?? 0;
  const incomeDeltaPct = dashboard.expectedYTDIncomeGoal > 0 ? Math.round((incomeDelta / dashboard.expectedYTDIncomeGoal) * 100) : 0;
  const pipelinePct = dashboard.expectedYTDIncomeGoal > 0 ? Math.round((dashboard.ytdTotalPotential / dashboard.expectedYTDIncomeGoal) * 100) : 0;
  const vm = dashboard.volumeMetrics;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Report Card</h2>

      {/* Row 1: Income + Engagements */}
      <div className="grid gap-4 md:grid-cols-3">
        <HeroCard
          title="Net Income YTD" grade={dashboard.incomeGrade} primary={fmtCurrency(dashboard.netEarned)}
          performancePct={dashboard.expectedYTDIncomeGoal > 0 ? Math.round((dashboard.netEarned / dashboard.expectedYTDIncomeGoal) * 100) : undefined}
          secondary={incomeDelta >= 0 ? `${Math.abs(incomeDeltaPct)}% ahead of pace · ${fmtCurrency(dashboard.expectedYTDIncomeGoal)} YTD goal` : `${Math.abs(incomeDeltaPct)}% behind pace · ${fmtCurrency(dashboard.expectedYTDIncomeGoal)} YTD goal`}
          icon={DollarSign} isGracePeriod={dashboard.isMetricsGracePeriod}
        />
        <HeroCard
          title="Projected with Pending" grade={dashboard.pipelineAdjustedIncome.grade} primary={fmtCurrency(dashboard.ytdTotalPotential)}
          performancePct={dashboard.expectedYTDIncomeGoal > 0 ? pipelinePct : undefined}
          secondary={`${fmtCurrency(dashboard.netPending)} pending · closed + pipeline`}
          icon={TrendingUp} isGracePeriod={dashboard.isMetricsGracePeriod}
        />
        <HeroCard
          title="Engagements YTD" grade={dashboard.leadIndicatorGrade}
          primary={`${fmtNum(dashboard.kpis.engagements.actual)} / ${fmtNum(dashboard.engagementGoalToDate ?? dashboard.kpis.engagements.target)}`}
          performancePct={Math.round(dashboard.leadIndicatorPerformance)}
          secondary={`${dashboard.leadIndicatorPerformance}% of engagement goal-to-date`}
          icon={Target}
        />
      </div>

      {/* Row 2: Deals & Volume */}
      {vm && (
        <div className="grid gap-4 md:grid-cols-3">
          <HeroCard
            title="Deals Closed" grade={vm.dealsGrade} primary={`${vm.closedDeals} closed`}
            performancePct={vm.dealsGoal != null ? Math.round(vm.dealsPerformance) : undefined}
            secondary={vm.dealsGoal != null ? `Goal: ${vm.dealsGoal} deals · ${vm.pendingDeals} pending` : `${vm.pendingDeals} pending · No goal set`}
            icon={BarChart3} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
          <HeroCard
            title="$ Volume Sold" grade={vm.volumeGrade} primary={fmtCurrency(vm.closedVolume)}
            performancePct={vm.volumeGoal != null ? Math.round(vm.volumePerformance) : undefined}
            secondary={vm.volumeGoal != null ? `Goal: ${fmtCurrency(vm.volumeGoal)} · ${fmtCurrency(vm.pendingVolume)} pending` : `${fmtCurrency(vm.pendingVolume)} pending · No goal set`}
            icon={DollarSign} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
          <HeroCard
            title="Projected Volume (w/ Pending)" grade={vm.projectedVolumeGrade} primary={fmtCurrency(vm.totalVolume)}
            performancePct={vm.volumeGoal != null ? Math.round(vm.projectedVolumePerformance) : undefined}
            secondary={vm.volumeGoal != null ? `Closed + pending vs ${fmtCurrency(vm.volumeGoal)} goal` : 'Closed + pending volume'}
            icon={TrendingUp} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. KPI SECTION — Uniform Activity-Tracker-Style Cards
// ═══════════════════════════════════════════════════════════════════════════════

function KpiSection({ dashboard, plan }: { dashboard: AgentDashboardData; plan: BusinessPlan | null }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">KPI Tracker</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(dashboard.kpis).map(([key, kpi]) => {
          const meta = kpiMeta[key] || { label: key, icon: Target, unit: key };
          // daily target from plan
          const dailyTarget = plan?.calculatedTargets?.[key as keyof typeof plan.calculatedTargets];
          const dailyBase = typeof dailyTarget === 'object' && dailyTarget && 'daily' in dailyTarget ? (dailyTarget as any).daily : 0;
          return (
            <KpiTrackerCard
              key={key}
              label={meta.label}
              icon={meta.icon}
              unit={meta.unit}
              actual={kpi.actual}
              target={kpi.target}
              performance={kpi.performance}
              grade={kpi.grade}
              isGracePeriod={dashboard.isLeadIndicatorGracePeriod}
              dailyBase={dailyBase}
            />
          );
        })}
      </div>
    </div>
  );
}

function KpiTrackerCard({ label, icon: Icon, unit, actual, target, performance, grade, isGracePeriod, dailyBase }: {
  label: string; icon: React.ElementType; unit: string;
  actual: number; target: number; performance: number; grade: string;
  isGracePeriod: boolean; dailyBase: number;
}) {
  const [catchUpDays, setCatchUpDays] = useState(20);
  const delta = actual - target;
  const behindAmount = Math.max(0, target - actual);
  const dailyCatchUp = Number((dailyBase + (behindAmount / Math.max(1, catchUpDays))).toFixed(2));
  const colors = gradeColorScheme(grade);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', colors.badge)}>
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold">{label}</CardTitle>
          </div>
          <div className={cn('flex items-center justify-center h-12 w-12 rounded-xl text-xl font-black', gradeBg(grade), gradeTone(grade))}>
            {isGracePeriod ? 'A' : grade}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">{fmtNum(actual)}</span>
            <span className="text-sm text-muted-foreground">/ {fmtNum(target)} goal</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', performance >= 90 ? 'bg-green-500' : performance >= 70 ? 'bg-yellow-500' : performance >= 60 ? 'bg-orange-500' : 'bg-red-500')}
              style={{ width: `${Math.min(performance, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{performance}% of goal-to-date</p>
        </div>

        {/* Delta + Catch-Up */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Delta</p>
            <div className="flex items-center gap-1">
              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
              <span className={cn('text-base font-bold', delta >= 0 ? 'text-green-600' : 'text-red-600')}>
                {delta >= 0 ? '+' : ''}{fmtNum(delta)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{delta >= 0 ? 'ahead' : 'behind'}</p>
          </div>

          <div className="rounded-lg border p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Catch-Up</p>
            <span className="text-base font-bold">{fmtNum(dailyCatchUp)}</span>
            <p className="text-[10px] text-muted-foreground">{unit}/day</p>
            <div className="flex items-center gap-1 mt-0.5 pt-0.5 border-t">
              <Select value={String(catchUpDays)} onValueChange={v => setCatchUpDays(Number(v))}>
                <SelectTrigger className="w-[60px] h-4 text-[9px] px-1 border-0 shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 10, 14, 20, 30, 45, 60].map(d => (
                    <SelectItem key={d} value={String(d)}>{d}d window</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Grace period indicator */}
        {isGracePeriod && (
          <p className="text-[10px] text-muted-foreground italic">Grace period — establishing baseline</p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CHARTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function ChartsSection({ perfData, perfLoading, year, compareYear, setCompareYear }: {
  perfData: AgentMetricsResponse | null; perfLoading: boolean;
  year: number; compareYear: number | null; setCompareYear: (y: number | null) => void;
}) {
  if (perfLoading || !perfData?.overview) return <Skeleton className="h-80" />;

  const { overview, agentView } = perfData;
  const { months } = overview;
  const { monthlyNetIncome, monthlyPendingNetIncome } = agentView;

  return (
    <div className="space-y-6">
      {/* CHART 1: Monthly Net Income */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Net Income</CardTitle><CardDescription>Income after broker split — {year}{compareYear ? ` vs ${compareYear}` : ''}</CardDescription></div>
            <CompareSelector value={compareYear} onChange={setCompareYear} years={perfData.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={incomeChartConfig} className="h-[350px] w-full">
            <BarChart data={months.map((m, i) => ({ label: m.label, netIncome: monthlyNetIncome[i] || 0, pendingNetIncome: monthlyPendingNetIncome[i] || 0, incomeGoal: m.grossMarginGoal, compareIncome: perfData.comparisonData?.months?.[i]?.netIncome ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
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
            <CompareSelector value={compareYear} onChange={setCompareYear} years={perfData.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({ ...m, compareVolume: perfData.comparisonData?.months?.[i]?.closedVolume ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
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
            <CompareSelector value={compareYear} onChange={setCompareYear} years={perfData.availableYears ?? []} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({ ...m, compareCount: perfData.comparisonData?.months?.[i]?.closedCount ?? null }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE TABLES
// ═══════════════════════════════════════════════════════════════════════════════

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
