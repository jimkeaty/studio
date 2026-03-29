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
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
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
import type { MonthlyData, CategoryMetrics, SourceBreakdown } from '@/lib/types/brokerCommandMetrics';
import { ActivityHistoryCard } from './ActivityHistoryCard';

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

// ── Shared constants (mirror Broker Command Center) ─────────────────────────

const YEAR_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SOURCE_LABELS: Record<string, string> = {
  boomtown: 'Boomtown', referral: 'Referral', sphere: 'Sphere of Influence',
  sign_call: 'Sign Call', company_gen: 'Company Generated', social: 'Social Media',
  open_house: 'Open House', fsbo: 'FSBO', expired_listing: 'Expired Listing', other: 'Other',
};
const SOURCE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];

// ── Letter grade (identical to Broker Command Center) ───────────────────────

function letterGrade(pct: number): { letter: string; color: string } {
  if (pct >= 90) return { letter: 'A', color: 'text-green-600' };
  if (pct >= 80) return { letter: 'B', color: 'text-blue-600' };
  if (pct >= 70) return { letter: 'C', color: 'text-yellow-600' };
  if (pct >= 60) return { letter: 'D', color: 'text-orange-600' };
  return { letter: 'F', color: 'text-red-600' };
}

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
    sourceBreakdown?: SourceBreakdown;
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

