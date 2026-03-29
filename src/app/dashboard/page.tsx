'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics, Transaction, Opportunity } from '@/lib/types';
import type { MonthlyData, CategoryMetrics, SourceBreakdown } from '@/lib/types/brokerCommandMetrics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
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
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';

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
function letterGrade(pct: number): { letter: string; color: string } {
  if (pct >= 90) return { letter: 'A', color: 'text-green-600' };
  if (pct >= 80) return { letter: 'B', color: 'text-blue-600' };
  if (pct >= 70) return { letter: 'C', color: 'text-yellow-600' };
  if (pct >= 60) return { letter: 'D', color: 'text-orange-600' };
  return { letter: 'F', color: 'text-red-600' };
}
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
  projectedNetIncome: { label: 'Projected', color: 'hsl(38 92% 50%)' },
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

// ── Multi-year color palette ─────────────────────────────────────────────────
const YEAR_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

// ── Performance types ───────────────────────────────────────────────────────

type AgentMetricsResponse = {
  overview: {
    year: number;
    // Agent-safe totals: commission split fields (totalGCI, grossMargin, etc.) are
    // stripped server-side for non-admin callers. Only net income is returned.
    totals: { closedVolume: number; pendingVolume: number; closedCount: number; pendingCount: number; netIncome: number; pendingNetIncome: number; totalGCI?: number; grossMargin?: number; grossMarginPct?: number; transactionFees?: number; };
    months: MonthlyData[];
    categoryBreakdown: { closed: CategoryMetrics; pending: CategoryMetrics };
    sourceBreakdown?: SourceBreakdown;
  };
  prevYearStats?: { year: number; totalVolume: number; totalSales: number; avgSalePrice: number; seasonality: { month: number; label: string; volumePct: number; salesPct: number }[]; totalGCI?: number; totalGrossMargin?: number; avgGCI?: number; avgGrossMargin?: number; avgMarginPct?: number; avgCommissionPct?: number; };
  availableYears?: number[];
  comparisonData?: { year: number; months: { closedVolume: number; closedCount: number; netIncome: number; grossMargin?: number; totalGCI?: number }[] } | null;
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

// ── Goals Editor (Broker-style with auto-calculations & seasonality) ─────────

type AgentPrevYearStats = {
  year: number;
  totalVolume: number;
  totalSales: number;
  avgSalePrice: number;
  seasonality: { month: number; salesPct: number; volumePct: number }[];
  // Admin-only fields (stripped from agent responses)
  totalGCI?: number;
  totalGrossMargin?: number;
  avgGCI?: number;
  avgGrossMargin?: number;
  avgMarginPct?: number;
  avgCommissionPct?: number;
};

function GoalsEditor({ months, year, goalSegment, onSaved, prevYearStats }: {
  months: MonthlyData[];
  year: number;
  goalSegment: string;
  onSaved: () => void;
  prevYearStats?: AgentPrevYearStats;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyIncome, setYearlyIncome] = useState('');
  const [seasonWeights, setSeasonWeights] = useState<Record<number, { salesPct: string; volumePct: string }>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const hasPrevData = prevYearStats && prevYearStats.totalSales > 0;
  const avgSalePrice = prevYearStats?.avgSalePrice ?? 0;
  const avgCommPct = prevYearStats?.avgCommissionPct ?? 0;
  const avgMarginPct = prevYearStats?.avgMarginPct ?? 0;

  // Initialize from current goals + prev year seasonality
  useEffect(() => {
    const map: typeof goals = {};
    let totalMargin = 0, totalVolume = 0, totalSales = 0;
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
    if (totalMargin > 0) setYearlyIncome(String(Math.round(totalMargin)));

    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats?.seasonality?.[m - 1];
      sw[m] = { salesPct: String(s?.salesPct ?? 8.33), volumePct: String(s?.volumePct ?? 8.33) };
    }
    setSeasonWeights(sw);
  }, [months, prevYearStats]);

  // Volume → auto-calc sales + income
  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    if (vol > 0 && avgSalePrice > 0) setYearlySales(String(Math.round(vol / avgSalePrice)));
    if (vol > 0 && avgCommPct > 0 && avgMarginPct > 0) {
      const totalGCI = vol * (avgCommPct / 100);
      setYearlyIncome(String(Math.round(totalGCI * (avgMarginPct / 100))));
    }
  };

  // Sales → auto-calc volume + income
  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    if (sales > 0 && avgSalePrice > 0) {
      const calcVol = Math.round(sales * avgSalePrice);
      setYearlyVolume(String(calcVol));
      if (avgCommPct > 0 && avgMarginPct > 0) {
        setYearlyIncome(String(Math.round(calcVol * (avgCommPct / 100) * (avgMarginPct / 100))));
      }
    }
  };

  // Income → back-calc volume + sales
  const handleIncomeChange = (val: string) => {
    setYearlyIncome(val);
    const income = parseFloat(val) || 0;
    if (income > 0 && avgMarginPct > 0 && avgCommPct > 0) {
      const calcVol = Math.round(income / ((avgCommPct / 100) * (avgMarginPct / 100)));
      setYearlyVolume(String(calcVol));
      if (avgSalePrice > 0) setYearlySales(String(Math.round(calcVol / avgSalePrice)));
    }
  };

  // Distribute across months using seasonality
  const distribute = () => {
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const income = parseFloat(yearlyIncome) || 0;
    const newGoals: typeof goals = {};
    for (let m = 1; m <= 12; m++) {
      const sw = seasonWeights[m];
      const volPct = parseFloat(sw?.volumePct) || 8.33;
      const salesPct = parseFloat(sw?.salesPct) || 8.33;
      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol * (volPct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (salesPct / 100))) : '',
        margin: income > 0 ? String(Math.round(income * (salesPct / 100))) : '',
      };
    }
    setGoals(newGoals);
  };

  const resetSeasonality = () => {
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) sw[m] = { salesPct: '8.33', volumePct: '8.33' };
    setSeasonWeights(sw);
  };

  const resetSeasonalityToPrev = () => {
    if (!prevYearStats) return;
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats?.seasonality?.[m - 1];
      sw[m] = { salesPct: String(s?.salesPct ?? 8.33), volumePct: String(s?.volumePct ?? 8.33) };
    }
    setSeasonWeights(sw);
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
              year, month: m, segment: goalSegment,
              grossMarginGoal: g.margin ? parseFloat(g.margin) : null,
              volumeGoal: g.volume ? parseFloat(g.volume) : null,
              salesCountGoal: g.sales ? parseInt(g.sales, 10) : null,
            }),
          })
        );
      }
      await Promise.all(promises);
      onSaved();
    } catch (err) { console.error('Failed to save goals:', err); }
    finally { setSaving(false); }
  };

  // Totals for footer + seasonality validation
  const totalsMargin = Object.values(goals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0);
  const totalsVolume = Object.values(goals).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0);
  const totalsSales = Object.values(goals).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0);
  const totalSalesPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.salesPct) || 0), 0);
  const totalVolPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.volumePct) || 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" /> Set Monthly Goals
              </CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>
            Enter a yearly goal — income, volume, and sales auto-calculate from {hasPrevData ? `${prevYearStats.year}` : 'previous year'} averages.
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Net Income</span>
                    <p className="font-semibold">{fmtCurrency((prevYearStats.totalGrossMargin ?? 0))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Volume</span>
                    <p className="font-semibold">{fmtCurrencyCompact(prevYearStats.totalVolume, true)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Deals</span>
                    <p className="font-semibold">{prevYearStats.totalSales}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Sale Price</span>
                    <p className="font-semibold">{fmtCurrency(prevYearStats.avgSalePrice)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Net/Deal</span>
                    <p className="font-semibold">{fmtCurrency((prevYearStats.avgGrossMargin ?? 0))}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Increase Production Selector */}
            {hasPrevData && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Increase Production Over Last Year</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[5, 10, 15, 20, 25, 30, 40, 50].map(pct => {
                    const targetIncome = Math.round((prevYearStats.totalGrossMargin ?? 0) * (1 + pct / 100));
                    const isActive = yearlyIncome && Math.abs(parseFloat(yearlyIncome) - targetIncome) < 100;
                    return (
                      <button key={pct} type="button" onClick={() => {
                        const newVol = Math.round(prevYearStats.totalVolume * (1 + pct / 100));
                        handleVolumeChange(String(newVol));
                      }} className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                        +{pct}%
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1 ml-2">
                    <Input type="number" placeholder="Custom %" className="w-24 h-8 text-sm" min={0} max={500} onChange={e => {
                      const pct = parseFloat(e.target.value);
                      if (pct > 0 && prevYearStats.totalVolume > 0) {
                        handleVolumeChange(String(Math.round(prevYearStats.totalVolume * (1 + pct / 100))));
                      }
                    }} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                {yearlyIncome && (prevYearStats.totalGrossMargin ?? 0) > 0 && (
                  <p className="text-xs text-blue-600">
                    {fmtCurrency((prevYearStats.totalGrossMargin ?? 0))} → {fmtCurrency(parseFloat(yearlyIncome))}
                    {' '}({((parseFloat(yearlyIncome) / (prevYearStats.totalGrossMargin ?? 0) - 1) * 100).toFixed(1)}% increase)
                  </p>
                )}
              </div>
            )}

            {/* Yearly Goal Inputs */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Yearly Goals for {year}</h4>
                {hasPrevData && (
                  <span className="text-xs text-muted-foreground">Enter any field — others auto-calculate</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="agent-yearly-income" className="text-xs">Net Income Goal ($)</Label>
                  <Input id="agent-yearly-income" type="number" value={yearlyIncome} onChange={e => handleIncomeChange(e.target.value)} placeholder={hasPrevData ? `Last year: ${fmtCurrency((prevYearStats.totalGrossMargin ?? 0))}` : 'e.g. 120000'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agent-yearly-volume" className="text-xs">Volume Goal ($)</Label>
                  <Input id="agent-yearly-volume" type="number" value={yearlyVolume} onChange={e => handleVolumeChange(e.target.value)} placeholder={hasPrevData ? `Last year: ${fmtCurrencyCompact(prevYearStats.totalVolume, true)}` : 'e.g. 5000000'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agent-yearly-sales" className="text-xs">
                    Sales Goal (#)
                    {avgSalePrice > 0 && <span className="text-muted-foreground ml-1">@ {fmtCurrency(avgSalePrice)} avg</span>}
                  </Label>
                  <Input id="agent-yearly-sales" type="number" value={yearlySales} onChange={e => handleSalesChange(e.target.value)} placeholder={hasPrevData ? `Last year: ${prevYearStats.totalSales}` : 'e.g. 20'} />
                </div>
              </div>
              <Button variant="default" onClick={distribute} disabled={!yearlyIncome && !yearlyVolume && !yearlySales}>
                <Target className="mr-2 h-4 w-4" /> Distribute Across Months
              </Button>
            </div>

            {/* Editable Seasonality Weights */}
            <Collapsible>
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                      <h4 className="font-semibold text-sm flex items-center gap-1">
                        Seasonality Weights
                        <ChevronDown className="h-4 w-4" />
                      </h4>
                    </Button>
                  </CollapsibleTrigger>
                  <div className="flex gap-2">
                    {hasPrevData && (
                      <Button variant="default" onClick={() => { resetSeasonalityToPrev(); setTimeout(distribute, 50); }} className="gap-2">
                        <BarChart3 className="h-4 w-4" /> Use {prevYearStats.year} Seasonality
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { resetSeasonality(); setTimeout(distribute, 50); }} className="text-xs h-7">
                      Even Split
                    </Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium">Month</th>
                          <th className="text-center py-2 px-2 font-medium">Sales %</th>
                          <th className="text-center py-2 px-2 font-medium">Volume %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                          const sw = seasonWeights[m] || { salesPct: '8.33', volumePct: '8.33' };
                          const label = months.find(md => md.month === m)?.label || `M${m}`;
                          return (
                            <tr key={m} className="border-b last:border-0">
                              <td className="py-1.5 pr-4 font-medium">{label}</td>
                              <td className="py-1.5 px-2">
                                <Input type="number" step="0.1" value={sw.salesPct} onChange={e => setSeasonWeights(p => ({ ...p, [m]: { ...p[m], salesPct: e.target.value } }))} className="h-7 w-20 text-center mx-auto" />
                              </td>
                              <td className="py-1.5 px-2">
                                <Input type="number" step="0.1" value={sw.volumePct} onChange={e => setSeasonWeights(p => ({ ...p, [m]: { ...p[m], volumePct: e.target.value } }))} className="h-7 w-20 text-center mx-auto" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-4 text-xs mt-2">
                    <span className={totalSalesPct > 99.5 && totalSalesPct < 100.5 ? 'text-green-600' : 'text-amber-600'}>
                      Sales: {totalSalesPct.toFixed(1)}%
                    </span>
                    <span className={totalVolPct > 99.5 && totalVolPct < 100.5 ? 'text-green-600' : 'text-amber-600'}>
                      Volume: {totalVolPct.toFixed(1)}%
                    </span>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Monthly Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Month</th>
                    <th className="text-center py-2 px-1 font-medium w-16">Season %</th>
                    <th className="text-left py-2 px-2 font-medium">Income Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
                    const sw = seasonWeights[m] || { salesPct: '8.33', volumePct: '8.33' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{label}</td>
                        <td className="py-2 px-1">
                          <Input type="number" step="0.1" value={sw.salesPct} onChange={e => setSeasonWeights(p => ({ ...p, [m]: { ...p[m], salesPct: e.target.value, volumePct: e.target.value } }))} className="h-7 w-16 text-center text-xs bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" />
                        </td>
                        <td className="py-2 px-2"><Input type="number" value={g.margin} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], margin: e.target.value } }))} placeholder="0" className="h-8 w-28" /></td>
                        <td className="py-2 px-2"><Input type="number" value={g.volume} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], volume: e.target.value } }))} placeholder="0" className="h-8 w-28" /></td>
                        <td className="py-2 px-2"><Input type="number" value={g.sales} onChange={e => setGoals(p => ({ ...p, [m]: { ...p[m], sales: e.target.value } }))} placeholder="0" className="h-8 w-24" /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className={cn('py-2 px-1 text-center text-xs', totalSalesPct > 99.5 && totalSalesPct < 100.5 ? 'text-green-600' : 'text-amber-600')}>{totalSalesPct.toFixed(1)}%</td>
                    <td className="py-2 px-2">{fmtCurrency(totalsMargin)}</td>
                    <td className="py-2 px-2">{fmtCurrencyCompact(totalsVolume, true)}</td>
                    <td className="py-2 px-2">{totalsSales}</td>
                  </tr>
                </tfoot>
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

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

export default function AgentDashboardPageWrapper() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AgentDashboardPage />
    </Suspense>
  );
}

