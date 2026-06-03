'use client';

/**
 * TeamCommandDashboard
 *
 * A full Broker-Command-style analytics dashboard scoped to a single team.
 * Used in two places:
 *   1. The team leader's personal dashboard (TeamLeaderDashboard renders this)
 *   2. The Broker Command "team tab" view (BrokerDashboardInner renders this
 *      when lockedTeamId is set — broker uses the admin endpoint, team leader
 *      uses the agent endpoint; both share this same layout component)
 *
 * Data source: /api/agent/command-metrics?view=team
 * Multi-year:  /api/agent/multi-year-compare?view=team
 *
 * NOTE: For non-admin callers (team leaders) grossMargin / totalGCI /
 * grossMarginPct are STRIPPED server-side.  The "Revenue & Gross Margin" KPI
 * block therefore shows Team Leader Earnings (totalGCI from teamLeaderEarnings,
 * totalLeaderRetained) instead of broker-retained gross margin.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  DollarSign, TrendingUp, Target, AlertCircle, BarChart3, Building2,
  Banknote, Award, ChevronDown, ChevronUp, Save, Users,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  Legend, Tooltip, ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useUser } from '@/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyData {
  month: number;
  label: string;
  closedVolume: number;
  pendingVolume: number;
  closedCount: number;
  pendingCount: number;
  grossMarginGoal?: number | null;
  volumeGoal?: number | null;
  salesCountGoal?: number | null;
}

interface CategoryMetric {
  count: number;
  volume: number;
  netRevenue: number;
}

interface CategoryBreakdown {
  closed: Record<string, CategoryMetric>;
  pending: Record<string, CategoryMetric>;
}

interface SourceBreakdown {
  closed: Record<string, { count: number; volume: number; netRevenue: number }>;
  pending: Record<string, { count: number; volume: number; netRevenue: number }>;
}

interface TeamLeaderEarnings {
  totalLeaderRetained: number;
  totalMemberPaid: number;
  totalGCI: number;
  memberBreakdown: {
    agentId: string;
    agentName: string;
    closedCount: number;
    closedVolume: number;
    totalGCI: number;
    memberPaid: number;
    leaderRetained: number;
  }[];
}

interface AgentRosterRow {
  agentId: string;
  displayName: string;
  agentStatus: string | null;
  teamId: string | null;
}

interface TeamCommandData {
  overview: {
    year: number;
    totals: {
      netIncome: number;
      pendingNetIncome: number;
      closedVolume: number;
      pendingVolume: number;
      closedCount: number;
      pendingCount: number;
      // Admin-only fields (may be undefined for team leaders)
      totalGCI?: number;
      grossMargin?: number;
      grossMarginPct?: number;
      agentNetCommission?: number;
      transactionFees?: number;
    };
    months: MonthlyData[];
    categoryBreakdown: CategoryBreakdown;
    sourceBreakdown: SourceBreakdown;
  };
  prevYearStats?: {
    year: number;
    totalVolume: number;
    totalSales: number;
    avgSalePrice: number;
    avgCommissionPct: number;
    avgMarginPct: number;
    seasonality: { month: number; label: string; volumePct: number; salesPct: number }[];
  } | null;
  availableYears?: number[];
  comparisonData?: {
    year: number;
    months: { closedVolume: number; closedCount: number; netIncome: number }[];
  } | null;
  agentView: {
    view: string;
    viewLabel: string;
    isTeamLeader: boolean;
    goalSegment: string;
    /** 12-element array of monthly agent net income (index 0 = Jan) */
    monthlyNetIncome: number[];
    monthlyPendingNetIncome: number[];
    netIncome: number;
    pendingNetIncome: number;
    /** Team view: distinct agents with at least one closed deal in the year */
    activeAgentCount?: number;
    /** Team view: total number of agents on the team roster */
    totalTeamMembers?: number;
  };
  teamLeaderEarnings?: TeamLeaderEarnings | null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

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

const formatNumber = (num: number | null | undefined) =>
  num != null ? num.toLocaleString() : '—';

function letterGrade(pct: number): { letter: string; color: string } {
  if (pct >= 90) return { letter: 'A', color: 'text-green-600' };
  if (pct >= 80) return { letter: 'B', color: 'text-blue-600' };
  if (pct >= 70) return { letter: 'C', color: 'text-yellow-600' };
  if (pct >= 60) return { letter: 'D', color: 'text-orange-600' };
  return { letter: 'F', color: 'text-red-600' };
}

// ── Chart configs ─────────────────────────────────────────────────────────────