type AgentYearMonthData = {
  year: number;
  months: { month: number; label: string; netIncome: number; volume: number; sales: number; gci: number }[];
  totals: { netIncome: number; volume: number; sales: number; gci: number };
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

// ── Pie chart renderer (shared by category + source sections) ───────────────

function MiniPie({ data, formatter, title }: {
  data: { name: string; value: number; color: string }[];
  formatter: (v: number) => string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold mb-2 text-center">{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
            label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(val: number) => formatter(val)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            {d.name}: {formatter(d.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Multi-Year Production Comparison (agent version) ────────────────────────
// Mirrors BrokerDashboardInner MultiYearComparison, adapted for agent net income.
// Critical date rule: YoY Change always compares Jan–today for both years,
// never full-year prior vs current YTD.

function AgentMultiYearComparison({ view }: { view: 'personal' | 'team' }) {
  const { user } = useUser();
  const [allYears, setAllYears] = useState<AgentYearMonthData[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<'netIncome' | 'volume' | 'sales'>('netIncome');
  const [chartView, setChartView] = useState<'month' | 'quarter' | 'year'>('month');
  // YTD = cap all years at same calendar day as today; Full = show each year's full data
  const [compareMode, setCompareMode] = useState<'full' | 'ytd'>('ytd');
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth(); // 0-indexed

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ view });
        const res = await fetch(`/api/agent/multi-year-compare?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.years) {
          setAllYears(data.years);
          const yrs: number[] = data.years.map((y: AgentYearMonthData) => y.year);
          setSelectedYears(yrs.length > 5 ? yrs.slice(-5) : yrs);
        }
      } catch (err) {
        console.error('[agent/multi-year]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, view]);

  const toggleYear = (yr: number) =>
    setSelectedYears(prev => prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr]);

  const metricLabel = metric === 'netIncome' ? 'Net Income' : metric === 'volume' ? 'Dollar Volume' : 'Number of Sales';
  const metricFmt = (val: number) => metric === 'sales' ? val.toLocaleString() : formatCurrency(val, true);

  // Per-year month limit: ytd mode caps all years at today's calendar month;
  // full mode shows each year through end (or current month for current year).
  const getMonthLimit = (yr: number) => {
    if (compareMode === 'ytd') return currentMonthIdx; // 0-indexed inclusive
    return yr === currentYear ? currentMonthIdx : 11;
  };

  const chartData = (() => {
    const filtered = allYears.filter(y => selectedYears.includes(y.year));

    if (chartView === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const point: Record<string, any> = { label: MONTH_LABELS_SHORT[i] };
        for (const yr of filtered) {
          const limit = getMonthLimit(yr.year);
          point[String(yr.year)] = i > limit ? null : (yr.months[i]?.[metric] ?? 0);
        }
        return point;
      });
    }

    if (chartView === 'quarter') {
      return Array.from({ length: 4 }, (_, q) => {
        const point: Record<string, any> = { label: QUARTER_LABELS[q] };
        for (const yr of filtered) {
          const limit = getMonthLimit(yr.year);
          const qMonths = yr.months.slice(q * 3, Math.min(q * 3 + 3, limit + 1));
          point[String(yr.year)] = qMonths.length > 0
            ? qMonths.reduce((s, m) => s + (m[metric] ?? 0), 0) : null;
        }
        return point;
      });
    }

    // Year view
    return filtered.map(yr => {
      const limit = getMonthLimit(yr.year);
      const val = compareMode === 'ytd' || yr.year === currentYear
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
              <BarChart3 className="h-5 w-5" />
              Multi-Year Production Comparison
            </CardTitle>
            <CardDescription>
              Compare {metricLabel.toLowerCase()} across years
              {compareMode === 'ytd' ? ` — YTD through ${MONTH_LABELS_SHORT[currentMonthIdx]} ${currentYear}` : ' — Full Year'}
            </CardDescription>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Metric */}
            <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="netIncome">Net Income</SelectItem>
                <SelectItem value="volume">Dollar Volume</SelectItem>
                <SelectItem value="sales">Number of Sales</SelectItem>
              </SelectContent>
            </Select>

            {/* Granularity */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['month', 'quarter', 'year'] as const).map(v => (
                <button key={v} type="button" onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${chartView === v ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
                  {v === 'month' ? 'Monthly' : v === 'quarter' ? 'Quarterly' : 'Yearly'}
                </button>
              ))}
            </div>

            {/* Full Year / YTD toggle
                YTD = matched Jan–today across all years (the default, per requirements).
                Full Year = each historical year shown in full; current year still capped at today. */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['ytd', 'full'] as const).map(m => (
                <button key={m} type="button" onClick={() => setCompareMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${compareMode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
                  {m === 'ytd'
                    ? `YTD (thru ${MONTH_LABELS_SHORT[currentMonthIdx]})`
                    : 'Full Year'}
                </button>
              ))}
            </div>

            {/* Year chips */}
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground mr-1">Years:</span>
              {allYears.map((yr, idx) => (
                <button key={yr.year} type="button" onClick={() => toggleYear(yr.year)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedYears.includes(yr.year)
                    ? 'text-white border-transparent'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}
                  style={selectedYears.includes(yr.year) ? { backgroundColor: YEAR_COLORS[idx % YEAR_COLORS.length] } : undefined}>
                  {yr.year}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedYears(allYears.map(y => y.year))}
                className="px-2 py-1 text-xs text-blue-600 hover:underline">All</button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={380}>
          {chartView === 'year' ? (
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={metricFmt} />
              <Tooltip formatter={(val: number) => [metricFmt(val), metricLabel]} />
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
              <YAxis tickFormatter={metricFmt} />
              <Tooltip formatter={(val: number, name: string) => [metricFmt(val), name]} />
              <Legend />
              {allYears.filter(yr => selectedYears.includes(yr.year)).map(yr => {
                const colorIdx = allYears.findIndex(y => y.year === yr.year);
                return (
                  <Bar key={yr.year} dataKey={String(yr.year)}
                    fill={YEAR_COLORS[colorIdx % YEAR_COLORS.length]}
                    radius={[4, 4, 0, 0]} name={String(yr.year)} />
                );
              })}
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Summary table with YoY Change
            RULE: YoY Change always uses Jan–today slice for both years,
            regardless of Full/YTD display mode. This prevents comparing
            a partial current year against a full prior year. */}
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
              {allYears
                .filter(yr => selectedYears.includes(yr.year))
                .sort((a, b) => b.year - a.year)
                .map((yr, idx, arr) => {
                  const limit = getMonthLimit(yr.year);
                  const sliced = yr.months.slice(0, limit + 1);
                  const netIncome = compareMode === 'ytd' || yr.year === currentYear
                    ? sliced.reduce((s, m) => s + m.netIncome, 0) : yr.totals.netIncome;
                  const volume = compareMode === 'ytd' || yr.year === currentYear
                    ? sliced.reduce((s, m) => s + m.volume, 0) : yr.totals.volume;
                  const sales = compareMode === 'ytd' || yr.year === currentYear
                    ? sliced.reduce((s, m) => s + m.sales, 0) : yr.totals.sales;

                  // YoY Change: always Jan–today for BOTH years (never full-year vs YTD)
                  const ytdCutoff = currentMonthIdx + 1;
                  const ytdVal = yr.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0);
                  const prev = arr[idx + 1];
                  const prevYtdVal = prev
                    ? prev.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0)
                    : null;
                  const change = prevYtdVal && prevYtdVal > 0
                    ? ((ytdVal - prevYtdVal) / prevYtdVal * 100) : null;

                  const colorIdx = allYears.findIndex(y => y.year === yr.year);
                  return (
                    <tr key={yr.year} className="border-t">
                      <td className="px-4 py-2 font-medium flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: YEAR_COLORS[colorIdx % YEAR_COLORS.length] }} />
                        {yr.year}
                        {compareMode === 'ytd' && <span className="text-xs text-muted-foreground ml-1">YTD</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(netIncome, true)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(volume, true)}</td>
                      <td className="px-4 py-2 text-right">{sales.toLocaleString()}</td>
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
              <CardTitle className="text-lg flex items-center gap-2">
                My Goals
                {!open && (
                  <span className="text-xs font-normal text-primary border border-primary/30 rounded px-2 py-0.5 bg-primary/5">
                    Click to set goals
                  </span>
                )}
              </CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5 text-primary" />}
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
  const [catSourceBreakdown, setCatSourceBreakdown] = useState<SourceBreakdown | null>(null);
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
  useEffect(() => { setCatYear(year); setCatBreakdown(null); setCatSourceBreakdown(null); }, [year]);

  // Fetch category + source breakdown for a different year
  useEffect(() => {
    if (!user || catYear === year) { setCatBreakdown(null); setCatSourceBreakdown(null); return; }
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
        setCatSourceBreakdown(d.overview?.sourceBreakdown ?? null);
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

  // ytdMonths: number of completed months to include in YTD slice (Jan=1 through today's month)
  // This is used for ALL YTD comparisons — charts, grades, goals, YoY summaries.
  const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
  const ytdLabel = isCurrentYear ? ' YTD' : '';

  // ── Seasonality Projection ────────────────────────────────────────────────
  // Projects full-year outcome if current pace continues, weighted by goal seasonality.
  // Falls back to even distribution (1/12 per month) when no goals are set.
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
        if (i <= currentMonthIdx) return null; // actuals already shown for past months
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

  // ── Goal attainment vs YTD goal (not full annual goal) ────────────────────
  // RULE: never compare YTD actuals against the full annual goal target.
  // ytdIncomeGoal = sum of monthly goals from Jan through today's month only.
  const ytdIncomeGoal = months.slice(0, ytdMonths).reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const ytdVolumeGoal = months.slice(0, ytdMonths).reduce((s, m) => s + (m.volumeGoal ?? 0), 0) || null;
  const ytdSalesGoal = months.slice(0, ytdMonths).reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) || null;

  // Grade: current YTD actual as % of YTD goal through today
  const gradeVsGoal = ytdIncomeGoal ? Math.round((totals.netIncome / ytdIncomeGoal) * 100) : null;
  const gradeInfo = gradeVsGoal ? letterGrade(gradeVsGoal) : null;

  // Calculate averages
  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgCommPct = totals.closedVolume > 0 ? (totals.totalGCI / totals.closedVolume) * 100 : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;

  // Active source/category data
  const activeCat = catBreakdown ?? overview.categoryBreakdown;
  const activeSource: SourceBreakdown = catSourceBreakdown ?? (overview.sourceBreakdown ?? { closed: {}, pending: {} });

  // Source pie data (sorted by count desc)
  const sourceEntries = Object.entries(activeSource.closed).sort((a, b) => b[1].count - a[1].count);
  const sourceIncomePie = sourceEntries.filter(([, v]) => v.netRevenue > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.netRevenue, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  const sourceSalesPie = sourceEntries.filter(([, v]) => v.count > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
  const sourceVolumePie = sourceEntries.filter(([, v]) => v.volume > 0)
    .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.volume, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

  const catYearOptions = [year, ...(data.availableYears ?? [])].sort((a, b) => b - a);

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

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Net Income (Closed)"
          value={formatCurrency(totals.netIncome)}
          subtitle={gradeVsGoal
            ? `${gradeVsGoal}% of ${isCurrentYear ? 'YTD ' : ''}goal${gradeInfo ? ` · ${gradeInfo.letter}` : ''}`
            : `${formatNumber(totals.closedCount)} closings`}
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
          subtitle={ytdVolumeGoal
            ? `${Math.round((totals.closedVolume / ytdVolumeGoal) * 100)}% of ${isCurrentYear ? 'YTD ' : ''}vol goal`
            : `Pending: ${formatCurrency(totals.pendingVolume, true)}`}
          icon={TrendingUp}
        />
        <KPICard
          title="Total GCI"
          value={formatCurrency(totals.totalGCI)}
          subtitle={`Avg ${formatCurrency(avgNetPerDeal)}/deal net`}
          icon={Target}
        />
      </div>

      {/* KPI Cards — Row 2 */}
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
          subtitle={ytdSalesGoal
            ? `${Math.round((totals.closedCount / ytdSalesGoal) * 100)}% of ${isCurrentYear ? 'YTD ' : ''}sales goal · +${formatNumber(totals.pendingCount)} pending`
            : `+ ${formatNumber(totals.pendingCount)} pending`}
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
              <CardDescription>
                Income after broker split — {year}{ytdLabel}
                {compareYear ? ` vs ${compareYear} YTD` : ''}
                {showGoals ? ' + Goals (YTD)' : ''}
                {showProjected ? ' + Projected' : ''}
              </CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear}
              showGoals={showGoals} setShowGoals={setShowGoals}
              showProjected={showProjected} setShowProjected={setShowProjected}
              years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={incomeChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                label: m.label,
                netIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyNetIncome[i] || 0),
                pendingNetIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyPendingNetIncome[i] || 0),
                // Goals: null when not showing; null for future months in current year
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
                  incomeGoal: 'Goal', compareIncome: `${compareYear} Income`, projectedIncome: '📈 Projected',
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
              {/* YTD comparison — same date range both years */}
              {compareYear && data.comparisonData && (() => {
                const compIncomeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const compVolYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const diff = totals.netIncome - compIncomeYTD;
                const pctChange = compIncomeYTD > 0 ? (diff / compIncomeYTD * 100) : 0;
                const yoyPct = compIncomeYTD > 0 ? Math.round((totals.netIncome / compIncomeYTD) * 100) : 0;
                const grade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div>
                      <span className="text-muted-foreground text-xs">Income vs {compareYear}{ytdLabel}</span>
                      <p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Volume</span>
                      <p className="font-semibold">{formatCurrency(compVolYTD, true)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Sales</span>
                      <p className="font-semibold">{formatNumber(compSalesYTD)}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${grade.color}`}>{grade.letter}</span>
                      <span className={`text-base font-bold ${grade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {/* Projected full-year banner */}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 2: Monthly Dollar Volume ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Dollar Volume</CardTitle>
              <CardDescription>
                Closed and pending deal value — {year}{ytdLabel}
                {compareYear ? ` vs ${compareYear} YTD` : ''}
                {showProjected ? ' + Projected' : ''}
              </CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear}
              showGoals={showGoals} setShowGoals={setShowGoals}
              showProjected={showProjected} setShowProjected={setShowProjected}
              years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
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
                  volumeGoal: 'Goal', compareVolume: `${compareYear} Volume`, projectedVolume: '📈 Projected',
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
                const compVolYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const compIncomeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const diff = totals.closedVolume - compVolYTD;
                const pctChange = compVolYTD > 0 ? (diff / compVolYTD * 100) : 0;
                const yoyPct = compVolYTD > 0 ? Math.round((totals.closedVolume / compVolYTD) * 100) : 0;
                const grade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div>
                      <span className="text-muted-foreground text-xs">Volume vs {compareYear}{ytdLabel}</span>
                      <p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Income</span>
                      <p className="font-semibold">{formatCurrency(compIncomeYTD, true)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Sales</span>
                      <p className="font-semibold">{formatNumber(compSalesYTD)}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${grade.color}`}>{grade.letter}</span>
                      <span className={`text-base font-bold ${grade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 3: Monthly Sales Count ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Number of Sales</CardTitle>
              <CardDescription>
                Closed and pending — {year}{ytdLabel}
                {compareYear ? ` vs ${compareYear} YTD` : ''}
                {showProjected ? ' + Projected' : ''}
              </CardDescription>
            </div>
            <ChartControls compareYear={compareYear} setCompareYear={setCompareYear}
              showGoals={showGoals} setShowGoals={setShowGoals}
              showProjected={showProjected} setShowProjected={setShowProjected}
              years={data.availableYears ?? []} isCurrentYear={isCurrentYear} />
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
                  salesCountGoal: 'Goal', compareCount: `${compareYear} Sales`, projectedCount: '📈 Projected',
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
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const compVolYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compIncomeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + (m.netIncome ?? 0), 0);
                const diff = totals.closedCount - compSalesYTD;
                const pctChange = compSalesYTD > 0 ? (diff / compSalesYTD * 100) : 0;
                const yoyPct = compSalesYTD > 0 ? Math.round((totals.closedCount / compSalesYTD) * 100) : 0;
                const grade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div>
                      <span className="text-muted-foreground text-xs">Sales vs {compareYear}{ytdLabel}</span>
                      <p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{diff} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Volume</span>
                      <p className="font-semibold">{formatCurrency(compVolYTD, true)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">{compareYear}{ytdLabel} Income</span>
                      <p className="font-semibold">{formatCurrency(compIncomeYTD, true)}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${grade.color}`}>{grade.letter}</span>
                      <span className={`text-base font-bold ${grade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground text-xs">📈 Projected Full-Year Income</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Multi-Year Production Comparison ──────────────────────────────── */}
      <AgentMultiYearComparison view={view} />

      {/* ── Category + Source Breakdown ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Category &amp; Source Breakdown — {catYear}</CardTitle>
              <CardDescription>Closed transactions by type and lead source</CardDescription>
            </div>
            {catYearOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">View year:</span>
                <Select value={String(catYear)} onValueChange={v => setCatYear(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {catYearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
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
            <>
              {/* Category grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {([
                  ['Residential Sale', 'residential_sale'], ['Commercial Sale', 'commercial_sale'],
                  ['Commercial Lease', 'commercial_lease'], ['Land', 'land'], ['Rental / Lease', 'rental'],
                ] as const).map(([label, key]) => {
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

              {/* Source breakdown pie charts */}
              {sourceSalesPie.length > 0 && (
                <>
                  <div className="mt-8 mb-3">
                    <p className="font-semibold text-sm">Breakdown by Lead Source</p>
                    <p className="text-xs text-muted-foreground">Closed transactions grouped by how the lead originated</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <MiniPie data={sourceIncomePie} formatter={v => formatCurrency(v, true)} title="Net Income by Source" />
                    <MiniPie data={sourceSalesPie} formatter={v => `${v} sales`} title="Sales by Source" />
                    <MiniPie data={sourceVolumePie} formatter={v => formatCurrency(v, true)} title="Volume by Source" />
                  </div>

                  {/* Source detail table */}
                  <div className="mt-6 border rounded-lg overflow-hidden">
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
                          const p = activeSource.pending[k];
                          return (
                            <tr key={k} className="border-t">
                              <td className="px-4 py-2 flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                                {SOURCE_LABELS[k] ?? k}
                              </td>
                              <td className="px-4 py-2 text-right">{c.count}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.volume, true)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.netRevenue, true)}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">
                                {p && p.count > 0 ? `${p.count} (${formatCurrency(p.volume, true)})` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Activity History (imported tracking data) ───────────────────────── */}
      <ActivityHistoryCard />

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
