'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics, Transaction, Opportunity } from '@/lib/types';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { YtdValueMetricsCard } from '@/components/dashboard/YtdValueMetricsCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  Target,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  FileCheck2,
  Clock,
  BarChart3,
  LayoutGrid,
  Zap,
} from 'lucide-react';
import { RecruitingIncentiveTracker } from '@/components/dashboard/agent/RecruitingIncentiveTracker';
import { AgentIncomeByMonthCard } from '@/components/dashboard/agent/AgentIncomeByMonthCard';
import { PerformanceTab } from '@/components/dashboard/agent/PerformanceTab';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { differenceInDays, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';

// ── Skeleton ────────────────────────────────────────────────────────────────

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="grid gap-6 md:grid-cols-3">
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
    </div>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
    </div>
    <Skeleton className="h-96" />
  </div>
);

// ── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString()
    : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function gradeTone(grade: string) {
  switch (grade) {
    case 'A': return 'text-green-600';
    case 'B': return 'text-primary';
    case 'C': return 'text-yellow-600';
    case 'D': return 'text-orange-600';
    default: return 'text-red-600';
  }
}

function gradeBg(grade: string) {
  switch (grade) {
    case 'A': return 'bg-green-500/10 border-green-500/30';
    case 'B': return 'bg-primary/5 border-primary/30';
    case 'C': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'D': return 'bg-orange-500/10 border-orange-500/30';
    default: return 'bg-red-500/10 border-red-500/30';
  }
}

const formatCurrencyLocal = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const getTimelineBucket = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  try {
    const days = differenceInDays(parseISO(dateStr), new Date());
    if (days < 0) return 'Past';
    if (days < 30) return 'Under 30 days';
    if (days < 60) return '30–60 days';
    if (days < 90) return '60–90 days';
    return '90+ days';
  } catch { return '—'; }
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
};

const txTypeLabel: Record<string, string> = {
  residential_sale: 'Residential',
  rental: 'Rental',
  commercial_lease: 'Commercial Lease',
  commercial_sale: 'Commercial Sale',
};

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<{
    dashboard: AgentDashboardData | null;
    plan: BusinessPlan | null;
    ytdMetrics: YtdValueMetrics | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  const year = new Date().getFullYear();

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/dashboard?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errorData = await res.json();
          if (res.status === 400 && errorData.allowedYears) {
            throw new Error(`Data for year ${year} is not available. Allowed years: ${errorData.allowedYears.join(', ')}`);
          }
          throw new Error(errorData.error || 'Failed to load dashboard data');
        }
        const responseData = await res.json();
        if (!responseData.ok) throw new Error(responseData.error || 'API returned an error');
        setData(responseData);
      } catch (err: any) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading && user) loadDashboard();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, year]);

  useEffect(() => {
    const loadPipeline = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/agent/pipeline?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setTransactions(data.transactions ?? []);
          setOpportunities(data.opportunities ?? []);
        }
      } catch (err) { console.error('[pipeline]', err); }
    };
    if (!userLoading && user) loadPipeline();
  }, [user, userLoading, year]);

  if (userLoading) return <DashboardSkeleton />;

  if (!user) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sign In Required</AlertTitle>
        <AlertDescription>Please sign in to view your dashboard.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutGrid className="h-4 w-4 mr-1.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 className="h-4 w-4 mr-1.5" />Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {loading ? (
            <DashboardSkeleton />
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Dashboard</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !data || !data.dashboard ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Data Available</AlertTitle>
              <AlertDescription>
                Dashboard data for {year} could not be found for your account. Please check your business plan setup or contact support.
              </AlertDescription>
            </Alert>
          ) : (
            <OverviewContent
              data={data}
              year={year}
              transactions={transactions}
              opportunities={opportunities}
            />
          )}
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <PerformanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Hero Grade Card ─────────────────────────────────────────────────────────

function HeroCard({
  title, grade, primary, secondary, icon: Icon,
}: {
  title: string; grade: string; primary: string; secondary: string;
  icon: React.ElementType;
}) {
  return (
    <Card className={cn('relative overflow-hidden', gradeBg(grade))}>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-3">
          <span className={cn('text-4xl font-extrabold tracking-tight', gradeTone(grade))}>{grade}</span>
          <span className="text-2xl font-bold">{primary}</span>
        </div>
        <p className="text-sm text-muted-foreground">{secondary}</p>
      </CardContent>
    </Card>
  );
}

// ── Activity Tracker Card (Engagements / Appointments toggle) ───────────────

function ActivityTrackerCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const [metric, setMetric] = useState<'engagements' | 'appointmentsHeld'>('engagements');
  const [catchUpPeriod, setCatchUpPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const kpi = dashboard.kpis[metric];
  const label = metric === 'engagements' ? 'Engagements' : 'Appointments Held';

  // Calculate delta & catch-up for the selected metric
  const delta = kpi.actual - kpi.target;
  const behindAmount = Math.max(0, kpi.target - kpi.actual);

  // For catch-up: we use the daily target from the KPI + spread the deficit over 20 days
  const catchUpWindow = dashboard.catchUpWindowDays ?? 20;
  // Daily target = target / elapsed workdays (approximate from KPI target / goal-to-date ratio)
  // We'll use the existing catchUpDailyRequired for engagements, and calculate for appointments
  let dailyCatchUp: number;
  if (metric === 'engagements') {
    dailyCatchUp = dashboard.catchUpDailyRequired ?? 0;
  } else {
    // For appointments: daily base rate + deficit spread over catch-up window
    // Estimate daily base from the target: target was accumulated over elapsed workdays
    // A simple approximation: if target > 0, dailyBase ≈ kpi.target / elapsed_days
    // But we have catchUpWindowDays. Use similar formula as the API.
    const elapsed = kpi.target > 0 ? Math.max(1, kpi.target) : 1;
    // Actually, we can derive daily rate from: target = dailyRate × workdays
    // We don't know workdays exactly, but we can estimate from engagements:
    // engTarget / engDaily ≈ workdays, so aptDaily = aptTarget / workdays
    const engTarget = dashboard.kpis.engagements.target;
    const engDaily = engTarget > 0 && dashboard.catchUpDailyRequired
      ? (dashboard.catchUpDailyRequired - (Math.max(0, engTarget - dashboard.kpis.engagements.actual) / catchUpWindow))
      : 0;
    const estWorkdays = engDaily > 0 ? engTarget / engDaily : (catchUpWindow * 2); // fallback ~40 days
    const aptDailyBase = estWorkdays > 0 ? kpi.target / estWorkdays : 0;
    dailyCatchUp = Number((aptDailyBase + behindAmount / catchUpWindow).toFixed(2));
  }

  // Convert to selected period
  let catchUpValue: number;
  let periodLabel: string;
  switch (catchUpPeriod) {
    case 'weekly':
      catchUpValue = Number((dailyCatchUp * 5).toFixed(1));
      periodLabel = 'per week';
      break;
    case 'monthly':
      catchUpValue = Number((dailyCatchUp * 22).toFixed(1));
      periodLabel = 'per month';
      break;
    default:
      catchUpValue = dailyCatchUp;
      periodLabel = 'per day';
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Activity Tracker</CardTitle>
          <Select value={metric} onValueChange={v => setMetric(v as typeof metric)}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="engagements">Engagements</SelectItem>
              <SelectItem value="appointmentsHeld">Appointments Held</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grade + Progress */}
        <div className="flex items-center gap-4">
          <div className={cn(
            'flex items-center justify-center h-14 w-14 rounded-xl text-2xl font-extrabold',
            gradeBg(kpi.grade), gradeTone(kpi.grade),
          )}>
            {kpi.grade}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold">{formatNumber(kpi.actual)}</span>
              <span className="text-sm text-muted-foreground">/ {formatNumber(kpi.target)} goal</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  kpi.performance >= 100 ? 'bg-green-500' :
                  kpi.performance >= 70 ? 'bg-yellow-500' : 'bg-red-500',
                )}
                style={{ width: `${Math.min(kpi.performance, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{kpi.performance}% of {label.toLowerCase()} goal-to-date</p>
          </div>
        </div>

        {/* Delta + Catch-Up */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground font-medium">{label} Delta</p>
            <div className="flex items-center gap-1">
              {delta >= 0
                ? <ArrowUpRight className="h-4 w-4 text-green-600" />
                : <ArrowDownRight className="h-4 w-4 text-red-600" />}
              <span className={cn('text-lg font-bold', delta >= 0 ? 'text-green-600' : 'text-red-600')}>
                {delta >= 0 ? '+' : ''}{formatNumber(delta)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {delta >= 0 ? 'ahead of goal' : 'behind goal'}
            </p>
          </div>

          <div className="rounded-lg border p-3 space-y-0.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">Catch-Up Target</p>
              <Select value={catchUpPeriod} onValueChange={v => setCatchUpPeriod(v as typeof catchUpPeriod)}>
                <SelectTrigger className="w-[90px] h-6 text-[10px] px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-lg font-bold">{formatNumber(catchUpValue)}</span>
            <p className="text-xs text-muted-foreground">{label.toLowerCase()} {periodLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Key Numbers Card (with year comparison) ────────────────────────────────

function KeyNumbersCard({ dashboard, year }: { dashboard: AgentDashboardData; year: number }) {
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const prev = dashboard.prevYearComparison;
  const availableYears = dashboard.availableComparisonYears ?? [];

  // Show comparison to selected year (or default prev year)
  const showCompare = prev && (compareYear === null || compareYear === prev.year);
  const compLabel = prev ? String(prev.year) : '';

  const stats = dashboard.stats;
  const appointmentsHeld = dashboard.kpis.appointmentsHeld.actual;

  // Helper to render a stat row with optional comparison
  const StatRow = ({ label, current, previous, isCurrency = true, suffix = '' }: {
    label: string; current: number; previous?: number; isCurrency?: boolean; suffix?: string;
  }) => {
    const fmt = isCurrency ? formatCurrency : (v: number) => formatNumber(v) + suffix;
    const delta = previous && previous > 0 ? ((current - previous) / previous) * 100 : null;
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{fmt(current)}</span>
          {showCompare && previous != null && previous > 0 && delta != null && (
            <span className={cn(
              'text-xs font-medium flex items-center gap-0.5',
              delta >= 0 ? 'text-green-600' : 'text-red-600',
            )}>
              {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta).toFixed(0)}%
              <span className="text-muted-foreground ml-1">vs {compLabel}</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Key Numbers</CardTitle>
          <Select
            value={compareYear != null ? String(compareYear) : 'default'}
            onValueChange={v => setCompareYear(v === 'default' ? null : Number(v))}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Compare to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{prev ? `vs ${prev.year}` : 'No comparison'}</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        <StatRow
          label="Avg Sale Price"
          current={stats.avgSalesPrice}
          previous={showCompare ? prev?.avgSalesPrice : undefined}
        />
        <StatRow
          label="Avg Commission %"
          current={stats.avgCommissionPct}
          previous={showCompare ? prev?.avgCommissionPct : undefined}
          isCurrency={false}
          suffix="%"
        />
        <StatRow
          label="$ per Engagement"
          current={stats.engagementValue}
          previous={showCompare ? prev?.engagementValue : undefined}
        />
        <StatRow
          label="$ per Appointment"
          current={stats.appointmentValue}
          previous={showCompare ? prev?.appointmentValue : undefined}
        />
        <StatRow
          label="Avg Net per Deal"
          current={stats.avgCommission}
          previous={prev && prev.closedDeals > 0 ? prev.netEarned / prev.closedDeals : undefined}
        />
      </CardContent>
    </Card>
  );
}

// ── Deals & Volume Grade Card ───────────────────────────────────────────────

function DealsVolumeCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const vm = dashboard.volumeMetrics;
  if (!vm) return null;

  const GradeRow = ({ label, actual, goal, grade, performance, subtitle }: {
    label: string; actual: string; goal: string | null; grade: string;
    performance: number; subtitle?: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className={cn(
          'flex items-center justify-center h-8 w-8 rounded-lg text-sm font-extrabold',
          gradeBg(grade), gradeTone(grade),
        )}>
          {grade}
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold">{actual}</span>
        {goal && <span className="text-sm text-muted-foreground">/ {goal} goal</span>}
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={cn(
            'h-1.5 rounded-full transition-all',
            performance >= 100 ? 'bg-green-500' :
            performance >= 70 ? 'bg-yellow-500' : 'bg-red-500',
          )}
          style={{ width: `${Math.min(performance, 100)}%` }}
        />
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Deals & Volume</CardTitle>
        <CardDescription>Closed performance vs goals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <GradeRow
          label="Deals Closed"
          actual={`${vm.closedDeals} closed`}
          goal={vm.dealsGoal != null ? `${vm.dealsGoal}` : null}
          grade={vm.dealsGrade}
          performance={vm.dealsPerformance}
          subtitle={`+ ${vm.pendingDeals} pending`}
        />

        <GradeRow
          label="$ Volume Sold"
          actual={formatCurrency(vm.closedVolume)}
          goal={vm.volumeGoal != null ? formatCurrency(vm.volumeGoal) : null}
          grade={vm.volumeGrade}
          performance={vm.volumePerformance}
          subtitle={`${formatCurrency(vm.pendingVolume)} pending`}
        />

        <div className="border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Projected Volume (w/ Pending)</span>
            <div className={cn(
              'flex items-center justify-center h-8 w-8 rounded-lg text-sm font-extrabold',
              gradeBg(vm.projectedVolumeGrade), gradeTone(vm.projectedVolumeGrade),
            )}>
              {vm.projectedVolumeGrade}
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold">{formatCurrency(vm.totalVolume)}</span>
            <span className="text-xs text-muted-foreground">{vm.projectedVolumePerformance}% of YTD goal</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Overview Tab Content ────────────────────────────────────────────────────

function OverviewContent({
  data, year, transactions, opportunities,
}: {
  data: { dashboard: AgentDashboardData; plan: BusinessPlan | null; ytdMetrics: YtdValueMetrics | null };
  year: number; transactions: Transaction[]; opportunities: Opportunity[];
}) {
  const { dashboard, plan, ytdMetrics } = data;

  const incomeDelta = dashboard.incomeDeltaToGoal ?? 0;
  const incomeDeltaPct = dashboard.expectedYTDIncomeGoal > 0
    ? Math.round((incomeDelta / dashboard.expectedYTDIncomeGoal) * 100)
    : 0;

  const pipelinePct = dashboard.expectedYTDIncomeGoal > 0
    ? Math.round((dashboard.ytdTotalPotential / dashboard.expectedYTDIncomeGoal) * 100)
    : 0;

  // Filter out engagements KPI — it's now handled by the ActivityTrackerCard
  const filteredKpis = Object.entries(dashboard.kpis || {}).filter(
    ([key]) => key !== 'engagements'
  );

  const effectiveStartLabel = !dashboard.effectiveStartDate
    ? 'Jan 1'
    : (() => {
        const d = new Date(`${dashboard.effectiveStartDate}T00:00:00`);
        if (Number.isNaN(d.getTime())) return dashboard.effectiveStartDate;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      })();

  return (
    <div className="space-y-8">
      {/* ── ROW 0: Key Numbers (no grade, comparison year) ──────────────────── */}
      <KeyNumbersCard dashboard={dashboard} year={year} />

      {/* ── ROW 1: Three Hero Cards ────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-3">
        <HeroCard
          title="Net Income YTD"
          grade={dashboard.incomeGrade}
          primary={formatCurrency(dashboard.netEarned)}
          secondary={
            incomeDelta >= 0
              ? `${Math.abs(incomeDeltaPct)}% ahead of pace (${formatCurrency(dashboard.expectedYTDIncomeGoal)} goal)`
              : `${Math.abs(incomeDeltaPct)}% behind pace (${formatCurrency(dashboard.expectedYTDIncomeGoal)} goal)`
          }
          icon={DollarSign}
        />

        <HeroCard
          title="Projected with Pending"
          grade={dashboard.pipelineAdjustedIncome.grade}
          primary={formatCurrency(dashboard.ytdTotalPotential)}
          secondary={`${formatCurrency(dashboard.netPending)} pending · ${pipelinePct}% of YTD goal if pending close`}
          icon={TrendingUp}
        />

        <HeroCard
          title="Engagements YTD"
          grade={dashboard.leadIndicatorGrade}
          primary={`${formatNumber(dashboard.kpis.engagements.actual)} / ${formatNumber(dashboard.engagementGoalToDate ?? dashboard.kpis.engagements.target)}`}
          secondary={`${dashboard.leadIndicatorPerformance}% of engagement goal-to-date`}
          icon={Target}
        />
      </div>

      {/* ── ROW 2: Deals & Volume + Activity Tracker + Quick Stats ──────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DealsVolumeCard dashboard={dashboard} />

        <ActivityTrackerCard dashboard={dashboard} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pacing & Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Effective Start</span>
              <span className="font-semibold text-sm">{effectiveStartLabel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Annual Income Goal</span>
              <span className="font-semibold text-sm">{formatCurrency(dashboard.annualIncomeGoal ?? 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Net Earned</span>
              <span className="font-semibold text-sm">{formatCurrency(dashboard.netEarned)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Net Pending</span>
              <span className="font-semibold text-sm">{formatCurrency(dashboard.netPending)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Potential</span>
              <span className="font-bold text-sm text-primary">{formatCurrency(dashboard.ytdTotalPotential)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pace Delta</span>
              <span className={cn('font-semibold text-sm', incomeDelta >= 0 ? 'text-green-600' : 'text-red-600')}>
                {incomeDelta >= 0 ? '+' : ''}{formatCurrency(incomeDelta)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── ROW 3: KPI Grade Cards (minus engagements) ─────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {filteredKpis.map(([key, kpi]) => (
          <KpiCard
            key={key}
            title={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
            actual={kpi.actual}
            target={kpi.target}
            performance={kpi.performance}
            grade={kpi.grade}
            isGracePeriod={dashboard.isLeadIndicatorGracePeriod}
          />
        ))}
      </div>

      {/* ── Income by Month Chart ──────────────────────────────────────────── */}
      <AgentIncomeByMonthCard year={year} dashboard={dashboard} plan={plan} />

      {/* ── YTD Value Metrics ──────────────────────────────────────────────── */}
      <YtdValueMetricsCard metrics={ytdMetrics} loading={false} error={null} />

      {/* ── Appointments & Active Opportunities ────────────────────────────── */}
      {(() => {
        const activeOpps = opportunities
          .filter(o => o.isActive)
          .sort((a, b) => (a.appointmentDate ?? '') < (b.appointmentDate ?? '') ? -1 : 1);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Appointments &amp; Active Opportunities</CardTitle>
              <CardDescription>Your current pipeline — sorted by appointment date.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeOpps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No active opportunities. They will appear here once added.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Appt Date</TableHead>
                      <TableHead>Price Range</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Timeline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeOpps.map((opp) => (
                      <TableRow key={opp.id}>
                        <TableCell className="font-medium">{opp.contactName}</TableCell>
                        <TableCell>{formatDate(opp.appointmentDate)}</TableCell>
                        <TableCell>
                          {opp.priceRangeLow && opp.priceRangeHigh
                            ? `${formatCurrencyLocal(opp.priceRangeLow)} – ${formatCurrencyLocal(opp.priceRangeHigh)}`
                            : opp.priceRangeLow ? `${formatCurrencyLocal(opp.priceRangeLow)}+` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            opp.stage === 'Hot' && 'bg-red-500/80 text-white',
                            opp.stage === 'Nurture' && 'bg-yellow-500/80 text-white',
                            opp.stage === 'Watch' && 'bg-blue-500/80 text-white',
                          )}>{opp.stage}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />{getTimelineBucket(opp.appointmentDate)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Pending / Under Contract ───────────────────────────────────────── */}
      {(() => {
        const pending = transactions.filter(t => t.status === 'pending' || t.status === 'under_contract');
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Pending / Under Contract</CardTitle>
              <CardDescription>Deals in progress — not yet closed.</CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No pending transactions. Deals under contract will appear here.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Contract Date</TableHead>
                      <TableHead>Est. Close</TableHead>
                      <TableHead className="text-right">Deal Value</TableHead>
                      <TableHead className="text-right">Proj. Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((t) => {
                      const projNet = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.address}</TableCell>
                          <TableCell>{t.clientName ?? '—'}</TableCell>
                          <TableCell>{formatDate(t.contractDate)}</TableCell>
                          <TableCell>
                            <span className="text-sm">{formatDate(t.closedDate ?? t.closingDate)}</span>
                            {(t.closedDate || t.closingDate) && (
                              <span className="block text-xs text-muted-foreground">{getTimelineBucket(t.closedDate ?? t.closingDate)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{projNet ? formatCurrencyLocal(projNet) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Closed Transactions ────────────────────────────────────────────── */}
      {(() => {
        const closed = transactions
          .filter(t => t.status === 'closed' && (t.year === year || (t.closedDate ?? t.closingDate ?? '').startsWith(String(year))))
          .sort((a, b) => ((b.closedDate ?? b.closingDate ?? '') > (a.closedDate ?? a.closingDate ?? '') ? 1 : -1));
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Closed Transactions — {year}</CardTitle>
              <CardDescription>All transactions you closed this calendar year.</CardDescription>
            </CardHeader>
            <CardContent>
              {closed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No closed transactions for {year}.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Closed Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Deal Value</TableHead>
                      <TableHead className="text-right">Gross Comm.</TableHead>
                      <TableHead className="text-right">Net to Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closed.map((t) => {
                      const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                      const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.address}</TableCell>
                          <TableCell>{formatDate(t.closedDate ?? t.closingDate)}</TableCell>
                          <TableCell>
                            {t.transactionType ? (
                              <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell>
                          <TableCell className="text-right">{gross ? formatCurrencyLocal(gross) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{net ? formatCurrencyLocal(net) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Recruiting Incentive Tracker ────────────────────────────────────── */}
      <RecruitingIncentiveTracker />
    </div>
  );
}