function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const { isImpersonating, impersonatedAgent, startImpersonation } = useEffectiveUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Bootstrap impersonation from URL params (links from admin pages)
  const isAdmin = user?.uid === ADMIN_UID;
  useEffect(() => {
    const viewAsParam = searchParams.get('viewAs');
    const viewAsName = searchParams.get('viewAsName');
    if (isAdmin && viewAsParam && viewAsName) {
      startImpersonation({ uid: viewAsParam, name: decodeURIComponent(viewAsName) });
      // Remove URL params so they don't persist on refresh
      router.replace('/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, searchParams]);

  // Effective agent to view (impersonated uid or own uid)
  const viewAs = isImpersonating && impersonatedAgent ? impersonatedAgent.uid : null;

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
  const [perfError, setPerfError] = useState<string | null>(null);

  const year = new Date().getFullYear();

  // Load overview dashboard
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true); setError(null);
      try {
        const token = await user.getIdToken();
        const dashUrl = viewAs ? `/api/dashboard?year=${year}&viewAs=${viewAs}` : `/api/dashboard?year=${year}`;
        const res = await fetch(dashUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to load dashboard'); }
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || 'API error');
        setData(d);
      } catch (err: any) { setError(err.message); console.error(err); }
      finally { setLoading(false); }
    };
    if (!userLoading && user) load();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, year, viewAs]);

  // Load pipeline
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const pipeUrl = viewAs ? `/api/agent/pipeline?year=${year}&viewAs=${viewAs}` : `/api/agent/pipeline?year=${year}`;
        const res = await fetch(pipeUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (d.ok) { setTransactions(d.transactions ?? []); setOpportunities(d.opportunities ?? []); }
      } catch (err) { console.error('[pipeline]', err); }
    };
    if (!userLoading && user) load();
  }, [user, userLoading, year, viewAs]);

  // Load performance data
  const fetchPerf = useCallback(async () => {
    if (!user) return;
    setPerfLoading(true);
    setPerfError(null);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(perfYear), view: perfView });
      if (compareYear) params.set('compareYear', String(compareYear));
      if (viewAs) params.set('viewAs', viewAs);
      const res = await fetch(`/api/agent/command-metrics?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || `Request failed (${res.status})`); }
      setPerfData(await res.json());
    } catch (e: any) { console.error('[perf]', e); setPerfError(e.message); }
    finally { setPerfLoading(false); }
  }, [user, perfYear, perfView, compareYear, viewAs]);

  useEffect(() => { fetchPerf(); }, [fetchPerf]);

  if (userLoading) return <DashboardSkeleton />;
  if (!user) return <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Sign In Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;

  const dashboard = data?.dashboard;
  const plan = data?.plan ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isImpersonating && impersonatedAgent ? `${impersonatedAgent.name}'s Dashboard` : 'Agent Dashboard'}
        </h1>
        <p className="text-muted-foreground">
          {isImpersonating ? `Performance summary for ${year}.` : `Your performance summary for ${year}.`}
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          1. MY PERFORMANCE — metrics at the very top
         ════════════════════════════════════════════════════════════════════ */}
      <MyPerformanceSection
        perfData={perfData}
        perfLoading={perfLoading}
        perfError={perfError}
        dashboard={dashboard ?? null}
        year={perfYear}
        setYear={setPerfYear}
        view={perfView}
        setView={setPerfView}
      />

      {/* ════════════════════════════════════════════════════════════════════
          2. TIER / CAP PROGRESS
         ════════════════════════════════════════════════════════════════════ */}
      {!loading && dashboard && <TierProgressCard dashboard={dashboard} />}

      {/* ════════════════════════════════════════════════════════════════════
          3. REPORT CARD — Hero Grade Cards
         ════════════════════════════════════════════════════════════════════ */}
      {loading ? <DashboardSkeleton /> : error ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : !dashboard ? (
        <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No Data</AlertTitle><AlertDescription>Dashboard data for {year} not found.</AlertDescription></Alert>
      ) : (
        <>
          <ReportCardSection dashboard={dashboard} perfData={perfData} perfYear={perfYear} />

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
            perfError={perfError}
            year={perfYear}
            compareYear={compareYear}
            setCompareYear={setCompareYear}
          />

          {/* ════════════════════════════════════════════════════════════════
              5b. MULTI-YEAR PRODUCTION COMPARISON
             ════════════════════════════════════════════════════════════════ */}
          <AgentMultiYearComparison view={perfView} viewAs={viewAs} />

          {/* ════════════════════════════════════════════════════════════════
              6. CATEGORY & SOURCE BREAKDOWN
             ════════════════════════════════════════════════════════════════ */}
          {perfLoading ? <Skeleton className="h-64 w-full" /> : perfData ? <CategoryBreakdownSection perfData={perfData} year={perfYear} /> : null}

          {/* ════════════════════════════════════════════════════════════════
              7. SET MONTHLY GOALS
             ════════════════════════════════════════════════════════════════ */}
          {perfData?.overview && (
            <GoalsEditor
              months={perfData.overview.months}
              year={perfYear}
              goalSegment={perfData.agentView.goalSegment}
              onSaved={fetchPerf}
              prevYearStats={perfData.prevYearStats}
            />
          )}

          {/* ════════════════════════════════════════════════════════════════
              8. PIPELINE TABLES
             ════════════════════════════════════════════════════════════════ */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">My Pipeline</h2>
            <p className="text-sm text-muted-foreground">Active opportunities, pending deals, and closed transactions for {year}.</p>
          </div>
          <OpportunitiesTable opportunities={opportunities} />
          <PendingTable transactions={transactions} />
          <ClosedTable transactions={transactions} year={year} />

          {/* ════════════════════════════════════════════════════════════════
              9. RECRUITING INCENTIVE TRACKER
             ════════════════════════════════════════════════════════════════ */}
          <RecruitingIncentiveTracker />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MY PERFORMANCE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function MyPerformanceSection({ perfData, perfLoading, perfError, dashboard, year, setYear, view, setView }: {
  perfData: AgentMetricsResponse | null; perfLoading: boolean; perfError: string | null;
  dashboard: AgentDashboardData | null;
  year: number; setYear: (y: number) => void;
  view: 'personal' | 'team'; setView: (v: 'personal' | 'team') => void;
}) {
  if (perfLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  if (perfError) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Performance data unavailable</AlertTitle><AlertDescription>{perfError}</AlertDescription></Alert>;
  if (!perfData?.overview) return null;

  const { overview, agentView, prevYearStats } = perfData;
  const { totals } = overview;
  const { isTeamLeader, availableTeams } = agentView;

  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;

  // YTD-prorated goal logic (apples-to-apples: compare YTD actuals to YTD goal)
  const todayPerf = new Date();
  const currentYearPerf = todayPerf.getFullYear();
  const isCurrentYearPerf = year === currentYearPerf;
  const daysInYearPerf = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  const daysElapsedPerf = Math.floor((todayPerf.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + 1;
  const ytdFractionPerf = isCurrentYearPerf ? Math.min(1, daysElapsedPerf / daysInYearPerf) : 1;
  const currentMonthIdxPerf = isCurrentYearPerf ? todayPerf.getMonth() : 11;

  const yearlyIncomeGoal = overview.months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const yearlyVolumeGoal = overview.months.reduce((s, m) => s + (m.volumeGoal ?? 0), 0) || null;
  const yearlySalesGoal = overview.months.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) || null;
  const ytdIncomeGoal = yearlyIncomeGoal ? Math.round(yearlyIncomeGoal * ytdFractionPerf) : null;
  const ytdVolumeGoal = yearlyVolumeGoal ? Math.round(yearlyVolumeGoal * ytdFractionPerf) : null;
  const ytdSalesGoal = yearlySalesGoal ? Math.round(yearlySalesGoal * ytdFractionPerf * 10) / 10 : null;
  const gradeVsGoal = ytdIncomeGoal ? Math.round((totals.netIncome / ytdIncomeGoal) * 100) : null;
  const gradeVsVolume = ytdVolumeGoal ? Math.round((totals.closedVolume / ytdVolumeGoal) * 100) : null;
  const gradeVsSales = ytdSalesGoal ? Math.round((totals.closedCount / ytdSalesGoal) * 100) : null;

  // Projection (seasonality-based for current year, straight-line fallback)
  const projFull = (() => {
    if (!isCurrentYearPerf) return null;
    const mn = agentView.monthlyNetIncome;
    const goalVals = overview.months.map(m => m.grossMarginGoal ?? 0);
    const yearlyGoal = goalVals.reduce((s, v) => s + v, 0);
    const ytdActual = mn.slice(0, currentMonthIdxPerf + 1).reduce((s, v) => s + v, 0);
    const ytdGoalShare = yearlyGoal > 0
      ? goalVals.slice(0, currentMonthIdxPerf + 1).reduce((s, v) => s + v, 0) / yearlyGoal
      : (currentMonthIdxPerf + 1) / 12;
    return ytdGoalShare > 0 ? Math.round(ytdActual / ytdGoalShare) : Math.round(ytdActual * 12 / (currentMonthIdxPerf + 1));
  })();
  const projLabel = yearlyIncomeGoal && yearlyIncomeGoal > 0 ? 'Seasonality-Based' : 'Straight-Line';

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
          <MetricTile title="Net Income (Closed)" value={fmtCurrencyCompact(totals.netIncome)} subtitle={`${fmtNumNull(totals.closedCount)} closings · ${ytdIncomeGoal ? `${gradeVsGoal}% of YTD goal` : 'No goal set'}`} icon={DollarSign} highlight />
          <MetricTile title="Pending Income" value={fmtCurrencyCompact(totals.pendingNetIncome)} subtitle={`${fmtNumNull(totals.pendingCount)} pending deals`} icon={Clock} />
          <MetricTile title="Closed Volume" value={fmtCurrencyCompact(totals.closedVolume, true)} subtitle={`Pending: ${fmtCurrencyCompact(totals.pendingVolume, true)}`} icon={TrendingUp} />
          <MetricTile title="Avg Sale Price" value={fmtCurrencyCompact(avgSalePrice)} subtitle={prevYearStats ? `vs ${fmtCurrencyCompact(prevYearStats.avgSalePrice)} prev year` : '—'} icon={DollarSign} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <MetricTileWithDelta title="$ per Engagement" value={fmtCurrencyCompact(perEngagement)} previous={prevPerEngagement} icon={MessageSquare} />
          <MetricTileWithDelta title="$ per Appointment" value={fmtCurrencyCompact(perAppointment)} previous={prevPerAppointment} icon={CalendarCheck2} />
          <MetricTileWithDelta title="Avg Net per Deal" value={fmtCurrencyCompact(avgNetPerDeal)} previous={prevAvgNetPerDeal} icon={DollarSign} />
        </div>

        {/* ── Grade Cards ─────────────────────────────────────────────────────── */}
        {(gradeVsGoal || gradeVsVolume || gradeVsSales || projFull) && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {gradeVsGoal != null && (() => { const g = letterGrade(gradeVsGoal); return (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">{isCurrentYearPerf ? 'Net Income vs YTD Goal' : 'Net Income vs Goal'}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{fmtCurrencyCompact(totals.netIncome, true)} <span className="text-muted-foreground font-normal text-xs">/ {fmtCurrencyCompact(ytdIncomeGoal!, true)}</span></p>
                    {projFull && isCurrentYearPerf && <p className="text-xs text-amber-600 mt-0.5">Proj. full year: {fmtCurrencyCompact(projFull, true)} <span className="text-muted-foreground">({projLabel})</span></p>}
                  </div>
                  <span className={`text-4xl font-black leading-none ${g.color}`}>{g.letter}</span>
                </div>
              </div>
            ); })()}
            {gradeVsVolume != null && (() => { const g = letterGrade(gradeVsVolume); return (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">{isCurrentYearPerf ? 'Volume vs YTD Goal' : 'Volume vs Goal'}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{fmtCurrencyCompact(totals.closedVolume, true)} <span className="text-muted-foreground font-normal text-xs">/ {fmtCurrencyCompact(ytdVolumeGoal!, true)}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{gradeVsVolume}% of YTD goal</p>
                  </div>
                  <span className={`text-4xl font-black leading-none ${g.color}`}>{g.letter}</span>
                </div>
              </div>
            ); })()}
            {gradeVsSales != null && (() => { const g = letterGrade(gradeVsSales); return (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">{isCurrentYearPerf ? 'Sales vs YTD Goal' : 'Sales vs Goal'}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{totals.closedCount} closings <span className="text-muted-foreground font-normal text-xs">/ {ytdSalesGoal} goal</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{gradeVsSales}% of YTD goal</p>
                  </div>
                  <span className={`text-4xl font-black leading-none ${g.color}`}>{g.letter}</span>
                </div>
              </div>
            ); })()}
          </div>
        )}
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
// 2. TIER / CAP PROGRESS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Tier color palette (hex values for inline SVG/gradient use)
const TIER_PALETTE = [
  { hex: '#2563eb', light: '#eff6ff', text: '#1e40af', ring: 'ring-blue-400/40',    label: 'blue'    },
  { hex: '#16a34a', light: '#f0fdf4', text: '#14532d', ring: 'ring-green-400/40',   label: 'green'   },
  { hex: '#eab308', light: '#fefce8', text: '#713f12', ring: 'ring-yellow-400/40',  label: 'yellow'  },
  { hex: '#ea580c', light: '#fff7ed', text: '#7c2d12', ring: 'ring-orange-400/40',  label: 'orange'  },
  { hex: '#9333ea', light: '#faf5ff', text: '#581c87', ring: 'ring-purple-400/40',  label: 'purple'  },
  { hex: '#e11d48', light: '#fff1f2', text: '#881337', ring: 'ring-rose-400/40',    label: 'rose'    },
];

function TierProgressCard({ dashboard }: { dashboard: AgentDashboardData }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const tp = dashboard.tierProgress;

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return null;
    try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  // ── Empty / unconfigured state ─────────────────────────────────────────
  if (!tp || tp.tiers.length === 0) {
    const dbg = (tp as any)?._debug;
    return (
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Commission Tier Progress</CardTitle>
              <CardDescription>No commission tiers configured — contact your admin.</CardDescription>
            </div>
          </div>
          {tp && (tp.grossGCIYTD > 0 || tp.pendingGrossGCI > 0) && (
            <p className="text-sm mt-2 text-muted-foreground">
              Gross GCI: <span className="font-semibold text-foreground">{fmtCurrency(tp.grossGCIYTD)}</span>
              {tp.pendingGrossGCI > 0 && <> + {fmtCurrency(tp.pendingGrossGCI)} pending</>}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {tp?.effectiveStartDate && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                <CalendarDays className="h-3 w-3" /> Started {fmtDate(tp.effectiveStartDate)}
              </span>
            )}
            {tp?.daysUntilReset != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                <Clock className="h-3 w-3" /> {tp.daysUntilReset}d until reset
              </span>
            )}
          </div>
          {dbg && (
            <p className="text-[10px] mt-2 text-muted-foreground/50 font-mono">
              debug · profile:{dbg.profileFound ? '✓' : '✗'} type:{dbg.agentType ?? '—'} tiers:{dbg.tiersOnProfile}
              {dbg.teamId ? ` teamId:${dbg.primaryTeamId}` : ''} role:{dbg.teamRole ?? '—'}
              {dbg.teamMemberCompMode ? ` compMode:${dbg.teamMemberCompMode}` : ''}
              {dbg.overrideBandsCount != null ? ` overrideBands:${dbg.overrideBandsCount}` : ''}
            </p>
          )}
        </CardHeader>
      </Card>
    );
  }

  const { tiers, grossGCIYTD, pendingGrossGCI, currentTierIndex, currentTierName,
          nextTierThreshold, capReached, effectiveStartDate, anniversaryDate, daysUntilReset, planName } = tp;

  const activePalette = TIER_PALETTE[currentTierIndex % TIER_PALETTE.length];
  const remainToNext = nextTierThreshold != null ? Math.max(0, nextTierThreshold - grossGCIYTD) : 0;

  // ── Bar geometry ───────────────────────────────────────────────────────
  // Extend the last (uncapped) tier by 30% beyond current GCI or a minimum buffer
  const lastTier = tiers[tiers.length - 1];
  const lastMax = lastTier.toCompanyDollar
    ?? Math.max(lastTier.fromCompanyDollar * 1.5, grossGCIYTD * 1.25, lastTier.fromCompanyDollar + 25000);
  const totalRange = lastMax;

  // Compute each tier's left% and width%
  const tierSegments = tiers.map((t, i) => {
    const from = t.fromCompanyDollar;
    const to = i < tiers.length - 1 ? (tiers[i + 1].fromCompanyDollar) : lastMax;
    const leftPct = (from / totalRange) * 100;
    const widthPct = ((to - from) / totalRange) * 100;
    return { leftPct, widthPct, from, to };
  });

  // Position marker for current GCI
  const markerPct = Math.min((grossGCIYTD / totalRange) * 100, 99.5);
  // Position of pending GCI marker
  const pendingMarkerPct = pendingGrossGCI > 0
    ? Math.min(((grossGCIYTD + pendingGrossGCI) / totalRange) * 100, 99.5)
    : null;

  const hoveredTier = hoveredIdx !== null ? tiers[hoveredIdx] : null;

  return (
    <Card className="overflow-hidden">
      {/* Accent bar — color matches active tier */}
      <div className="h-1" style={{ background: `linear-gradient(to right, ${activePalette.hex}88, ${activePalette.hex})` }} />

      <CardContent className="pt-5 pb-5 space-y-5">
        {/* ── TOP ROW ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold tracking-tight">Commission Tier Progress</h3>
            {planName && (
              <p className="text-xs text-muted-foreground mt-0.5">{planName}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Active tier badge */}
            <span
              className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border"
              style={{ background: activePalette.light, color: activePalette.text, borderColor: activePalette.hex + '55' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: activePalette.hex }} />
              {currentTierName}
              <span className="font-normal opacity-70">· {tiers[currentTierIndex].agentSplitPercent}% agent</span>
            </span>
            {capReached && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                ★ Cap Reached
              </span>
            )}
          </div>
        </div>

        {/* ── MAIN PROGRESS BAR ────────────────────────────────────────── */}
        <div className="space-y-1">
          {/* Hover tooltip above bar */}
          <div className="h-8 relative">
            {hoveredTier && hoveredIdx !== null && (
              <div
                className="absolute bottom-1 z-10 -translate-x-1/2 pointer-events-none"
                style={{ left: `${tierSegments[hoveredIdx].leftPct + tierSegments[hoveredIdx].widthPct / 2}%` }}
              >
                <div
                  className="text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                  style={{ background: TIER_PALETTE[hoveredIdx % TIER_PALETTE.length].hex }}
                >
                  <div className="font-bold">{hoveredTier.tierName || `Tier ${hoveredIdx + 1}`}</div>
                  <div className="opacity-90">
                    {fmtCurrencyCompact(tierSegments[hoveredIdx].from, true)}
                    {' → '}
                    {hoveredTier.toCompanyDollar != null
                      ? fmtCurrencyCompact(tierSegments[hoveredIdx].to, true)
                      : 'No cap'}
                  </div>
                  <div className="opacity-90">{hoveredTier.agentSplitPercent}% / {hoveredTier.companySplitPercent}%</div>
                </div>
                {/* Caret */}
                <div className="w-2 h-2 rotate-45 mx-auto -mt-1 rounded-sm"
                     style={{ background: TIER_PALETTE[hoveredIdx % TIER_PALETTE.length].hex }} />
              </div>
            )}
          </div>

          {/* The bar */}
          <div className="relative h-10 rounded-xl overflow-visible">
            {/* Tier segments */}
            <div className="absolute inset-0 flex rounded-xl overflow-hidden border border-border/40">
              {tierSegments.map((seg, idx) => {
                const p = TIER_PALETTE[idx % TIER_PALETTE.length];
                const isActive = idx === currentTierIndex;
                const isPast = idx < currentTierIndex;
                const opacity = isPast ? '1' : isActive ? '1' : '0.25';
                return (
                  <div
                    key={idx}
                    className="h-full relative cursor-pointer transition-all duration-150 select-none flex-shrink-0"
                    style={{
                      width: `${seg.widthPct}%`,
                      background: isPast || isActive
                        ? `linear-gradient(135deg, ${p.hex}dd, ${p.hex})`
                        : `${p.hex}22`,
                      opacity,
                      borderRight: idx < tiers.length - 1 ? '2px solid rgba(255,255,255,0.35)' : 'none',
                      boxShadow: isActive ? `inset 0 0 0 2px ${p.hex}88, inset 0 -3px 0 0 rgba(0,0,0,0.15)` : undefined,
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Tier label inside segment (hidden if too narrow) */}
                    {seg.widthPct > 12 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] font-bold text-white drop-shadow-sm leading-tight">
                          {tiers[idx].tierName || `T${idx + 1}`}
                        </span>
                        <span className="text-[9px] text-white/80 leading-tight">
                          {tiers[idx].agentSplitPercent}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pending GCI ghost marker */}
            {pendingMarkerPct !== null && pendingMarkerPct > markerPct && (
              <div
                className="absolute top-0 bottom-0 w-0.5 opacity-40 pointer-events-none"
                style={{ left: `${pendingMarkerPct}%`, background: '#f59e0b', zIndex: 3 }}
              />
            )}

            {/* ── Position marker (current GCI) ── */}
            <div
              className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
              style={{ left: `${markerPct}%`, zIndex: 4, transform: 'translateX(-50%)' }}
            >
              {/* Vertical line */}
              <div className="w-0.5 h-full bg-white drop-shadow-md" />
              {/* Diamond dot at top */}
              <div
                className="absolute -top-2.5 w-4 h-4 rotate-45 border-2 border-white shadow-md"
                style={{ background: activePalette.hex }}
              />
            </div>
          </div>

          {/* ── Threshold labels below bar ── */}
          <div className="relative h-5 mt-1">
            {tiers.map((tier, idx) => {
              const seg = tierSegments[idx];
              if (seg.leftPct > 97) return null;
              const isActive = idx === currentTierIndex;
              const p = TIER_PALETTE[idx % TIER_PALETTE.length];
              return (
                <div
                  key={idx}
                  className="absolute text-center"
                  style={{ left: `${seg.leftPct}%`, transform: 'translateX(-50%)' }}
                >
                  <span
                    className="text-[10px] font-semibold whitespace-nowrap"
                    style={{ color: isActive ? p.hex : undefined }}
                  >
                    {fmtCurrencyCompact(tier.fromCompanyDollar, true)}
                  </span>
                </div>
              );
            })}
            {/* Cap label at right end */}
            {lastTier.toCompanyDollar == null && (
              <div className="absolute right-0 text-[10px] text-muted-foreground/60">No cap</div>
            )}
          </div>
        </div>

        {/* ── PROGRESS STATS ROW ────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Current Progress</p>
            <p className="text-lg font-bold">{fmtCurrency(grossGCIYTD)}</p>
            {pendingGrossGCI > 0 && (
              <p className="text-[11px] text-amber-600 font-medium">+ {fmtCurrency(pendingGrossGCI)} pending</p>
            )}
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Next Tier At</p>
            {capReached ? (
              <p className="text-lg font-bold text-emerald-600">Max Tier ★</p>
            ) : nextTierThreshold != null ? (
              <p className="text-lg font-bold">{fmtCurrency(nextTierThreshold)}</p>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">—</p>
            )}
            {!capReached && tp.nextTierName && (
              <p className="text-[11px] text-muted-foreground">{tp.nextTierName}</p>
            )}
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Remaining</p>
            {capReached ? (
              <p className="text-lg font-bold text-emerald-600">Capped</p>
            ) : remainToNext > 0 ? (
              <p className="text-lg font-bold" style={{ color: activePalette.hex }}>{fmtCurrency(remainToNext)}</p>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">—</p>
            )}
            {!capReached && remainToNext > 0 && (
              <p className="text-[11px] text-muted-foreground">to next tier</p>
            )}
          </div>
        </div>

        {/* ── FOOTER META ROW ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">Gross GCI</span>
            {fmtCurrency(grossGCIYTD)}
          </span>
          {effectiveStartDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Started {fmtDate(effectiveStartDate)}
            </span>
          )}
          {daysUntilReset != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {daysUntilReset} days until reset
              {anniversaryDate ? ` (${fmtDate(anniversaryDate)})` : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
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

function ReportCardSection({ dashboard, perfData, perfYear }: {
  dashboard: AgentDashboardData;
  perfData: AgentMetricsResponse | null;
  perfYear: number;
}) {
  // Use perfData for income/volume/sales so grades are consistent with MyPerformanceSection and ChartsSection.
  // Fall back to dashboard fields only when perfData hasn't loaded yet.
  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYearRC = perfYear === currentYear;
  const daysInYearRC = (perfYear % 4 === 0 && (perfYear % 100 !== 0 || perfYear % 400 === 0)) ? 366 : 365;
  const daysElapsedRC = Math.floor((today.getTime() - new Date(perfYear, 0, 1).getTime()) / 86400000) + 1;
  const ytdFractionRC = isCurrentYearRC ? Math.min(1, daysElapsedRC / daysInYearRC) : 1;

  const rcTotals = perfData?.overview?.totals;
  const rcMonths = perfData?.overview?.months;

  // Compute YTD goals from monthly goal data (same formula as MyPerformanceSection)
  const rcYearlyIncomeGoal = rcMonths ? rcMonths.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) : 0;
  const rcYearlyVolumeGoal = rcMonths ? rcMonths.reduce((s, m) => s + (m.volumeGoal ?? 0), 0) : 0;
  const rcYearlySalesGoal = rcMonths ? rcMonths.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) : 0;

  // Use perfData values when available, fall back to dashboard
  const netEarned = rcTotals ? rcTotals.netIncome : dashboard.netEarned;
  const netPending = rcTotals ? rcTotals.pendingNetIncome : dashboard.netPending;
  const ytdTotalPotential = netEarned + netPending;
  const ytdIncomeGoal = rcYearlyIncomeGoal > 0
    ? Math.round(rcYearlyIncomeGoal * ytdFractionRC)
    : dashboard.expectedYTDIncomeGoal;

  const incomeDelta = ytdIncomeGoal > 0 ? netEarned - ytdIncomeGoal : 0;
  const incomePct = ytdIncomeGoal > 0 ? Math.round((netEarned / ytdIncomeGoal) * 100) : 0;
  const incomeDeltaPct = ytdIncomeGoal > 0 ? Math.round((incomeDelta / ytdIncomeGoal) * 100) : 0;
  const pipelinePct = ytdIncomeGoal > 0 ? Math.round((ytdTotalPotential / ytdIncomeGoal) * 100) : 0;
  const pipelineDeltaPct = ytdIncomeGoal > 0 ? Math.round(((ytdTotalPotential - ytdIncomeGoal) / ytdIncomeGoal) * 100) : 0;
  const vm = dashboard.volumeMetrics;
  const engGoal = dashboard.engagementGoalToDate ?? dashboard.kpis?.engagements?.target ?? 0;
  const engActual = dashboard.kpis?.engagements?.actual ?? 0;
  const engPct = engGoal > 0 ? Math.round((engActual / engGoal) * 100) : 0;
  const engDeltaPct = engGoal > 0 ? Math.round(((engActual - engGoal) / engGoal) * 100) : 0;

  // Helper: format pace text
  const paceText = (deltaPct: number, goalStr: string) =>
    deltaPct >= 0
      ? `${Math.abs(deltaPct)}% ahead of pace · ${goalStr} YTD goal`
      : `${Math.abs(deltaPct)}% behind pace · ${goalStr} YTD goal`;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Report Card</h2>

      {/* Row 1: Income */}
      <div className="grid gap-4 md:grid-cols-2">
        <HeroCard
          title="Net Income YTD" grade={ytdIncomeGoal > 0 ? letterGrade(incomePct).letter : dashboard.incomeGrade} primary={fmtCurrency(netEarned)}
          performancePct={ytdIncomeGoal > 0 ? incomePct : undefined}
          secondary={ytdIncomeGoal > 0 ? paceText(incomeDeltaPct, fmtCurrency(ytdIncomeGoal)) : 'No income goal set'}
          icon={DollarSign} isGracePeriod={dashboard.isMetricsGracePeriod}
        />
        <HeroCard
          title="Pipeline Net Income" grade={ytdIncomeGoal > 0 ? letterGrade(pipelinePct).letter : dashboard.pipelineAdjustedIncome.grade} primary={fmtCurrency(ytdTotalPotential)}
          performancePct={ytdIncomeGoal > 0 ? pipelinePct : undefined}
          secondary={ytdIncomeGoal > 0
            ? (() => {
                const projGoal = vm?.projectedIncomeGoal ?? ytdIncomeGoal;
                const projPct = projGoal > 0 ? Math.round(((ytdTotalPotential - projGoal) / projGoal) * 100) : 0;
                return (projPct >= 0 ? `${Math.abs(projPct)}% ahead` : `${Math.abs(projPct)}% behind`) + ` · ${fmtCurrency(projGoal)} projected goal · ${fmtCurrency(netPending)} pending`;
              })()
            : `${fmtCurrency(netPending)} pending · closed + pipeline`}
          icon={TrendingUp} isGracePeriod={dashboard.isMetricsGracePeriod}
        />
      </div>

      {/* Row 2: Deals & Volume */}
      {vm && (
        <div className="grid gap-4 md:grid-cols-2">
          <HeroCard
            title="Deals Closed" grade={vm.dealsGrade} primary={`${vm.closedDeals} closed`}
            performancePct={vm.dealsGoal != null ? Math.round(vm.dealsPerformance) : undefined}
            secondary={vm.dealsGoal != null
              ? (vm.dealsPerformance >= 100 ? `${Math.round(vm.dealsPerformance - 100)}% ahead of pace` : `${Math.round(100 - vm.dealsPerformance)}% behind pace`) + ` · ${fmtNum(vm.dealsGoal)} deals YTD goal · ${vm.pendingDeals} pending`
              : `${vm.pendingDeals} pending · No goal set`}
            icon={BarChart3} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
          <HeroCard
            title="Pipeline Sales" grade={vm.projectedDealsGrade} primary={`${vm.closedDeals + vm.pendingDeals} total`}
            performancePct={vm.dealsGoal != null ? Math.round(vm.projectedDealsPerformance) : undefined}
            secondary={vm.dealsGoal != null
              ? (() => {
                  const projDGoal = vm.projectedDealsGoal ?? vm.dealsGoal;
                  return (vm.projectedDealsPerformance >= 100 ? `${Math.round(vm.projectedDealsPerformance - 100)}% ahead` : `${Math.round(100 - vm.projectedDealsPerformance)}% behind`) + ` · ${fmtNum(projDGoal ?? 0)} projected goal · ${vm.pendingDeals} pending`;
                })()
              : `${vm.closedDeals} closed + ${vm.pendingDeals} pending`}
            icon={TrendingUp} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
          <HeroCard
            title="$ Volume Sold" grade={vm.volumeGrade} primary={fmtCurrency(vm.closedVolume)}
            performancePct={vm.volumeGoal != null ? Math.round(vm.volumePerformance) : undefined}
            secondary={vm.volumeGoal != null
              ? (vm.volumePerformance >= 100 ? `${Math.round(vm.volumePerformance - 100)}% ahead of pace` : `${Math.round(100 - vm.volumePerformance)}% behind pace`) + ` · ${fmtCurrency(vm.volumeGoal)} YTD goal`
              : `${fmtCurrency(vm.pendingVolume)} pending · No goal set`}
            icon={DollarSign} isGracePeriod={dashboard.isMetricsGracePeriod}
          />
          <HeroCard
            title="Pipeline $ Volume Sold" grade={vm.projectedVolumeGrade} primary={fmtCurrency(vm.totalVolume)}
            performancePct={vm.volumeGoal != null ? Math.round(vm.projectedVolumePerformance) : undefined}
            secondary={vm.volumeGoal != null
              ? (() => {
                  const projVolGoal = vm.projectedVolumeGoal ?? vm.volumeGoal;
                  return (vm.projectedVolumePerformance >= 100 ? `${Math.round(vm.projectedVolumePerformance - 100)}% ahead` : `${Math.round(100 - vm.projectedVolumePerformance)}% behind`) + ` · ${fmtCurrency(projVolGoal ?? 0)} projected goal · ${fmtCurrency(vm.pendingVolume)} pending`;
                })()
              : `${fmtCurrency(vm.pendingVolume)} pending · Closed + pending volume`}
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

function ChartsSection({ perfData, perfLoading, perfError, year, compareYear, setCompareYear }: {
  perfData: AgentMetricsResponse | null; perfLoading: boolean; perfError: string | null;
  year: number; compareYear: number | null; setCompareYear: (y: number | null) => void;
}) {
  const [showProjected, setShowProjected] = useState(false);
  const [showGoals, setShowGoals] = useState(true);

  if (perfLoading) return <Skeleton className="h-80" />;
  if (perfError) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Failed to load performance data</AlertTitle><AlertDescription>{perfError}</AlertDescription></Alert>;
  if (!perfData?.overview) return <Skeleton className="h-80" />;

  const { overview, agentView } = perfData;
  const { months } = overview;
  const { monthlyNetIncome, monthlyPendingNetIncome } = agentView;

  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYear = year === currentYear;
  const currentMonthIdx = isCurrentYear ? today.getMonth() : 11;

  // Helper: compute projected future months from YTD actuals + goal seasonality
  function computeProjection(actualArr: number[], goalArr: (number | null)[]): (number | null)[] {
    if (!isCurrentYear) return actualArr.map(() => null);
    const numGoals: number[] = goalArr.map(v => v ?? 0);
    const yearlyGoal: number = numGoals.reduce((s: number, v: number) => s + v, 0);
    const ytdActual: number = actualArr.slice(0, currentMonthIdx + 1).reduce((s: number, v: number) => s + v, 0);
    const ytdGoalShare: number = yearlyGoal > 0
      ? numGoals.slice(0, currentMonthIdx + 1).reduce((s: number, v: number) => s + v, 0) / yearlyGoal
      : (currentMonthIdx + 1) / 12;
    const projFull = ytdGoalShare > 0 ? ytdActual / ytdGoalShare : ytdActual * (12 / (currentMonthIdx + 1));
    return actualArr.map((_, i) => {
      if (i <= currentMonthIdx) return null;
      const share = yearlyGoal > 0 ? numGoals[i] / yearlyGoal : 1 / 12;
      return Math.round(projFull * share);
    });
  }

  const incomeGoalArr = months.map(m => m.grossMarginGoal);
  const volumeGoalArr = months.map(m => m.volumeGoal);
  const salesGoalArr = months.map(m => m.salesCountGoal);
  const hasIncomeGoal = incomeGoalArr.some(v => (v ?? 0) > 0);

  const projNetIncome = computeProjection(monthlyNetIncome, incomeGoalArr);
  const projVolume = computeProjection(months.map(m => m.closedVolume), volumeGoalArr);
  const projSales = computeProjection(months.map(m => m.closedCount), salesGoalArr);
  const projectionLabel = hasIncomeGoal ? 'Seasonality-Based Projection' : 'Straight-Line Projection';

  // Full-year projections for summary banner
  const fullYearProjection = (() => {
    if (!isCurrentYear) return null;
    const completedMonths = months.slice(0, currentMonthIdx + 1);
    const calcFull = (actuals: number[], goalKey: 'grossMarginGoal' | 'volumeGoal' | 'salesCountGoal') => {
      const ytd = actuals.reduce((s, v) => s + v, 0);
      const yearlyGoal = months.reduce((s, m) => s + (m[goalKey] ?? 0), 0);
      const share = yearlyGoal > 0 ? completedMonths.reduce((s, m) => s + (m[goalKey] ?? 0), 0) / yearlyGoal : (currentMonthIdx + 1) / 12;
      return share > 0 ? Math.round(ytd / share) : Math.round(ytd * 12 / (currentMonthIdx + 1));
    };
    return {
      netIncome: calcFull(monthlyNetIncome.slice(0, currentMonthIdx + 1), 'grossMarginGoal'),
      volume: calcFull(completedMonths.map(m => m.closedVolume), 'volumeGoal'),
      sales: calcFull(completedMonths.map(m => m.closedCount), 'salesCountGoal'),
    };
  })();

  // YTD grades for all three charts
  const ytdMonthsCount = currentMonthIdx + 1;
  const ytdNetIncomeActual: number = monthlyNetIncome.slice(0, ytdMonthsCount).reduce((s: number, v: number) => s + v, 0);
  const ytdNetIncomeGoal: number = incomeGoalArr.slice(0, ytdMonthsCount).reduce((s: number, v: number | null) => s + (v ?? 0), 0);
  const gradeNetIncome = ytdNetIncomeGoal > 0 ? Math.round((ytdNetIncomeActual / ytdNetIncomeGoal) * 100) : null;

  const ytdVolumeActual: number = months.slice(0, ytdMonthsCount).reduce((s: number, m) => s + m.closedVolume, 0);
  const ytdVolumeGoal: number = volumeGoalArr.slice(0, ytdMonthsCount).reduce((s: number, v: number | null) => s + (v ?? 0), 0);
  const gradeVolume = ytdVolumeGoal > 0 ? Math.round((ytdVolumeActual / ytdVolumeGoal) * 100) : null;

  const ytdSalesActual: number = months.slice(0, ytdMonthsCount).reduce((s: number, m) => s + m.closedCount, 0);
  const ytdSalesGoal: number = salesGoalArr.slice(0, ytdMonthsCount).reduce((s: number, v: number | null) => s + (v ?? 0), 0);
  const gradeSales = ytdSalesGoal > 0 ? Math.round((ytdSalesActual / ytdSalesGoal) * 100) : null;

  const ctrlRow = (
    <div className="flex items-center gap-2 flex-wrap">
      <CompareSelector value={compareYear} onChange={setCompareYear} years={perfData.availableYears ?? []} />
      <button type="button" onClick={() => setShowGoals(g => !g)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showGoals ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
        Goals
      </button>
      {isCurrentYear && (
        <button type="button" onClick={() => setShowProjected(p => !p)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showProjected ? 'bg-amber-500 text-white border-amber-500' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
          📈 Projected
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {showProjected && isCurrentYear && (
        <p className="text-xs text-amber-600 font-medium -mb-2">
          📈 {projectionLabel} — forward months extrapolated from YTD pace
        </p>
      )}

      {/* CHART 1: Monthly Net Income */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Net Income</CardTitle><CardDescription>Income after broker split — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription></div>
            {ctrlRow}
          </div>
          {gradeNetIncome && (() => { const g = letterGrade(gradeNetIncome); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? 'YTD Grade (as of today)' : 'Full Year Grade'}
                </p>
                <p className="text-sm font-semibold">
                  {fmtCurrencyCompact(ytdNetIncomeActual, true)} <span className="text-muted-foreground font-normal">/ {fmtCurrencyCompact(ytdNetIncomeGoal, true)} goal</span>
                </p>
                {compareYear && perfData.comparisonData && (() => {
                  const compYTD = perfData.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                  const diff = ytdNetIncomeActual - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{fmtCurrencyCompact(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
                })()}
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className={`text-5xl font-black leading-none ${g.color}`}>{g.letter}</span>
                <span className={`text-xl font-bold ${g.color}`}>{gradeNetIncome}%</span>
              </div>
            </div>
          ); })()}
        </CardHeader>
        <CardContent>
          <ChartContainer config={incomeChartConfig} className="h-[350px] w-full">
            <BarChart data={months.map((m, i) => ({
              label: m.label,
              netIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyNetIncome[i] || 0),
              pendingNetIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyPendingNetIncome[i] || 0),
              incomeGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.grossMarginGoal) : null,
              compareIncome: compareYear ? (perfData.comparisonData?.months?.[i]?.netIncome ?? null) : null,
              projectedNetIncome: showProjected ? (projNetIncome[i] ?? null) : null,
            }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => fmtCurrencyCompact(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { netIncome: `${year} Income`, pendingNetIncome: 'Pending', incomeGoal: 'Goal', compareIncome: `${compareYear ?? ''} Income`, projectedNetIncome: 'Projected' }; return [fmtCurrencyCompact(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="netIncome" fill="var(--color-netIncome)" radius={[4, 4, 0, 0]} name={`${year}`} />
              {compareYear && <Bar dataKey="compareIncome" fill="var(--color-compareIncome)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingNetIncome" fill="var(--color-pendingNetIncome)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              {showGoals && <Bar dataKey="incomeGoal" fill="var(--color-incomeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedNetIncome" fill="var(--color-projectedNetIncome)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
            </BarChart>
          </ChartContainer>
          {(compareYear && perfData.comparisonData || showProjected && fullYearProjection) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && perfData.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const compNetYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const compVolYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedVolume ?? 0), 0);
                const compSalesYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedCount ?? 0), 0);
                const diff = ytdNetIncomeActual - compNetYTD;
                const pctChange = compNetYTD > 0 ? (diff / compNetYTD * 100) : 0;
                const yoyPct = compNetYTD > 0 ? Math.round((ytdNetIncomeActual / compNetYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Margin vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{fmtCurrencyCompact(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Volume</span><p className="font-semibold">{fmtCurrencyCompact(compVolYTD, true)}</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Sales</span><p className="font-semibold">{fmtNumNull(compSalesYTD)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && fullYearProjection && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.netIncome, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.volume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{fmtNumNull(fullYearProjection.sales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CHART 2: Monthly Volume */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Dollar Volume</CardTitle><CardDescription>Closed and pending — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription></div>
            {ctrlRow}
          </div>
          {gradeVolume && (() => { const g = letterGrade(gradeVolume); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? 'YTD Grade (as of today)' : 'Full Year Grade'}
                </p>
                <p className="text-sm font-semibold">
                  {fmtCurrencyCompact(ytdVolumeActual, true)} <span className="text-muted-foreground font-normal">/ {fmtCurrencyCompact(ytdVolumeGoal, true)} goal</span>
                </p>
                {compareYear && perfData.comparisonData && (() => {
                  const compYTD = perfData.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + (m.closedVolume ?? 0), 0);
                  const diff = ytdVolumeActual - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{fmtCurrencyCompact(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
                })()}
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className={`text-5xl font-black leading-none ${g.color}`}>{g.letter}</span>
                <span className={`text-xl font-bold ${g.color}`}>{gradeVolume}%</span>
              </div>
            </div>
          ); })()}
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({
              ...m,
              closedVolume: isCurrentYear && i > currentMonthIdx ? null : m.closedVolume,
              pendingVolume: isCurrentYear && i > currentMonthIdx ? null : m.pendingVolume,
              volumeGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.volumeGoal) : null,
              compareVolume: compareYear ? (perfData.comparisonData?.months?.[i]?.closedVolume ?? null) : null,
              projectedVolume: showProjected ? (projVolume[i] ?? null) : null,
            }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => fmtCurrencyCompact(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { closedVolume: `${year} Closed`, pendingVolume: 'Pending', volumeGoal: 'Goal', compareVolume: `${compareYear ?? ''} Volume`, projectedVolume: 'Projected' }; return [fmtCurrencyCompact(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedVolume" fill="var(--color-closedVolume)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareVolume" fill="var(--color-compareVolume)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingVolume" fill="var(--color-pendingVolume)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              {showGoals && <Bar dataKey="volumeGoal" fill="var(--color-volumeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedVolume" fill="var(--color-projectedVolume)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
            </BarChart>
          </ChartContainer>
          {(compareYear && perfData.comparisonData || showProjected && fullYearProjection) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && perfData.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const ytdActualVol = months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compVolYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedVolume ?? 0), 0);
                const compSalesYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedCount ?? 0), 0);
                const compNetYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const diff = ytdActualVol - compVolYTD;
                const pctChange = compVolYTD > 0 ? (diff / compVolYTD * 100) : 0;
                const yoyPct = compVolYTD > 0 ? Math.round((ytdActualVol / compVolYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Volume vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{fmtCurrencyCompact(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Income</span><p className="font-semibold">{fmtCurrencyCompact(compNetYTD, true)}</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Sales</span><p className="font-semibold">{fmtNumNull(compSalesYTD)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && fullYearProjection && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.volume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.netIncome, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{fmtNumNull(fullYearProjection.sales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CHART 3: Monthly Sales */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><CardTitle>Monthly Number of Sales</CardTitle><CardDescription>Closed and pending — {year}{compareYear ? ` vs ${compareYear}` : ''}{showProjected ? ' + Projected' : ''}</CardDescription></div>
            {ctrlRow}
          </div>
          {gradeSales && (() => { const g = letterGrade(gradeSales); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? 'YTD Grade (as of today)' : 'Full Year Grade'}
                </p>
                <p className="text-sm font-semibold">
                  {ytdSalesActual} sales <span className="text-muted-foreground font-normal">/ {ytdSalesGoal} goal</span>
                </p>
                {compareYear && perfData.comparisonData && (() => {
                  const compYTD = perfData.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + (m.closedCount ?? 0), 0);
                  const diff = ytdSalesActual - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{diff} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
                })()}
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className={`text-5xl font-black leading-none ${g.color}`}>{g.letter}</span>
                <span className={`text-xl font-bold ${g.color}`}>{gradeSales}%</span>
              </div>
            </div>
          ); })()}
        </CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <BarChart data={months.map((m, i) => ({
              ...m,
              closedCount: isCurrentYear && i > currentMonthIdx ? null : m.closedCount,
              pendingCount: isCurrentYear && i > currentMonthIdx ? null : m.pendingCount,
              salesCountGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.salesCountGoal) : null,
              compareCount: compareYear ? (perfData.comparisonData?.months?.[i]?.closedCount ?? null) : null,
              projectedCount: showProjected ? (projSales[i] ?? null) : null,
            }))} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => { const labels: Record<string, string> = { closedCount: `${year} Closed`, pendingCount: 'Pending', salesCountGoal: 'Goal', compareCount: `${compareYear ?? ''} Sales`, projectedCount: 'Projected' }; return [fmtNumNull(Number(v)), labels[name as string] ?? name]; }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedCount" fill="var(--color-closedCount)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareCount" fill="var(--color-compareCount)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              <Bar dataKey="pendingCount" fill="var(--color-pendingCount)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />
              {showGoals && <Bar dataKey="salesCountGoal" fill="var(--color-salesCountGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedCount" fill="var(--color-projectedCount)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
            </BarChart>
          </ChartContainer>
          {(compareYear && perfData.comparisonData || showProjected && fullYearProjection) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && perfData.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const ytdActualSales = months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const compSalesYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedCount ?? 0), 0);
                const compVolYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.closedVolume ?? 0), 0);
                const compNetYTD = perfData.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const diff = ytdActualSales - compSalesYTD;
                const pctChange = compSalesYTD > 0 ? (diff / compSalesYTD * 100) : 0;
                const yoyPct = compSalesYTD > 0 ? Math.round((ytdActualSales / compSalesYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Sales vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{fmtNumNull(diff)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Income</span><p className="font-semibold">{fmtCurrencyCompact(compNetYTD, true)}</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Volume</span><p className="font-semibold">{fmtCurrencyCompact(compVolYTD, true)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && fullYearProjection && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{fmtNumNull(fullYearProjection.sales)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.volume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Income</span><p className="font-semibold text-amber-600">{fmtCurrencyCompact(fullYearProjection.netIncome, true)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5b. MULTI-YEAR PRODUCTION COMPARISON (Agent-scoped)
// ═══════════════════════════════════════════════════════════════════════════════

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

type AgentMultiYearData = {
  year: number;
  months: { month: number; label: string; netIncome: number; volume: number; sales: number; gci: number }[];
  totals: { netIncome: number; volume: number; sales: number; gci: number };
};

function AgentMultiYearComparison({ view, viewAs }: { view: 'personal' | 'team'; viewAs: string | null }) {
  const { user } = useUser();
  const [allYears, setAllYears] = useState<AgentMultiYearData[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<'netIncome' | 'volume' | 'sales'>('netIncome');
  const [chartView, setChartView] = useState<'month' | 'quarter' | 'year'>('month');
  const [compareMode, setCompareMode] = useState<'full' | 'ytd'>('ytd');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ view });
        if (viewAs) params.set('viewAs', viewAs);
        const res = await fetch(`/api/agent/multi-year-compare?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.years) {
          setAllYears(data.years);
          const yrs = data.years.map((y: AgentMultiYearData) => y.year);
          setSelectedYears(yrs.length > 5 ? yrs.slice(-5) : yrs);
        }
      } catch (err) {
        console.error('[agent/multi-year]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, view, viewAs]);

  const toggleYear = (yr: number) => setSelectedYears(prev =>
    prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr]
  );

  const todayMY = new Date();
  const currentYearMY = todayMY.getFullYear();
  const currentMonthIdxMY = todayMY.getMonth();

  const getMonthLimit = (yrNum: number) => {
    if (compareMode === 'ytd') return currentMonthIdxMY;
    if (yrNum === currentYearMY) return currentMonthIdxMY;
    return 11;
  };

  const metricLabel = { netIncome: 'Net Income', volume: 'Dollar Volume', sales: 'Number of Sales' }[metric];
  const fmt = (val: number) => metric === 'sales' ? val.toLocaleString() : fmtCurrencyCompact(val, true);

  const chartData = (() => {
    const filtered = allYears.filter(y => selectedYears.includes(y.year));
    if (chartView === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const pt: Record<string, any> = { label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i] };
        for (const yr of filtered) {
          pt[String(yr.year)] = i > getMonthLimit(yr.year) ? null : (yr.months[i]?.[metric] ?? 0);
        }
        return pt;
      });
    }
    if (chartView === 'quarter') {
      return Array.from({ length: 4 }, (_, q) => {
        const pt: Record<string, any> = { label: QUARTER_LABELS[q] };
        for (const yr of filtered) {
          const limit = getMonthLimit(yr.year);
          const qMos = yr.months.slice(q * 3, Math.min(q * 3 + 3, limit + 1));
          pt[String(yr.year)] = qMos.length > 0 ? qMos.reduce((s, m) => s + (m[metric] ?? 0), 0) : null;
        }
        return pt;
      });
    }
    return filtered.map(yr => {
      const limit = getMonthLimit(yr.year);
      const val = compareMode === 'ytd' || yr.year === currentYearMY
        ? yr.months.slice(0, limit + 1).reduce((s, m) => s + (m[metric] ?? 0), 0)
        : yr.totals[metric] ?? 0;
      return { label: String(yr.year), value: val };
    });
  })();

  if (loading) return <Skeleton className="h-[500px] w-full" />;
  if (allYears.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Multi-Year Production Comparison
            </CardTitle>
            <CardDescription>Compare {metricLabel.toLowerCase()} across years — agent only</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Metric selector */}
            <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="netIncome">Net Income</SelectItem>
                <SelectItem value="volume">Dollar Volume</SelectItem>
                <SelectItem value="sales">Number of Sales</SelectItem>
              </SelectContent>
            </Select>
            {/* View toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['month', 'quarter', 'year'] as const).map(v => (
                <button key={v} type="button" onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${chartView === v ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
                  {v === 'month' ? 'Monthly' : v === 'quarter' ? 'Quarterly' : 'Yearly'}
                </button>
              ))}
            </div>
            {/* YTD / Full toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['full', 'ytd'] as const).map(m => (
                <button key={m} type="button" onClick={() => setCompareMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${compareMode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
                  {m === 'full' ? 'Full Year' : `YTD (thru ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonthIdxMY]})`}
                </button>
              ))}
            </div>
            {/* Year pills */}
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground mr-1">Years:</span>
              {allYears.map((yr, idx) => (
                <button key={yr.year} type="button" onClick={() => toggleYear(yr.year)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedYears.includes(yr.year) ? 'text-white border-transparent' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}
                  style={selectedYears.includes(yr.year) ? { backgroundColor: YEAR_COLORS[idx % YEAR_COLORS.length] } : undefined}>
                  {yr.year}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedYears(allYears.map(y => y.year))} className="px-2 py-1 text-xs text-blue-600 hover:underline">All</button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          {chartView === 'year' ? (
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(val: number) => [fmt(val), metricLabel]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} name={metricLabel}>
                {chartData.map((entry: any, idx: number) => {
                  const yrIdx = allYears.findIndex(y => String(y.year) === entry.label);
                  return <Cell key={idx} fill={YEAR_COLORS[(yrIdx >= 0 ? yrIdx : idx) % YEAR_COLORS.length]} />;
                })}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(val: number, name: string) => [fmt(val), name]} />
              <Legend />
              {allYears.filter(yr => selectedYears.includes(yr.year)).map((yr) => {
                const colorIdx = allYears.findIndex(y => y.year === yr.year);
                return (
                  <Bar key={yr.year} dataKey={String(yr.year)} fill={YEAR_COLORS[colorIdx % YEAR_COLORS.length]} radius={[4, 4, 0, 0]} name={String(yr.year)} />
                );
              })}
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Summary table */}
        <div className="mt-6 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Year</th>
                <th className="px-4 py-2 text-right font-medium">Net Income</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="px-4 py-2 text-right font-medium">Sales</th>
                <th className="px-4 py-2 text-right font-medium">YoY Change</th>
              </tr>
            </thead>
            <tbody>
              {allYears.filter(yr => selectedYears.includes(yr.year)).sort((a, b) => b.year - a.year).map((yr, idx, arr) => {
                const ytdCutoff = currentMonthIdxMY + 1;
                const ytdVal = yr.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0);
                const prev = arr[idx + 1];
                const prevYtdVal = prev ? prev.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0) : null;
                const change = prevYtdVal && prevYtdVal > 0 ? ((ytdVal - prevYtdVal) / prevYtdVal * 100) : null;
                const limit = getMonthLimit(yr.year);
                const displayVal = compareMode === 'ytd' || yr.year === currentYearMY
                  ? yr.months.slice(0, limit + 1).reduce((s, m) => s + m[metric], 0)
                  : yr.totals[metric] ?? 0;
                const colorIdx = allYears.findIndex(y => y.year === yr.year);
                return (
                  <tr key={yr.year} className="border-t">
                    <td className="px-4 py-2 font-medium flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: YEAR_COLORS[colorIdx % YEAR_COLORS.length] }} />
                      {yr.year}{compareMode === 'ytd' && <span className="text-xs text-muted-foreground ml-1">YTD</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtCurrencyCompact(yr.months.slice(0, limit + 1).reduce((s, m) => s + m.netIncome, 0), true)}</td>
                    <td className="px-4 py-2 text-right">{fmtCurrencyCompact(yr.months.slice(0, limit + 1).reduce((s, m) => s + m.volume, 0), true)}</td>
                    <td className="px-4 py-2 text-right">{yr.months.slice(0, limit + 1).reduce((s, m) => s + m.sales, 0).toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right font-medium ${change !== null ? (change >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                      {change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CATEGORY & SOURCE BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════════════

const CAT_LABELS: Record<string, string> = {
  residential_sale: 'Residential Sale',
  commercial_sale: 'Commercial Sale',
  commercial_lease: 'Commercial Lease',
  land: 'Land',
  rental: 'Rental / Lease',
};
const CAT_KEYS = ['residential_sale', 'commercial_sale', 'commercial_lease', 'land', 'rental'] as const;
const CAT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const SOURCE_LABELS: Record<string, string> = {
  boomtown: 'Boomtown', referral: 'Referral', sphere: 'Sphere of Influence',
  sign_call: 'Sign Call', company_gen: 'Company Generated', social: 'Social Media',
  open_house: 'Open House', fsbo: 'FSBO', expired_listing: 'Expired Listing', other: 'Other',
};
const SOURCE_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];

function CategoryBreakdownSection({ perfData, year }: {
  perfData: AgentMetricsResponse;
  year: number;
}) {
  const { categoryBreakdown, sourceBreakdown } = perfData.overview;

  const catSalesData = CAT_KEYS
    .map((k, i) => ({ name: CAT_LABELS[k], value: categoryBreakdown.closed[k].count, color: CAT_COLORS[i] }))
    .filter(d => d.value > 0);

  if (catSalesData.length === 0) return null;

  const catVolumeData = CAT_KEYS
    .map((k, i) => ({ name: CAT_LABELS[k], value: categoryBreakdown.closed[k].volume, color: CAT_COLORS[i] }))
    .filter(d => d.value > 0);
  const catNetIncomeData = CAT_KEYS
    .map((k, i) => ({ name: CAT_LABELS[k], value: categoryBreakdown.closed[k].netRevenue, color: CAT_COLORS[i] }))
    .filter(d => d.value > 0);

  const sourceEntries = Object.entries(sourceBreakdown?.closed ?? {})
    .sort((a, b) => b[1].count - a[1].count);
  const sourceSalesData = sourceEntries
    .filter(([, v]) => v.count > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  const sourceVolumeData = sourceEntries
    .filter(([, v]) => v.volume > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.volume, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  const sourceNetIncomeData = sourceEntries
    .filter(([, v]) => v.netRevenue > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.netRevenue, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

  const renderPie = (data: { name: string; value: number; color: string }[], formatter: (v: number) => string, title: string) => (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold mb-2 text-center">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
            label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(val: any) => formatter(Number(val))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}: {formatter(d.value)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Breakdown — {year}</CardTitle>
        <CardDescription>Closed transactions by property type — net income, sales count, and dollar volume</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Category pie charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {renderPie(catNetIncomeData, v => fmtCurrencyCompact(v, true), 'Net Income by Type')}
          {renderPie(catSalesData, v => `${v} sale${v !== 1 ? 's' : ''}`, 'Sales Count by Type')}
          {renderPie(catVolumeData, v => fmtCurrencyCompact(v, true), 'Dollar Volume by Type')}
        </div>

        {/* Category detail table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Closed</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="px-4 py-2 text-right font-medium">Net Income</th>
                <th className="px-4 py-2 text-right font-medium">Pending</th>
              </tr>
            </thead>
            <tbody>
              {CAT_KEYS.map((k, i) => {
                const c = categoryBreakdown.closed[k];
                const p = categoryBreakdown.pending[k];
                if (c.count === 0 && p.count === 0) return null;
                return (
                  <tr key={k} className="border-t">
                    <td className="px-4 py-2 flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                      {CAT_LABELS[k]}
                    </td>
                    <td className="px-4 py-2 text-right">{c.count}</td>
                    <td className="px-4 py-2 text-right">{fmtCurrencyCompact(c.volume, true)}</td>
                    <td className="px-4 py-2 text-right">{fmtCurrencyCompact(c.netRevenue, true)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {p.count > 0 ? `${p.count} (${fmtCurrencyCompact(p.volume, true)})` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Source of business breakdown */}
        {sourceSalesData.length > 0 && (
          <>
            <div>
              <p className="font-semibold text-sm">Breakdown by Lead Source</p>
              <p className="text-xs text-muted-foreground">Closed transactions grouped by how the lead originated</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {renderPie(sourceNetIncomeData, v => fmtCurrencyCompact(v, true), 'Net Income by Source')}
              {renderPie(sourceSalesData, v => `${v} sale${v !== 1 ? 's' : ''}`, 'Sales by Source')}
              {renderPie(sourceVolumeData, v => fmtCurrencyCompact(v, true), 'Volume by Source')}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Lead Source</th>
                    <th className="px-4 py-2 text-right font-medium">Closed</th>
                    <th className="px-4 py-2 text-right font-medium">Volume</th>
                    <th className="px-4 py-2 text-right font-medium">Net Income</th>
                    <th className="px-4 py-2 text-right font-medium">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceEntries.map(([k, c], i) => {
                    const p = sourceBreakdown?.pending?.[k];
                    return (
                      <tr key={k} className="border-t">
                        <td className="px-4 py-2 flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                          {SOURCE_LABELS[k] ?? k}
                        </td>
                        <td className="px-4 py-2 text-right">{c.count}</td>
                        <td className="px-4 py-2 text-right">{fmtCurrencyCompact(c.volume, true)}</td>
                        <td className="px-4 py-2 text-right">{fmtCurrencyCompact(c.netRevenue, true)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {p && p.count > 0 ? `${p.count} (${fmtCurrencyCompact(p.volume, true)})` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
        <Table><TableHeader><TableRow><TableHead>Address</TableHead><TableHead>Client</TableHead><TableHead>Contract Date</TableHead><TableHead>Est. Close</TableHead><TableHead className="text-right">Sale Price</TableHead><TableHead className="text-right">Projected Net Income</TableHead></TableRow></TableHeader>
          <TableBody>{pending.map(t => { const projNet = (t as any).netIncome ?? (t as any).netCommission ?? null; return (<TableRow key={t.id}><TableCell className="font-medium">{t.address}</TableCell><TableCell>{t.clientName ?? '—'}</TableCell><TableCell>{formatDate(t.contractDate)}</TableCell><TableCell><span className="text-sm">{formatDate(t.closedDate ?? t.closingDate)}</span>{(t.closedDate || t.closingDate) && <span className="block text-xs text-muted-foreground">{getTimelineBucket(t.closedDate ?? t.closingDate)}</span>}</TableCell><TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell><TableCell className="text-right font-semibold text-primary">{projNet ? formatCurrencyLocal(projNet) : '—'}</TableCell></TableRow>); })}</TableBody></Table>
      )}</CardContent></Card>
  );
}

function ClosedTable({ transactions, year }: { transactions: Transaction[]; year: number }) {
  const closed = transactions.filter(t => t.status === 'closed' && (t.year === year || (t.closedDate ?? t.closingDate ?? '').startsWith(String(year)))).sort((a, b) => ((b.closedDate ?? b.closingDate ?? '') > (a.closedDate ?? a.closingDate ?? '') ? 1 : -1));
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Closed Transactions — {year}</CardTitle><CardDescription>All transactions you closed this calendar year.</CardDescription></CardHeader>
      <CardContent>{closed.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">No closed transactions for {year}.</p>) : (
        <Table><TableHeader><TableRow><TableHead>Address</TableHead><TableHead>Closed Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Sale Price</TableHead><TableHead className="text-right">Your Net Income</TableHead></TableRow></TableHeader>
          <TableBody>{closed.map(t => { const net = (t as any).netIncome ?? (t as any).netCommission ?? null; return (<TableRow key={t.id}><TableCell className="font-medium">{t.address}</TableCell><TableCell>{formatDate(t.closedDate ?? t.closingDate)}</TableCell><TableCell>{t.transactionType ? <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge> : '—'}</TableCell><TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell><TableCell className="text-right font-semibold text-primary">{net ? formatCurrencyLocal(net) : '—'}</TableCell></TableRow>); })}</TableBody></Table>
      )}</CardContent></Card>
  );
}