const volumeChartConfig: ChartConfig = {
  closedVolume: { label: 'Closed Volume', color: 'hsl(var(--chart-2))' },
  pendingVolume: { label: 'Pending Volume', color: 'hsl(var(--chart-4))' },
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

const netIncomeChartConfig: ChartConfig = {
  netIncome: { label: 'Net Income', color: 'hsl(var(--chart-1))' },
  netIncomeGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareNetIncome: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
};

// ── Multi-Year Comparison (agent-safe) ────────────────────────────────────────

const YEAR_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

interface AgentYearData {
  year: number;
  months: { month: number; label: string; netIncome: number; volume: number; sales: number }[];
  totals: { netIncome: number; volume: number; sales: number };
}

function TeamMultiYearComparison({ teamId, viewAs }: { teamId: string; viewAs?: string }) {
  const { user } = useUser();
  const [allYears, setAllYears] = useState<AgentYearData[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<'volume' | 'sales' | 'netIncome'>('volume');
  const [view, setView] = useState<'month' | 'quarter' | 'year'>('month');
  const [compareMode, setCompareMode] = useState<'full' | 'ytd'>('full');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const multiYearParams = new URLSearchParams({ view: 'team' });
        if (viewAs) multiYearParams.set('viewAs', viewAs);
        const res = await fetch(`/api/agent/multi-year-compare?${multiYearParams}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.years) {
          setAllYears(data.years);
          const yrs = data.years.map((y: AgentYearData) => y.year);
          setSelectedYears(yrs.length > 5 ? yrs.slice(-5) : yrs);
        }
      } catch (err) {
        console.error('[team-multi-year]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, teamId, viewAs]);

  const toggleYear = (yr: number) => {
    setSelectedYears(prev =>
      prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr]
    );
  };

  const metricLabel = metric === 'volume' ? 'Dollar Volume' : metric === 'sales' ? 'Number of Sales' : 'Net Income';
  const metricFormatter = (val: number) =>
    metric === 'sales' ? val.toLocaleString() : formatCurrency(val, true);

  const todayMY = new Date();
  const currentYearMY = todayMY.getFullYear();
  const currentMonthIdxMY = todayMY.getMonth();

  const getYearMonthLimit = (yrNum: number) => {
    if (compareMode === 'ytd') return currentMonthIdxMY;
    if (yrNum === currentYearMY) return currentMonthIdxMY;
    return 11;
  };

  const chartData = (() => {
    const filteredYears = allYears.filter(y => selectedYears.includes(y.year));

    if (view === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const point: Record<string, any> = {
          label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
        };
        for (const yr of filteredYears) {
          const limit = getYearMonthLimit(yr.year);
          point[String(yr.year)] = i > limit ? null : (yr.months[i]?.[metric] ?? 0);
        }
        return point;
      });
    }

    if (view === 'quarter') {
      return Array.from({ length: 4 }, (_, q) => {
        const point: Record<string, any> = { label: QUARTER_LABELS[q] };
        for (const yr of filteredYears) {
          const limit = getYearMonthLimit(yr.year);
          const qMonths = yr.months.slice(q * 3, Math.min(q * 3 + 3, limit + 1));
          point[String(yr.year)] = qMonths.length > 0 ? qMonths.reduce((sum, m) => sum + (m[metric] ?? 0), 0) : null;
        }
        return point;
      });
    }

    return filteredYears.map(yr => {
      const limit = getYearMonthLimit(yr.year);
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
              <BarChart3 className="h-5 w-5" />
              Multi-Year Production Comparison
            </CardTitle>
            <CardDescription>Compare {metricLabel.toLowerCase()} across years</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volume">Dollar Volume</SelectItem>
                <SelectItem value="sales">Number of Sales</SelectItem>
                <SelectItem value="netIncome">Net Income</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border overflow-hidden">
              {(['month', 'quarter', 'year'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                  }`}
                >
                  {v === 'month' ? 'Monthly' : v === 'quarter' ? 'Quarterly' : 'Yearly'}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border overflow-hidden">
              {(['full', 'ytd'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompareMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    compareMode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                  }`}
                >
                  {m === 'full' ? 'Full Year' : `YTD (thru ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonthIdxMY]})`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground mr-1">Years:</span>
              {allYears.map((yr, idx) => (
                <button
                  key={yr.year}
                  type="button"
                  onClick={() => toggleYear(yr.year)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedYears.includes(yr.year)
                      ? 'text-white border-transparent'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                  style={selectedYears.includes(yr.year) ? { backgroundColor: YEAR_COLORS[idx % YEAR_COLORS.length] } : undefined}
                >
                  {yr.year}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedYears(allYears.map(y => y.year))}
                className="px-2 py-1 text-xs text-blue-600 hover:underline"
              >
                All
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          {view === 'year' ? (
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={metricFormatter} />
              <Tooltip formatter={(val: number) => [metricFormatter(val), metricLabel]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} name={metricLabel}>
                {chartData.map((entry: any, idx: number) => {
                  const yrIdx = allYears.findIndex(y => String(y.year) === entry.label);
                  return <Cell key={idx} fill={YEAR_COLORS[yrIdx >= 0 ? yrIdx % YEAR_COLORS.length : idx % YEAR_COLORS.length]} />;
                })}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={metricFormatter} />
              <Tooltip formatter={(val: number, name: string) => [metricFormatter(val), name]} />
              <Legend />
              {allYears
                .filter(yr => selectedYears.includes(yr.year))
                .map((yr) => {
                  const colorIdx = allYears.findIndex(y => y.year === yr.year);
                  return (
                    <Bar
                      key={yr.year}
                      dataKey={String(yr.year)}
                      fill={YEAR_COLORS[colorIdx % YEAR_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                      name={String(yr.year)}
                    />
                  );
                })}
            </BarChart>
          )}
        </ResponsiveContainer>

        <div className="mt-6 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Year</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="px-4 py-2 text-right font-medium">Sales</th>
                <th className="px-4 py-2 text-right font-medium">Net Income</th>
                <th className="px-4 py-2 text-right font-medium">YoY Change</th>
              </tr>
            </thead>
            <tbody>
              {allYears
                .filter(yr => selectedYears.includes(yr.year))
                .sort((a, b) => b.year - a.year)
                .map((yr, idx, arr) => {
                  const limit = getYearMonthLimit(yr.year);
                  const ytdMonths = yr.months.slice(0, limit + 1);
                  const volume = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.volume, 0)
                    : yr.totals.volume;
                  const sales = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.sales, 0)
                    : yr.totals.sales;
                  const netIncome = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.netIncome, 0)
                    : yr.totals.netIncome;
                  const metricVal = metric === 'volume' ? volume : metric === 'sales' ? sales : netIncome;
                  const prev = arr[idx + 1];
                  const ytdCutoff = currentMonthIdxMY + 1;
                  const ytdMetricVal = yr.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0);
                  const prevYtdMetricVal = prev
                    ? prev.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0)
                    : null;
                  const change = prevYtdMetricVal && prevYtdMetricVal > 0
                    ? ((ytdMetricVal - prevYtdMetricVal) / prevYtdMetricVal * 100)
                    : null;
                  const colorIdx = allYears.findIndex(y => y.year === yr.year);
                  return (
                    <tr key={yr.year} className="border-t">
                      <td className="px-4 py-2 font-medium flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: YEAR_COLORS[colorIdx % YEAR_COLORS.length] }} />
                        {yr.year}{compareMode === 'ytd' && <span className="text-xs text-muted-foreground ml-1">YTD</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(volume, true)}</td>
                      <td className="px-4 py-2 text-right">{sales.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(netIncome, true)}</td>
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

// ── Team Goals Editor ─────────────────────────────────────────────────────────

function TeamGoalsEditor({
  months, year, prevYearStats, onSaved, segment,
}: {
  months: MonthlyData[];
  year: number;
  prevYearStats?: TeamCommandData['prevYearStats'];
  onSaved: () => void;
  segment: string;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { volume: string; sales: string; margin: string }>>({});
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyMargin, setYearlyMargin] = useState('');
  const [goalAvgSalePrice, setGoalAvgSalePrice] = useState('');
  const [seasonWeights, setSeasonWeights] = useState<Record<number, { pct: string }>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const hasPrevData = !!(prevYearStats && prevYearStats.totalSales > 0);
  const avgSalePrice = prevYearStats?.avgSalePrice ?? 0;
  const avgCommPct = prevYearStats?.avgCommissionPct ?? 0;
  const avgMarginPct = prevYearStats?.avgMarginPct ?? 0;

  useEffect(() => {
    const map: typeof goals = {};
    let totalVolume = 0, totalSales = 0, totalMargin = 0;
    for (const m of months) {
      map[m.month] = {
        volume: m.volumeGoal != null ? String(Math.round(m.volumeGoal)) : '',
        sales: m.salesCountGoal != null ? String(Math.round(m.salesCountGoal)) : '',
        margin: m.grossMarginGoal != null ? String(Math.round(m.grossMarginGoal)) : '',
      };
      totalVolume += m.volumeGoal ?? 0;
      totalSales += m.salesCountGoal ?? 0;
      totalMargin += m.grossMarginGoal ?? 0;
    }
    setGoals(map);
    if (totalVolume > 0) setYearlyVolume(String(Math.round(totalVolume)));
    if (totalSales > 0) setYearlySales(String(Math.round(totalSales)));
    if (totalMargin > 0) setYearlyMargin(String(Math.round(totalMargin)));
    if (prevYearStats?.avgSalePrice) setGoalAvgSalePrice(String(Math.round(prevYearStats.avgSalePrice)));

    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats?.seasonality?.[m - 1];
      sw[m] = { pct: String(s?.salesPct ?? 8.33) };
    }
    setSeasonWeights(sw);
  }, [months, prevYearStats]);

  const effectiveAvgSalePrice = parseFloat(goalAvgSalePrice) || avgSalePrice;

  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    if (vol > 0 && effectiveAvgSalePrice > 0) {
      setYearlySales(String(Math.round(vol / effectiveAvgSalePrice)));
    }
    if (vol > 0 && avgCommPct > 0 && avgMarginPct > 0) {
      const totalGCI = vol * (avgCommPct / 100);
      setYearlyMargin(String(Math.round(totalGCI * (avgMarginPct / 100))));
    }
  };

  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    if (sales > 0 && effectiveAvgSalePrice > 0) {
      const calcVol = Math.round(sales * effectiveAvgSalePrice);
      setYearlyVolume(String(calcVol));
      if (avgCommPct > 0 && avgMarginPct > 0) {
        const totalGCI = calcVol * (avgCommPct / 100);
        setYearlyMargin(String(Math.round(totalGCI * (avgMarginPct / 100))));
      }
    }
  };

  const distribute = () => {
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const margin = parseFloat(yearlyMargin) || 0;
    const newGoals: typeof goals = {};
    for (let m = 1; m <= 12; m++) {
      const sw = seasonWeights[m];
      const pct = parseFloat(sw?.pct) || 8.33;
      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol * (pct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (pct / 100))) : '',
        margin: margin > 0 ? String(Math.round(margin * (pct / 100))) : '',
      };
    }
    setGoals(newGoals);
  };

  const distributeEven = () => {
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const margin = parseFloat(yearlyMargin) || 0;
    const newGoals: typeof goals = {};
    for (let m = 1; m <= 12; m++) {
      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol / 12)) : '',
        sales: sales > 0 ? String(Math.round(sales / 12)) : '',
        margin: margin > 0 ? String(Math.round(margin / 12)) : '',
      };
    }
    setGoals(newGoals);
  };

  const distributeWithPrevSeasonality = () => {
    if (!prevYearStats) return;
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const margin = parseFloat(yearlyMargin) || 0;
    const newGoals: typeof goals = {};
    const newWeights: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats.seasonality[m - 1];
      const pct = s?.salesPct ?? 8.33;
      newWeights[m] = { pct: String(pct) };
      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol * (pct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (pct / 100))) : '',
        margin: margin > 0 ? String(Math.round(margin * (pct / 100))) : '',
      };
    }
    setSeasonWeights(newWeights);
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
              segment,
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
      console.error('Failed to save team goals:', err);
    } finally {
      setSaving(false);
    }
  };

  const totalSeasonPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.pct) || 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" /> Team Goal Setting
                {!open && (
                  <span className="text-xs font-normal text-primary border border-primary/30 rounded px-2 py-0.5 bg-primary/5">
                    Click to set team goals
                  </span>
                )}
              </CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5 text-primary" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>
            Set team production goals — separate from personal goals.
            {hasPrevData ? ` Auto-calculates from ${prevYearStats!.year} averages.` : ''}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {hasPrevData && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  {prevYearStats!.year} Team Reference Data
                  <Badge variant="secondary" className="text-xs">Previous Year</Badge>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Volume</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats!.totalVolume, true)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Sales</span>
                    <p className="font-semibold">{formatNumber(prevYearStats!.totalSales)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Sale Price</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats!.avgSalePrice)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Commission %</span>
                    <p className="font-semibold">{avgCommPct.toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            )}

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Yearly Team Goals for {year}</h4>
                {hasPrevData && (
                  <span className="text-xs text-muted-foreground">
                    Enter any field — others auto-calculate from {prevYearStats!.year} averages
                  </span>
                )}
              </div>

              {hasPrevData && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Increase Production Over Last Year</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[5, 10, 15, 20, 25, 30, 40, 50].map(pct => {
                      const isActive = yearlyVolume && Math.abs(parseFloat(yearlyVolume) - Math.round(prevYearStats!.totalVolume * (1 + pct / 100))) < 100;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const newVol = Math.round(prevYearStats!.totalVolume * (1 + pct / 100));
                            handleVolumeChange(String(newVol));
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'
                          }`}
                        >
                          +{pct}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="team-yearly-volume" className="text-xs">Total Volume Goal ($)</Label>
                  <Input
                    id="team-yearly-volume"
                    type="number"
                    value={yearlyVolume}
                    onChange={e => handleVolumeChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats!.totalVolume, true)}` : 'e.g. 50000000'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="team-yearly-sales" className="text-xs">
                    Total Sales Goal (#)
                    {effectiveAvgSalePrice > 0 && <span className="text-muted-foreground ml-1">@ {formatCurrency(effectiveAvgSalePrice)} avg</span>}
                  </Label>
                  <Input
                    id="team-yearly-sales"
                    type="number"
                    value={yearlySales}
                    onChange={e => handleSalesChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${prevYearStats!.totalSales}` : 'e.g. 100'}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="team-avg-price" className="text-xs">
                  Avg Sale Price Goal ($)
                  {hasPrevData && <span className="text-muted-foreground ml-1">Last yr: {formatCurrency(prevYearStats!.avgSalePrice)}</span>}
                </Label>
                <Input
                  id="team-avg-price"
                  type="number"
                  value={goalAvgSalePrice}
                  onChange={e => {
                    setGoalAvgSalePrice(e.target.value);
                    const price = parseFloat(e.target.value) || 0;
                    if (price > 0 && yearlyVolume) {
                      setYearlySales(String(Math.round(parseFloat(yearlyVolume) / price)));
                    }
                  }}
                  placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats!.avgSalePrice)}` : 'e.g. 350000'}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default" onClick={distribute} disabled={!yearlyVolume && !yearlySales}>
                  <Target className="mr-2 h-4 w-4" />
                  Distribute Across Months
                </Button>
                {hasPrevData && (
                  <Button variant="default" onClick={distributeWithPrevSeasonality} disabled={!yearlyVolume && !yearlySales}>
                    Use {prevYearStats!.year} Seasonality
                  </Button>
                )}
                <Button variant="default" onClick={distributeEven} disabled={!yearlyVolume && !yearlySales}>
                  Even Split
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 font-medium">Month</th>
                    <th className="text-left py-2 px-2 font-medium">
                      Seasonality %
                      <span className={`ml-2 text-xs font-normal ${totalSeasonPct < 99 || totalSeasonPct > 101 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        ({totalSeasonPct.toFixed(1)}%)
                      </span>
                    </th>
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Goal (#)</th>
                    <th className="text-left py-2 px-2 font-medium">Margin Goal ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { volume: '', sales: '', margin: '' };
                    const sw = seasonWeights[m] || { pct: '8.33' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{label}</td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={sw.pct}
                            onChange={e => setSeasonWeights(prev => ({ ...prev, [m]: { pct: e.target.value } }))}
                            placeholder="8.33"
                            className="h-8 w-20"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.volume}
                            onChange={e => setGoals(prev => ({ ...prev, [m]: { ...prev[m], volume: e.target.value } }))}
                            placeholder="0"
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.sales}
                            onChange={e => setGoals(prev => ({ ...prev, [m]: { ...prev[m], sales: e.target.value } }))}
                            placeholder="0"
                            className="h-8 w-24"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={g.margin}
                            onChange={e => setGoals(prev => ({ ...prev, [m]: { ...prev[m], margin: e.target.value } }))}
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
                    <td className="py-2 px-2 text-xs font-normal text-muted-foreground">{totalSeasonPct.toFixed(1)}%</td>
                    <td className="py-2 px-2">{formatCurrency(Object.values(goals).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0), true)}</td>
                    <td className="py-2 px-2">{Object.values(goals).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0)}</td>
                    <td className="py-2 px-2">{formatCurrency(Object.values(goals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0), true)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3">
              <Button onClick={save} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Team Goals'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface TeamCommandDashboardProps {
  /** The team ID to scope all data to (e.g. "charles-ditch-team") */
  teamId: string;
  /** Display name for the team (e.g. "Charles Ditch Team") */
  teamName: string;
  /**
   * Roster rows for this team — used to show active agent count.
   * Pass the already-fetched rosterData from the parent so we don't
   * double-fetch.  If not provided, the active agent count card is hidden.
   */
  rosterData?: AgentRosterRow[];
  /**
   * If true, data is fetched from the broker admin endpoint (used when
   * BrokerDashboardInner renders this component for the broker view).
   * If false (default), data is fetched from the agent endpoint.
   */
  useBrokerEndpoint?: boolean;
  /**
   * When the broker is viewing this dashboard as an agent (viewAs impersonation),
   * pass the agent's ID here so it is forwarded to the API as ?viewAs=<id>.
   * This ensures the agent endpoint queries the correct agent's data, not the broker's.
   */
  viewAs?: string;
}

export function TeamCommandDashboard({
  teamId,
  teamName,
  rosterData = [],
  useBrokerEndpoint = false,
  viewAs,
}: TeamCommandDashboardProps) {
  const { user } = useUser();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showProjected, setShowProjected] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [data, setData] = useState<TeamCommandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catYear, setCatYear] = useState<number>(new Date().getFullYear());
  const [catBreakdown, setCatBreakdown] = useState<CategoryBreakdown | null>(null);
  const [catSourceBreakdown, setCatSourceBreakdown] = useState<SourceBreakdown | null>(null);
  const [catLoading, setCatLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(year) });
      if (compareYear) params.set('compareYear', String(compareYear));
      if (selectedType) params.set('type', selectedType);

      let url: string;
      if (useBrokerEndpoint) {
        params.set('teamId', teamId);
        url = `/api/broker/command-metrics?${params}`;
      } else {
        params.set('view', 'team');
        // When broker is viewing as an agent, forward viewAs so the server
        // queries the correct agent's team data, not the broker's own data.
        if (viewAs) params.set('viewAs', viewAs);
        url = `/api/agent/command-metrics?${params}`;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const metrics = await res.json();
      setData(metrics);
    } catch (e: any) {
      console.error('[TeamCommandDashboard] fetch error:', e);
      setError(e.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [user, year, compareYear, selectedType, teamId, useBrokerEndpoint, viewAs]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setCatYear(year); setCatBreakdown(null); setCatSourceBreakdown(null); }, [year]);

  // Fetch category breakdown for a different year
  useEffect(() => {
    if (!user || catYear === year) { setCatBreakdown(null); setCatSourceBreakdown(null); return; }
    setCatLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ year: String(catYear) });
        if (selectedType) params.set('type', selectedType);

        let url: string;
        if (useBrokerEndpoint) {
          params.set('teamId', teamId);
          url = `/api/broker/command-metrics?${params}`;
        } else {
          params.set('view', 'team');
          if (viewAs) params.set('viewAs', viewAs);
          url = `/api/agent/command-metrics?${params}`;
        }

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        setCatBreakdown(d.overview?.categoryBreakdown ?? null);
        setCatSourceBreakdown(d.overview?.sourceBreakdown ?? null);
      } catch { /* silent */ }
      finally { setCatLoading(false); }
    })();
  }, [catYear, year, user, selectedType, teamId, useBrokerEndpoint, viewAs]);

  // ── Loading / Error guards ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data?.overview) return null;

  const { totals, months, categoryBreakdown } = data.overview;

  // ── Computed averages ──────────────────────────────────────────────────────
  const avgSalePrice = totals.closedCount > 0
    ? Math.round(totals.closedVolume / totals.closedCount) : 0;
  const avgNetPerDeal = totals.closedCount > 0
    ? Math.round(totals.netIncome / totals.closedCount) : 0;

  // ── Goal totals ────────────────────────────────────────────────────────────
  const yearlyVolumeGoal = months.reduce((s, m) => s + (m.volumeGoal ?? 0), 0) || null;
  const yearlySalesGoal = months.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) || null;

  // ── YTD pacing ────────────────────────────────────────────────────────────
  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYear = year === currentYear;
  const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;
  const startOfYear = new Date(currentYear, 0, 1);
  const daysElapsed = Math.floor((today.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const ytdFraction = isCurrentYear ? daysElapsed / daysInYear : 1;
  const currentMonthIdx = today.getMonth();

  const ytdVolumeGoal = yearlyVolumeGoal ? Math.round(yearlyVolumeGoal * ytdFraction) : null;
  const ytdSalesGoal = yearlySalesGoal ? Math.round(yearlySalesGoal * ytdFraction * 10) / 10 : null;

  const gradeVolume = ytdVolumeGoal
    ? Math.round((totals.closedVolume / ytdVolumeGoal) * 100) : null;
  const gradeSales = ytdSalesGoal
    ? Math.round((totals.closedCount / ytdSalesGoal) * 100) : null;

  // ── Seasonality Projection ─────────────────────────────────────────────────
  const projectedMonthData = (() => {
    if (!isCurrentYear) return null;
    const completedMonths = months.slice(0, currentMonthIdx + 1);

    const compute = (actualKey: keyof MonthlyData, goalKey: keyof MonthlyData) => {
      const ytdActual = completedMonths.reduce((s, m) => s + ((m[actualKey] as number) ?? 0), 0);
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

    return {
      volume: compute('closedVolume', 'volumeGoal'),
      sales: compute('closedCount', 'salesCountGoal'),
      fullYearVolume: (() => {
        const ytd = completedMonths.reduce((s, m) => s + m.closedVolume, 0);
        const yearlyGoal = months.reduce((s, m) => s + (m.volumeGoal ?? 0), 0);
        const share = yearlyGoal > 0 ? completedMonths.reduce((s, m) => s + (m.volumeGoal ?? 0), 0) / yearlyGoal : (currentMonthIdx + 1) / 12;
        return share > 0 ? Math.round(ytd / share) : 0;
      })(),
      fullYearSales: (() => {
        const ytd = completedMonths.reduce((s, m) => s + m.closedCount, 0);
        const yearlyGoal = months.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0);
        const share = yearlyGoal > 0 ? completedMonths.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) / yearlyGoal : (currentMonthIdx + 1) / 12;
        return share > 0 ? Math.round(ytd / share) : 0;
      })(),
    };
  })();

  // ── Team Pulse ─────────────────────────────────────────────────────────────
  const scores = [gradeVolume, gradeSales].filter(g => g !== null) as number[];
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // ── Active agent count: prefer API count (agents with ≥1 closed deal this year)
  const activeAgentCount = data?.agentView?.activeAgentCount
    ?? rosterData.filter(a => a.agentStatus === 'active' || a.agentStatus === 'grace_period').length;
  const totalTeamMembersCount = data?.agentView?.totalTeamMembers ?? rosterData.length;

  // ── Category breakdown helpers ─────────────────────────────────────────────
  const CAT_LABELS: Record<string, string> = {
    residential_sale: 'Residential',
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

  const activeCat = catBreakdown ?? categoryBreakdown;
  const activeSource: SourceBreakdown = catSourceBreakdown ?? (data.overview.sourceBreakdown ?? { closed: {}, pending: {} });
  const catYearOptions = [year, ...(data.availableYears ?? [])].sort((a, b) => b - a);

  const sourceEntries = Object.entries(activeSource.closed).sort((a, b) => b[1].count - a[1].count);

  const renderPie = (pieData: { name: string; value: number; color: string }[], formatter: (v: number) => string, title: string) => (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold mb-2 text-center">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
            label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(val: number) => formatter(val)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
        {pieData.map((d, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}: {formatter(d.value)}
          </span>
        ))}
      </div>
    </div>
  );

  const goalSegment = data.agentView?.goalSegment ?? teamId;

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            {teamName} Command
          </h2>
          <p className="text-muted-foreground text-sm">
            Team production dashboard — {year}
            {selectedType ? ` · ${({ residential: 'Residential', commercial: 'Commercial', commercial_sale: 'Commercial Sales', commercial_lease: 'Commercial Leases', land: 'Land', rental: 'Rentals' } as Record<string, string>)[selectedType] ?? selectedType}` : ''}
          </p>
        </div>
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

      {/* ── Team Pulse Bar ──────────────────────────────────────────────────── */}
      {isCurrentYear && avgScore !== null && (() => {
        const isOnTrack = avgScore >= 90;
        const isClose = avgScore >= 70;
        const statusLabel = isOnTrack ? '✓ On Track' : isClose ? '⚡ Needs Attention' : '⚠ Behind Pace';
        const statusBg = isOnTrack ? 'from-green-900 to-green-800' : isClose ? 'from-amber-900 to-amber-800' : 'from-red-900 to-red-800';
        const metrics = [
          { label: 'Volume', score: gradeVolume },
          { label: 'Sales Count', score: gradeSales },
        ].filter(m => m.score !== null);
        return (
          <div className={`rounded-xl bg-gradient-to-r ${statusBg} text-white px-5 py-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{isOnTrack ? '🏆' : isClose ? '⚡' : '🚨'}</div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/70 mb-0.5">Team Pulse — {year}</p>
                  <p className="text-lg font-black">{statusLabel} &mdash; {avgScore}% of YTD Goal</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {metrics.map(m => (
                  <div key={m.label} className="text-center">
                    <p className="text-xs text-white/60 mb-0.5">{m.label}</p>
                    <p className={`text-lg font-black ${(m.score ?? 0) >= 90 ? 'text-green-300' : (m.score ?? 0) >= 70 ? 'text-amber-300' : 'text-red-300'}`}>
                      {m.score}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isOnTrack ? 'bg-green-400' : isClose ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${Math.min(avgScore, 100)}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* ── YTD Summary Hero Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/20">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shrink-0">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide truncate">
                Total Team Volume YTD
              </p>
              <p className="text-2xl font-black text-blue-900 dark:text-blue-100 leading-tight">
                {formatCurrency(totals.closedVolume, true)}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                {formatNumber(totals.closedCount)} closed deal{totals.closedCount !== 1 ? 's' : ''}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 shrink-0">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wide truncate">
                Total Sales YTD
              </p>
              <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100 leading-tight">
                {formatNumber(totals.closedCount)}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                {totals.pendingCount > 0 ? `+ ${formatNumber(totals.pendingCount)} pending` : 'closed transactions'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-200 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/20">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 shrink-0">
              <Banknote className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-violet-700 dark:text-violet-400 uppercase tracking-wide truncate">
                Team Net Income YTD
              </p>
              <p className="text-2xl font-black text-violet-900 dark:text-violet-100 leading-tight">
                {formatCurrency(totals.netIncome, true)}
              </p>
              <p className="text-xs text-violet-600/70 dark:text-violet-400/70 mt-0.5">
                {totals.pendingNetIncome > 0 ? `+ ${formatCurrency(totals.pendingNetIncome, true)} pending` : 'agent net commissions'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Team Leader Earnings ─────────────────────────────────────────────── */}
      {data.teamLeaderEarnings && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600" /> Team Leader Earnings
            </CardTitle>
            <CardDescription>Leader retained from team member transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-amber-100/60 dark:bg-amber-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Team GCI</p>
                <p className="text-xl font-black text-amber-700 dark:text-amber-400">
                  {formatCurrency(data.teamLeaderEarnings.totalGCI)}
                </p>
              </div>
              <div className="text-center p-3 bg-green-100/60 dark:bg-green-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Leader Retained</p>
                <p className="text-xl font-black text-green-700 dark:text-green-400">
                  {formatCurrency(data.teamLeaderEarnings.totalLeaderRetained)}
                </p>
              </div>
              <div className="text-center p-3 bg-blue-100/60 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Paid to Members</p>
                <p className="text-xl font-black text-blue-700 dark:text-blue-400">
                  {formatCurrency(data.teamLeaderEarnings.totalMemberPaid)}
                </p>
              </div>
            </div>
            {data.teamLeaderEarnings.memberBreakdown.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Member</th>
                      <th className="px-3 py-2 text-right font-medium">Deals</th>
                      <th className="px-3 py-2 text-right font-medium">Volume</th>
                      <th className="px-3 py-2 text-right font-medium">GCI</th>
                      <th className="px-3 py-2 text-right font-medium">Member Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Leader Retained</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamLeaderEarnings.memberBreakdown.map(m => (
                      <tr key={m.agentId} className="border-t">
                        <td className="px-3 py-2 font-medium">{m.agentName}</td>
                        <td className="px-3 py-2 text-right">{m.closedCount}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(m.closedVolume, true)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(m.totalGCI, true)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(m.memberPaid, true)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-700 dark:text-amber-400">
                          {formatCurrency(m.leaderRetained, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Transaction Type Filter ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium mr-1">Filter by Type:</span>
        {([
          { value: null, label: 'All Types' },
          { value: 'residential', label: 'Residential' },
          { value: 'commercial', label: 'Commercial' },
          { value: 'commercial_sale', label: 'Commercial Sales' },
          { value: 'commercial_lease', label: 'Commercial Leases' },
          { value: 'land', label: 'Land' },
          { value: 'rental', label: 'Rentals' },
        ] as const).map(opt => (
          <Button
            key={opt.value ?? 'all'}
            variant={selectedType === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales & Volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Sales & Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Closed Sales</span>
              <span className="text-xl font-bold">{formatNumber(totals.closedCount)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Closed Volume</span>
              <span className="text-xl font-bold">{formatCurrency(totals.closedVolume, true)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Pending</span>
              <span className="font-medium">
                {formatNumber(totals.pendingCount)} deals · {formatCurrency(totals.pendingVolume, true)}
              </span>
            </div>
            {(gradeVolume || gradeSales) && (
              <div className="border-t pt-2 space-y-1">
                {gradeVolume && (() => { const g = letterGrade(gradeVolume); return (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">{isCurrentYear ? 'Volume vs YTD Goal' : 'Volume Grade'}</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-2xl font-black ${g.color}`}>{g.letter}</span>
                      <span className="text-xs text-muted-foreground">
                        {gradeVolume}% · {formatCurrency(totals.closedVolume, true)} / {formatCurrency(ytdVolumeGoal!, true)}
                      </span>
                    </span>
                  </div>
                ); })()}
                {gradeSales && (() => { const g = letterGrade(gradeSales); return (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">{isCurrentYear ? 'Sales vs YTD Goal' : 'Sales Grade'}</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-2xl font-black ${g.color}`}>{g.letter}</span>
                      <span className="text-xs text-muted-foreground">
                        {gradeSales}% · {totals.closedCount} / {ytdSalesGoal}
                      </span>
                    </span>
                  </div>
                ); })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-Deal Averages */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" /> Per-Deal Averages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Avg Sale Price</span>
              <span className="text-xl font-bold">{formatCurrency(avgSalePrice)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Avg Net Income / Deal</span>
              <span className="text-lg font-semibold">{formatCurrency(avgNetPerDeal)}</span>
            </div>
            {data.prevYearStats && totals.closedCount > 0 && (
              <div className="border-t pt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>vs {data.prevYearStats.year} avg sale price:</span>
                  <span>{formatCurrency(data.prevYearStats.avgSalePrice)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Agents */}
        <Card className="border-teal-200 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" /> Active Team Members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Active Agents</span>
              <span className="text-3xl font-black text-teal-700 dark:text-teal-400">
                {activeAgentCount}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {totalTeamMembersCount > 0
                ? `${totalTeamMembersCount} total member${totalTeamMembersCount !== 1 ? 's' : ''} on team`
                : 'Team member count'}
            </p>
            {data.teamLeaderEarnings && data.teamLeaderEarnings.memberBreakdown.length > 0 && (
              <div className="border-t pt-2 text-xs text-muted-foreground">
                <span>{data.teamLeaderEarnings.memberBreakdown.length} member{data.teamLeaderEarnings.memberBreakdown.length !== 1 ? 's' : ''} with transactions this year</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── CHART 1: Monthly Dollar Volume ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Dollar Volume</CardTitle>
              <CardDescription>
                Closed and pending deal value — {year}
                {compareYear ? ` vs ${compareYear}` : ''}
                {showProjected ? ' + Projected' : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={compareYear ? String(compareYear) : 'none'} onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Year: None</SelectItem>
                  {(data.availableYears ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowGoals(g => !g)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showGoals ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                Goals
              </button>
              {isCurrentYear && (
                <button type="button" onClick={() => setShowProjected(p => !p)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showProjected ? 'bg-amber-500 text-white border-amber-500' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  📈 Projected
                </button>
              )}
              <button type="button" onClick={() => setShowPending(p => !p)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showPending ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                Pending
              </button>
            </div>
          </div>
          {gradeVolume && (() => { const g = letterGrade(gradeVolume); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? 'YTD Volume Grade (as of today)' : 'Full Year Volume Grade'}
                </p>
                <p className="text-sm font-semibold">
                  {formatCurrency(totals.closedVolume, true)} <span className="text-muted-foreground font-normal">/ {formatCurrency(ytdVolumeGoal!, true)} goal</span>
                </p>
                {compareYear && data.comparisonData && (() => {
                  const compYTD = data.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + m.closedVolume, 0);
                  const diff = totals.closedVolume - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
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
          <ChartContainer config={volumeChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                closedVolume: isCurrentYear && i > currentMonthIdx ? null : m.closedVolume,
                volumeGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.volumeGoal) : null,
                pendingVolume: (!showPending || (isCurrentYear && i > currentMonthIdx)) ? null : m.pendingVolume,
                compareVolume: compareYear ? (data.comparisonData?.months?.[i]?.closedVolume ?? null) : null,
                projectedVolume: showProjected ? (projectedMonthData?.volume[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                const labels: Record<string, string> = {
                  closedVolume: `${year} Closed`, pendingVolume: `${year} Pending`,
                  volumeGoal: `${year} Goal`, compareVolume: `${compareYear} Volume`, projectedVolume: 'Projected',
                };
                return [formatCurrency(Number(value)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedVolume" fill="var(--color-closedVolume)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareVolume" fill="var(--color-compareVolume)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="volumeGoal" fill="var(--color-volumeGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedVolume" fill="var(--color-projectedVolume)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
              {showPending && <Bar dataKey="pendingVolume" fill="var(--color-pendingVolume)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />}
            </BarChart>
          </ChartContainer>
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const compVolumeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const diff = totals.closedVolume - compVolumeYTD;
                const pctChange = compVolumeYTD > 0 ? (diff / compVolumeYTD * 100) : 0;
                const yoyPct = compVolumeYTD > 0 ? Math.round((totals.closedVolume / compVolumeYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-3 gap-4 items-start">
                    <div><span className="text-muted-foreground">Volume vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Sales</span><p className="font-semibold">{formatNumber(compSalesYTD)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 2: Monthly Number of Sales ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Number of Sales</CardTitle>
              <CardDescription>
                Closed and pending transaction counts — {year}
                {compareYear ? ` vs ${compareYear}` : ''}
                {showProjected ? ' + Projected' : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={compareYear ? String(compareYear) : 'none'} onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Year: None</SelectItem>
                  {(data.availableYears ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowGoals(g => !g)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showGoals ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                Goals
              </button>
              {isCurrentYear && (
                <button type="button" onClick={() => setShowProjected(p => !p)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showProjected ? 'bg-amber-500 text-white border-amber-500' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  📈 Projected
                </button>
              )}
              <button type="button" onClick={() => setShowPending(p => !p)} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${showPending ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                Pending
              </button>
            </div>
          </div>
          {gradeSales && (() => { const g = letterGrade(gradeSales); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? 'YTD Sales Grade (as of today)' : 'Full Year Sales Grade'}
                </p>
                <p className="text-sm font-semibold">
                  {totals.closedCount} sales <span className="text-muted-foreground font-normal">/ {ytdSalesGoal} goal</span>
                </p>
                {compareYear && data.comparisonData && (() => {
                  const compYTD = data.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + m.closedCount, 0);
                  const diff = totals.closedCount - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{diff} sales ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
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
          <ChartContainer config={salesChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                closedCount: isCurrentYear && i > currentMonthIdx ? null : m.closedCount,
                salesCountGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.salesCountGoal) : null,
                pendingCount: (!showPending || (isCurrentYear && i > currentMonthIdx)) ? null : m.pendingCount,
                compareCount: compareYear ? (data.comparisonData?.months?.[i]?.closedCount ?? null) : null,
                projectedCount: showProjected ? (projectedMonthData?.sales[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                const labels: Record<string, string> = {
                  closedCount: `${year} Closed`, pendingCount: `${year} Pending`,
                  salesCountGoal: `${year} Goal`, compareCount: `${compareYear} Sales`, projectedCount: 'Projected',
                };
                return [formatNumber(Number(value)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="closedCount" fill="var(--color-closedCount)" radius={[4, 4, 0, 0]} name={`${year} Closed`} />
              {compareYear && <Bar dataKey="compareCount" fill="var(--color-compareCount)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="salesCountGoal" fill="var(--color-salesCountGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedCount" fill="var(--color-projectedCount)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
              {showPending && <Bar dataKey="pendingCount" fill="var(--color-pendingCount)" radius={[4, 4, 0, 0]} opacity={0.5} name="Pending" />}
            </BarChart>
          </ChartContainer>
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const compVolumeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const diff = totals.closedCount - compSalesYTD;
                const pctChange = compSalesYTD > 0 ? (diff / compSalesYTD * 100) : 0;
                const yoyPct = compSalesYTD > 0 ? Math.round((totals.closedCount / compSalesYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-3 gap-4 items-start">
                    <div><span className="text-muted-foreground">Sales vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{diff} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Volume</span><p className="font-semibold">{formatCurrency(compVolumeYTD, true)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 3: Monthly Net Income ──────────────────────────────────────── */}
      {(() => {
        const monthlyNet = data.agentView?.monthlyNetIncome ?? [];
        const chartNetData = months.map((m, i) => ({
          label: m.label,
          netIncome: isCurrentYear && i > currentMonthIdx ? null : (monthlyNet[i] ?? 0),
          compareNetIncome: compareYear ? (data.comparisonData?.months?.[i]?.netIncome ?? null) : null,
        }));
        return (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Monthly Net Income</CardTitle>
                  <CardDescription>
                    Team agent net commissions — {year}
                    {compareYear ? ` vs ${compareYear}` : ''}
                  </CardDescription>
                </div>
                <Select value={compareYear ? String(compareYear) : 'none'} onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Year: None</SelectItem>
                    {(data.availableYears ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={netIncomeChartConfig} className="h-[350px] w-full">
                <BarChart data={chartNetData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={val => formatCurrency(val, true)} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      netIncome: `${year} Net Income`,
                      compareNetIncome: `${compareYear} Net Income`,
                    };
                    return [formatCurrency(Number(value)), labels[name as string] ?? name];
                  }} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="netIncome" fill="var(--color-netIncome)" radius={[4, 4, 0, 0]} name={`${year} Net Income`} />
                  {compareYear && <Bar dataKey="compareNetIncome" fill="var(--color-compareNetIncome)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Multi-Year Production Comparison ────────────────────────────────── */}
      <TeamMultiYearComparison teamId={teamId} viewAs={viewAs} />

      {/* ── Category Breakdown ──────────────────────────────────────────────── */}
      {(() => {
        const marginData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k]?.netRevenue ?? 0, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);
        const salesData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k]?.count ?? 0, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);
        const volumeData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k]?.volume ?? 0, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);

        const sourceMarginData = sourceEntries
          .filter(([, v]) => v.netRevenue > 0)
          .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.netRevenue, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
        const sourceSalesData = sourceEntries
          .filter(([, v]) => v.count > 0)
          .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
        const sourceVolumeData = sourceEntries
          .filter(([, v]) => v.volume > 0)
          .map(([k, v], i) => ({ name: SOURCE_LABELS[k] ?? k, value: v.volume, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

        if (salesData.length === 0 && !catLoading) return null;

        return (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Category Breakdown — {catYear}</CardTitle>
                  <CardDescription>Closed transactions by type — net income, sales, and volume</CardDescription>
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
                <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">Loading {catYear} data…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {renderPie(marginData, v => formatCurrency(v, true), 'Net Income')}
                    {renderPie(salesData, v => `${v} sales`, 'Number of Sales')}
                    {renderPie(volumeData, v => formatCurrency(v, true), 'Dollar Volume')}
                  </div>
                  <div className="mt-6 border rounded-lg overflow-hidden">
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
                          const c = activeCat.closed[k];
                          const p = activeCat.pending[k];
                          if (!c || (c.count === 0 && (!p || p.count === 0))) return null;
                          return (
                            <tr key={k} className="border-t">
                              <td className="px-4 py-2 flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                                {CAT_LABELS[k]}
                              </td>
                              <td className="px-4 py-2 text-right">{c.count}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.volume, true)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.netRevenue, true)}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">{p && p.count > 0 ? `${p.count} (${formatCurrency(p.volume, true)})` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {sourceSalesData.length > 0 && (
                    <>
                      <div className="mt-8 mb-3">
                        <p className="font-semibold text-sm">Breakdown by Lead Source</p>
                        <p className="text-xs text-muted-foreground">Closed transactions grouped by how the lead originated</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {renderPie(sourceMarginData, v => formatCurrency(v, true), 'Net Income by Source')}
                        {renderPie(sourceSalesData, v => `${v} sales`, 'Sales by Source')}
                        {renderPie(sourceVolumeData, v => formatCurrency(v, true), 'Volume by Source')}
                      </div>
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
                                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                                    {SOURCE_LABELS[k] ?? k}
                                  </td>
                                  <td className="px-4 py-2 text-right">{c.count}</td>
                                  <td className="px-4 py-2 text-right">{formatCurrency(c.volume, true)}</td>
                                  <td className="px-4 py-2 text-right">{formatCurrency(c.netRevenue, true)}</td>
                                  <td className="px-4 py-2 text-right text-muted-foreground">{p && p.count > 0 ? `${p.count} (${formatCurrency(p.volume, true)})` : '—'}</td>
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
        );
      })()}

      {/* ── Team Goal Setting ────────────────────────────────────────────────── */}
      <TeamGoalsEditor
        months={months}
        year={year}
        prevYearStats={data.prevYearStats ?? undefined}
        onSaved={fetchData}
        segment={goalSegment}
      />
    </div>
  );
}
