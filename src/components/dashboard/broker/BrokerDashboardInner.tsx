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
  Legend, Tooltip, ResponsiveContainer, PieChart, Pie,
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
import type { BrokerCommandMetrics, MonthlyData, PrevYearStats, CategoryMetrics } from '@/lib/types/brokerCommandMetrics';

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

function letterGrade(pct: number): { letter: string; color: string } {
  if (pct >= 90) return { letter: 'A', color: 'text-green-600' };
  if (pct >= 80) return { letter: 'B', color: 'text-blue-600' };
  if (pct >= 70) return { letter: 'C', color: 'text-yellow-600' };
  if (pct >= 60) return { letter: 'D', color: 'text-orange-600' };
  return { letter: 'F', color: 'text-red-600' };
}

const formatNumber = (num: number | null | undefined) =>
  num != null ? num.toLocaleString() : '—';

// ── Chart configs ───────────────────────────────────────────────────────────

const marginChartConfig: ChartConfig = {
  grossMargin: { label: 'Gross Margin', color: 'hsl(var(--chart-1))' },
  grossMarginGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareMargin: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
  projectedMargin: { label: 'Projected', color: 'hsl(38 92% 50%)' },
};

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

// ── Multi-Year Production Comparison ─────────────────────────────────────────

type MultiYearData = {
  year: number;
  months: { month: number; label: string; grossMargin: number; volume: number; sales: number; gci: number }[];
  totals: { grossMargin: number; volume: number; sales: number; gci: number };
};

const YEAR_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

function MultiYearComparison({ teamId }: { teamId?: string | null }) {
  const { user } = useUser();
  const [allYears, setAllYears] = useState<MultiYearData[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<'grossMargin' | 'volume' | 'sales'>('grossMargin');
  const [view, setView] = useState<'month' | 'quarter' | 'year'>('month');
  const [compareMode, setCompareMode] = useState<'full' | 'ytd'>('full');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams();
        if (teamId) params.set('teamId', teamId);
        const res = await fetch(`/api/broker/multi-year-compare?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.years) {
          setAllYears(data.years);
          // Auto-select all years (or last 5 if too many)
          const yrs = data.years.map((y: MultiYearData) => y.year);
          setSelectedYears(yrs.length > 5 ? yrs.slice(-5) : yrs);
        }
      } catch (err) {
        console.error('[multi-year]', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, teamId]);

  const toggleYear = (yr: number) => {
    setSelectedYears(prev =>
      prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr]
    );
  };

  const metricLabel = metric === 'grossMargin' ? 'Gross Margin' : metric === 'volume' ? 'Dollar Volume' : 'Number of Sales';
  const metricFormatter = (val: number) =>
    metric === 'sales' ? val.toLocaleString() : formatCurrency(val, true);

  const todayMY = new Date();
  const currentYearMY = todayMY.getFullYear();
  const currentMonthIdxMY = todayMY.getMonth(); // 0-indexed

  // In YTD mode, cap all years at the same day-of-year as today
  const ytdMonthCutoff = currentMonthIdxMY; // 0-indexed, inclusive

  const getYearMonthLimit = (yrNum: number) => {
    if (compareMode === 'ytd') return ytdMonthCutoff;
    if (yrNum === currentYearMY) return currentMonthIdxMY; // never show future months
    return 11; // full year for past years in full mode
  };

  // Build chart data based on view
  const chartData = (() => {
    const filteredYears = allYears.filter(y => selectedYears.includes(y.year));

    if (view === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const point: Record<string, any> = { label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i] };
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

    // year view — one data point per year (sum up to cutoff in YTD mode)
    return filteredYears.map(yr => {
      const limit = getYearMonthLimit(yr.year);
      const val = compareMode === 'ytd' || yr.year === currentYearMY
        ? yr.months.slice(0, limit + 1).reduce((s, m) => s + (m[metric] ?? 0), 0)
        : yr.totals[metric] ?? 0;
      return { label: String(yr.year), value: val };
    });
  })();

  if (loading) return <Skeleton className="h-[500px] w-full" />;
  if (allYears.length < 2) return null; // Need at least 2 years for comparison

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Multi-Year Production Comparison
            </CardTitle>
            <CardDescription>Compare {metricLabel.toLowerCase()} across years</CardDescription>
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Metric selector */}
            <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grossMargin">Gross Margin</SelectItem>
                <SelectItem value="volume">Dollar Volume</SelectItem>
                <SelectItem value="sales">Number of Sales</SelectItem>
              </SelectContent>
            </Select>

            {/* View toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['month', 'quarter', 'year'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  {v === 'month' ? 'Monthly' : v === 'quarter' ? 'Quarterly' : 'Yearly'}
                </button>
              ))}
            </div>

            {/* YTD / Full Year toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['full', 'ytd'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompareMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    compareMode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  {m === 'full' ? 'Full Year' : `YTD (thru ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonthIdxMY]})`}
                </button>
              ))}
            </div>

            {/* Year selectors */}
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
        {/* Chart */}
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

        {/* Year totals summary table */}
        <div className="mt-6 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Year</th>
                <th className="px-4 py-2 text-right font-medium">Gross Margin</th>
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
                  const limit = getYearMonthLimit(yr.year);
                  const ytdMonths = yr.months.slice(0, limit + 1);
                  const margin = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.grossMargin, 0)
                    : yr.totals.grossMargin;
                  const volume = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.volume, 0)
                    : yr.totals.volume;
                  const sales = compareMode === 'ytd' || yr.year === currentYearMY
                    ? ytdMonths.reduce((s, m) => s + m.sales, 0)
                    : yr.totals.sales;
                  const metricVal = metric === 'grossMargin' ? margin : metric === 'volume' ? volume : sales;
                  const prev = arr[idx + 1];
                  // YoY Change always compares Jan–today for both years (never full-year vs YTD)
                  const ytdCutoff = currentMonthIdxMY + 1;
                  const ytdMetricVal = yr.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0);
                  const prevYtdMetricVal = prev
                    ? prev.months.slice(0, ytdCutoff).reduce((s, m) => s + m[metric], 0)
                    : null;
                  const change = prevYtdMetricVal && prevYtdMetricVal > 0 ? ((ytdMetricVal - prevYtdMetricVal) / prevYtdMetricVal * 100) : null;
                  const colorIdx = allYears.findIndex(y => y.year === yr.year);
                  return (
                    <tr key={yr.year} className="border-t">
                      <td className="px-4 py-2 font-medium flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: YEAR_COLORS[colorIdx % YEAR_COLORS.length] }} />
                        {yr.year}{compareMode === 'ytd' && <span className="text-xs text-muted-foreground ml-1">YTD</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(margin, true)}</td>
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

// ── Goals Editor with Smart Auto-Calculations + Editable Seasonality ────────

function GoalsEditor({
  months, year, prevYearStats, onSaved, segment = 'TOTAL',
}: {
  months: MonthlyData[];
  year: number;
  prevYearStats?: PrevYearStats;
  onSaved: () => void;
  segment?: string;
}) {
  const { user } = useUser();
  const [goals, setGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyMargin, setYearlyMargin] = useState('');
  const [goalAvgSalePrice, setGoalAvgSalePrice] = useState('');
  const [goalAvgCommPct, setGoalAvgCommPct] = useState('');
  // Editable seasonality weights (% of year for each month) — single weight drives both sales and volume
  const [seasonWeights, setSeasonWeights] = useState<Record<number, { pct: string }>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const hasPrevData = prevYearStats && prevYearStats.totalSales > 0;
  const avgSalePrice = prevYearStats?.avgSalePrice ?? 0;
  const avgCommPct = prevYearStats?.avgCommissionPct ?? 0;
  const avgMarginPct = prevYearStats?.avgMarginPct ?? 0;

  // Initialize from current goals + prev year seasonality
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

    // Initialize goal averages from prev year data
    if (prevYearStats?.avgSalePrice) setGoalAvgSalePrice(String(Math.round(prevYearStats.avgSalePrice)));
    if (prevYearStats?.avgCommissionPct) setGoalAvgCommPct(String(prevYearStats.avgCommissionPct.toFixed(2)));

    // Initialize seasonality weights from prev year sales %
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats?.seasonality?.[m - 1];
      sw[m] = { pct: String(s?.salesPct ?? 8.33) };
    }
    setSeasonWeights(sw);
  }, [months, prevYearStats]);

  const update = (month: number, field: 'margin' | 'volume' | 'sales', val: string) => {
    setGoals(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }));
  };

  const updateSeasonWeight = (month: number, val: string) => {
    setSeasonWeights(prev => ({ ...prev, [month]: { pct: val } }));
  };

  // Use goal averages if set, otherwise fall back to prev year actuals
  const effectiveAvgSalePrice = parseFloat(goalAvgSalePrice) || avgSalePrice;
  const effectiveAvgCommPct = parseFloat(goalAvgCommPct) || avgCommPct;

  // ── Auto-calculate derived fields when volume changes ───────────────────
  // Volume → auto-calc sales (volume / avgSalePrice) and margin
  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    if (vol > 0 && effectiveAvgSalePrice > 0) {
      setYearlySales(String(Math.round(vol / effectiveAvgSalePrice)));
    }
    if (vol > 0 && effectiveAvgCommPct > 0 && avgMarginPct > 0) {
      const totalGCI = vol * (effectiveAvgCommPct / 100);
      const calcMargin = Math.round(totalGCI * (avgMarginPct / 100));
      setYearlyMargin(String(calcMargin));
    }
  };

  // Sales → auto-calc volume (sales × avgSalePrice) and margin
  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    if (sales > 0 && effectiveAvgSalePrice > 0) {
      const calcVol = Math.round(sales * effectiveAvgSalePrice);
      setYearlyVolume(String(calcVol));
      if (effectiveAvgCommPct > 0 && avgMarginPct > 0) {
        const totalGCI = calcVol * (effectiveAvgCommPct / 100);
        setYearlyMargin(String(Math.round(totalGCI * (avgMarginPct / 100))));
      }
    }
  };

  // Margin → back-calculate volume and sales from margin
  const handleMarginChange = (val: string) => {
    setYearlyMargin(val);
    const margin = parseFloat(val) || 0;
    if (margin > 0 && avgMarginPct > 0 && effectiveAvgCommPct > 0) {
      const calcVol = Math.round(margin / ((effectiveAvgCommPct / 100) * (avgMarginPct / 100)));
      setYearlyVolume(String(calcVol));
      if (effectiveAvgSalePrice > 0) {
        setYearlySales(String(Math.round(calcVol / effectiveAvgSalePrice)));
      }
    }
  };

  // Auto-distribute yearly goal across months using seasonality weights
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

  // Distribute using even split weights
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

  // Apply prev year seasonality weights and distribute
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
      console.error('Failed to save goals:', err);
    } finally {
      setSaving(false);
    }
  };

  // Seasonality totals for validation
  const totalSeasonPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.pct) || 0), 0);

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
            Enter a yearly goal — sales count, volume, and margin auto-calculate from {hasPrevData ? `${prevYearStats.year}` : 'previous year'} averages.
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
                    <span className="text-muted-foreground">Avg Commission %</span>
                    <p className="font-semibold">{avgCommPct.toFixed(2)}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Gross Margin</span>
                    <p className="font-semibold">{formatCurrency(prevYearStats.avgGrossMargin)}/deal ({prevYearStats.avgMarginPct}%)</p>
                  </div>
                </div>
              </div>
            )}

            {/* Yearly Goal Inputs — Auto-Calculate */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Yearly Goals for {year}</h4>
                {hasPrevData && (
                  <span className="text-xs text-muted-foreground">
                    Enter any field — others auto-calculate using {prevYearStats.year} averages
                  </span>
                )}
              </div>

              {/* Increase Production Selector */}
              {hasPrevData && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Increase Production Over Last Year</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[5, 10, 15, 20, 25, 30, 40, 50].map(pct => {
                      const isActive = yearlyVolume && Math.abs(parseFloat(yearlyVolume) - Math.round(prevYearStats.totalVolume * (1 + pct / 100))) < 100;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const newVol = Math.round(prevYearStats.totalVolume * (1 + pct / 100));
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
                    <div className="flex items-center gap-1 ml-2">
                      <Input
                        type="number"
                        placeholder="Custom %"
                        className="w-24 h-8 text-sm"
                        min={0}
                        max={500}
                        onChange={e => {
                          const pct = parseFloat(e.target.value);
                          if (pct > 0 && prevYearStats.totalVolume > 0) {
                            const newVol = Math.round(prevYearStats.totalVolume * (1 + pct / 100));
                            handleVolumeChange(String(newVol));
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  {yearlyVolume && prevYearStats.totalVolume > 0 && (
                    <p className="text-xs text-blue-600">
                      {formatCurrency(prevYearStats.totalVolume, true)} → {formatCurrency(parseFloat(yearlyVolume), true)}
                      {' '}({((parseFloat(yearlyVolume) / prevYearStats.totalVolume - 1) * 100).toFixed(1)}% increase)
                    </p>
                  )}
                </div>
              )}
              {/* Target Averages — drive the auto-calculations */}
              <div className="border border-dashed rounded-lg p-4 space-y-3 bg-muted/20">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Averages (drives calculations below)</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Gross Margin Goal ($)
                      {avgMarginPct > 0 && <span className="text-muted-foreground ml-1">@ {avgMarginPct}% margin</span>}
                    </Label>
                    <Input
                      type="number"
                      value={yearlyMargin}
                      onChange={e => handleMarginChange(e.target.value)}
                      placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats!.totalGrossMargin, true)}` : 'e.g. 500000'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Avg Sale Price Goal ($)
                      {hasPrevData && <span className="text-muted-foreground ml-1">Last yr: {formatCurrency(prevYearStats!.avgSalePrice)}</span>}
                    </Label>
                    <Input
                      type="number"
                      value={goalAvgSalePrice}
                      onChange={e => {
                        setGoalAvgSalePrice(e.target.value);
                        // Recalculate sales from existing volume
                        const price = parseFloat(e.target.value) || 0;
                        if (price > 0 && yearlyVolume) {
                          setYearlySales(String(Math.round(parseFloat(yearlyVolume) / price)));
                        }
                      }}
                      placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats!.avgSalePrice)}` : 'e.g. 350000'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Avg Commission % Goal
                      {hasPrevData && <span className="text-muted-foreground ml-1">Last yr: {prevYearStats!.avgCommissionPct.toFixed(2)}%</span>}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={goalAvgCommPct}
                      onChange={e => {
                        setGoalAvgCommPct(e.target.value);
                        // Recalculate margin from existing volume
                        const commPct = parseFloat(e.target.value) || 0;
                        const vol = parseFloat(yearlyVolume) || 0;
                        if (commPct > 0 && vol > 0 && avgMarginPct > 0) {
                          setYearlyMargin(String(Math.round(vol * (commPct / 100) * (avgMarginPct / 100))));
                        }
                      }}
                      placeholder={hasPrevData ? `Last year: ${prevYearStats!.avgCommissionPct.toFixed(2)}` : 'e.g. 3.00'}
                    />
                  </div>
                </div>
              </div>

              {/* Yearly totals (auto-calculated from averages above, or enter manually) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="yearly-volume" className="text-xs">Total Volume Goal ($) — auto-calculated</Label>
                  <Input
                    id="yearly-volume"
                    type="number"
                    value={yearlyVolume}
                    onChange={e => handleVolumeChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats!.totalVolume, true)}` : 'e.g. 50000000'}
                  />
                  {hasPrevData && yearlyVolume && (
                    <p className="text-xs text-muted-foreground">
                      {((parseFloat(yearlyVolume) / prevYearStats!.totalVolume) * 100).toFixed(0)}% of last year
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yearly-sales" className="text-xs">
                    Total Sales Goal (#) — auto-calculated
                    {effectiveAvgSalePrice > 0 && <span className="text-muted-foreground ml-1">@ {formatCurrency(effectiveAvgSalePrice)} avg</span>}
                  </Label>
                  <Input
                    id="yearly-sales"
                    type="number"
                    value={yearlySales}
                    onChange={e => handleSalesChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${prevYearStats!.totalSales}` : 'e.g. 200'}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default" onClick={distribute} disabled={!yearlyVolume && !yearlySales && !yearlyMargin}>
                  <Target className="mr-2 h-4 w-4" />
                  Distribute Across Months
                </Button>
                {hasPrevData && (
                  <Button variant="default" onClick={distributeWithPrevSeasonality} disabled={!yearlyVolume && !yearlySales && !yearlyMargin}>
                    Use {prevYearStats!.year} Seasonality
                  </Button>
                )}
                <Button variant="default" onClick={distributeEven} disabled={!yearlyVolume && !yearlySales && !yearlyMargin}>
                  Avg / Even Split
                </Button>
              </div>
            </div>

            {/* Monthly Breakdown Table — Seasonality inline as second column */}
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
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
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
                            onChange={e => updateSeasonWeight(m, e.target.value)}
                            placeholder="8.33"
                            className="h-8 w-20"
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
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showProjected, setShowProjected] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null); // null = all teams
  const [selectedType, setSelectedType] = useState<string | null>(null); // null = all types
  const [data, setData] = useState<BrokerCommandMetrics | null>(null);
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
      const params = new URLSearchParams({ year: String(year) });
      if (compareYear) params.set('compareYear', String(compareYear));
      if (selectedTeam) params.set('teamId', selectedTeam);
      if (selectedType) params.set('type', selectedType);
      const res = await fetch(
        `/api/broker/command-metrics?${params.toString()}`,
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
  }, [user, year, compareYear, selectedTeam, selectedType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset catYear when main year changes
  useEffect(() => { setCatYear(year); setCatBreakdown(null); }, [year]);

  // Fetch category breakdown for a different year
  useEffect(() => {
    if (!user || catYear === year) { setCatBreakdown(null); return; }
    setCatLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken(true);
        const params = new URLSearchParams({ year: String(catYear) });
        if (selectedTeam) params.set('teamId', selectedTeam);
        if (selectedType) params.set('type', selectedType);
        const res = await fetch(`/api/broker/command-metrics?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setCatBreakdown(d.overview?.categoryBreakdown ?? null);
      } catch { /* silent */ }
      finally { setCatLoading(false); }
    })();
  }, [catYear, year, user, selectedTeam, selectedType]);

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

  // ── Computed averages ─────────────────────────────────────────────────
  const avgSalePrice = totals.closedCount > 0
    ? Math.round(totals.closedVolume / totals.closedCount) : 0;
  const avgCommissionPct = totals.closedVolume > 0
    ? Math.round((totals.totalGCI / totals.closedVolume) * 10000) / 100 : 0;
  const avgMarginPerDeal = totals.closedCount > 0
    ? Math.round(totals.grossMargin / totals.closedCount) : 0;

  // Yearly goal totals (sum of monthly goals)
  const yearlyGrossMarginGoal = months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) || null;
  const yearlyVolumeGoal = months.reduce((s, m) => s + (m.volumeGoal ?? 0), 0) || null;
  const yearlySalesGoal = months.reduce((s, m) => s + (m.salesCountGoal ?? 0), 0) || null;

  // Prorate goals to YTD pace when viewing the current year
  const today = new Date();
  const currentYear = today.getFullYear();
  const isCurrentYear = year === currentYear;
  const daysInYear = ((currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0) ? 366 : 365;
  const startOfYear = new Date(currentYear, 0, 1);
  const daysElapsed = Math.floor((today.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const ytdFraction = isCurrentYear ? daysElapsed / daysInYear : 1;
  const currentMonthIdx = today.getMonth(); // 0-indexed, e.g. March = 2

  // ── Seasonality Projection ────────────────────────────────────────────────
  // For each metric, project future months based on how actual YTD compares to
  // the YTD portion of the goal seasonality curve.
  const projectedMonthData = (() => {
    if (!isCurrentYear) return null;
    const completedMonths = months.slice(0, currentMonthIdx + 1);

    const compute = (actualKey: keyof typeof months[0], goalKey: keyof typeof months[0]) => {
      const ytdActual = completedMonths.reduce((s, m) => s + ((m[actualKey] as number) ?? 0), 0);
      const yearlyGoalTotal = months.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0);
      const ytdGoalShare = yearlyGoalTotal > 0
        ? completedMonths.reduce((s, m) => s + ((m[goalKey] as number) ?? 0), 0) / yearlyGoalTotal
        : (currentMonthIdx + 1) / 12;
      const projectedFullYear = ytdGoalShare > 0 ? ytdActual / ytdGoalShare : 0;
      return months.map((m, i) => {
        if (i <= currentMonthIdx) return null; // actuals shown for past months
        const monthShare = yearlyGoalTotal > 0
          ? ((m[goalKey] as number) ?? 0) / yearlyGoalTotal
          : 1 / 12;
        return Math.round(projectedFullYear * monthShare);
      });
    };

    return {
      margin: compute('grossMargin', 'grossMarginGoal'),
      volume: compute('closedVolume', 'volumeGoal'),
      sales: compute('closedCount', 'salesCountGoal'),
      // Projected full-year totals for the banner
      fullYearMargin: (() => {
        const ytd = completedMonths.reduce((s, m) => s + m.grossMargin, 0);
        const yearlyGoal = months.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0);
        const share = yearlyGoal > 0 ? completedMonths.reduce((s, m) => s + (m.grossMarginGoal ?? 0), 0) / yearlyGoal : (currentMonthIdx + 1) / 12;
        return share > 0 ? Math.round(ytd / share) : 0;
      })(),
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
  const ytdGrossMarginGoal = yearlyGrossMarginGoal ? Math.round(yearlyGrossMarginGoal * ytdFraction) : null;
  const ytdVolumeGoal = yearlyVolumeGoal ? Math.round(yearlyVolumeGoal * ytdFraction) : null;
  const ytdSalesGoal = yearlySalesGoal ? Math.round(yearlySalesGoal * ytdFraction * 10) / 10 : null;

  const gradeMargin = ytdGrossMarginGoal
    ? Math.round((totals.grossMargin / ytdGrossMarginGoal) * 100) : null;
  const gradeVolume = ytdVolumeGoal
    ? Math.round((totals.closedVolume / ytdVolumeGoal) * 100) : null;
  const gradeSales = ytdSalesGoal
    ? Math.round((totals.closedCount / ytdSalesGoal) * 100) : null;

  const teamName = selectedTeam
    ? (data.teams ?? []).find(t => t.teamId === selectedTeam)?.teamName ?? selectedTeam
    : 'All Teams';
  const typeLabel = selectedType
    ? { residential: 'Residential', commercial: 'Commercial', commercial_sale: 'Commercial Sales', commercial_lease: 'Commercial Leases', land: 'Land', rental: 'Rentals' }[selectedType] ?? selectedType
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Broker Command Center</h1>
          <p className="text-muted-foreground">
            {selectedTeam ? `${teamName}` : 'All teams'}
            {typeLabel ? ` · ${typeLabel}` : ''} — {year}
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

      {/* Team Tabs */}
      {(data.teams ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedTeam === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedTeam(null)}
          >
            All Teams
          </Button>
          {(data.teams ?? []).map(team => (
            <Button
              key={team.teamId}
              variant={selectedTeam === team.teamId ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTeam(team.teamId)}
            >
              {team.teamName}
            </Button>
          ))}
        </div>
      )}

      {/* Transaction Type Filter */}
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

      {/* ── Consolidated KPI Section ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue & Margin Block */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Revenue & Gross Margin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Total Commission (GCI)</span>
              <span className="text-xl font-bold">{formatCurrency(totals.totalGCI)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Gross Margin (Retained)</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(totals.grossMargin)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Gross Margin %</span>
              <span className="text-lg font-semibold">{totals.grossMarginPct > 0 ? `${totals.grossMarginPct.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Transaction Fees</span>
              <span className="font-medium">{formatCurrency(totals.transactionFees)}</span>
            </div>
            {gradeMargin && (() => { const g = letterGrade(gradeMargin); return (
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-muted-foreground text-xs">{isCurrentYear ? 'Grade vs YTD Goal' : 'Grade vs Goal'}</span>
                <span className="flex items-center gap-2">
                  <span className={`text-2xl font-black ${g.color}`}>{g.letter}</span>
                  <span className="text-xs text-muted-foreground">
                    {gradeMargin}% · {formatCurrency(totals.grossMargin, true)} / {formatCurrency(ytdGrossMarginGoal!, true)}
                  </span>
                </span>
              </div>
            ); })()}
          </CardContent>
        </Card>

        {/* Sales & Volume Block */}
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

        {/* Averages Block */}
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
              <span className="text-muted-foreground text-sm">Avg Commission %</span>
              <span className="text-lg font-semibold">{avgCommissionPct > 0 ? `${avgCommissionPct.toFixed(2)}%` : '—'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground text-sm">Avg Gross Margin / Deal</span>
              <span className="text-lg font-semibold">{formatCurrency(avgMarginPerDeal)}</span>
            </div>
            {data.prevYearStats && totals.closedCount > 0 && (
              <div className="border-t pt-2 space-y-1 text-xs">
                {(() => {
                  const prevAvg = data.prevYearStats!.avgSalePrice;
                  const priceDiff = prevAvg > 0 ? ((avgSalePrice - prevAvg) / prevAvg * 100) : null;
                  return (
                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>vs {data.prevYearStats!.year} avg sale price:</span>
                        <span className="flex items-center gap-1">
                          {formatCurrency(prevAvg)}
                          {priceDiff !== null && (
                            <span className={`font-semibold ${priceDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ({priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>vs {data.prevYearStats!.year} commission %:</span>
                        <span>{data.prevYearStats!.avgCommissionPct.toFixed(2)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── CHART 1: Gross Margin ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Gross Margin</CardTitle>
              <CardDescription>
                Company retained revenue after agent payouts — {year}
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
            </div>
          </div>
          {gradeMargin && (() => { const g = letterGrade(gradeMargin); return (
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border mx-0 mt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? `YTD Grade (as of today)` : `Full Year Grade`}
                </p>
                <p className="text-sm font-semibold">
                  {formatCurrency(totals.grossMargin, true)} <span className="text-muted-foreground font-normal">/ {formatCurrency(ytdGrossMarginGoal!, true)} goal</span>
                </p>
                {compareYear && data.comparisonData && (() => {
                  const compYTD = data.comparisonData.months.slice(0, isCurrentYear ? currentMonthIdx + 1 : 12).reduce((s, m) => s + m.grossMargin, 0);
                  const diff = totals.grossMargin - compYTD;
                  const pct = compYTD > 0 ? (diff / compYTD * 100) : 0;
                  return <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {compareYear} YTD: {diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>;
                })()}
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className={`text-5xl font-black leading-none ${g.color}`}>{g.letter}</span>
                <span className={`text-xl font-bold ${g.color}`}>{gradeMargin}%</span>
              </div>
            </div>
          ); })()}
        </CardHeader>
        <CardContent>
          <ChartContainer config={marginChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                grossMargin: isCurrentYear && i > currentMonthIdx ? null : m.grossMargin,
                grossMarginGoal: showGoals ? (isCurrentYear && i > currentMonthIdx ? null : m.grossMarginGoal) : null,
                compareMargin: compareYear ? (data.comparisonData?.months?.[i]?.grossMargin ?? null) : null,
                projectedMargin: showProjected ? (projectedMonthData?.margin[i] ?? null) : null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                const labels: Record<string, string> = {
                  grossMargin: `${year} Gross Margin`, grossMarginGoal: `${year} Goal`,
                  compareMargin: `${compareYear} Gross Margin`, projectedMargin: 'Projected',
                };
                return [formatCurrency(Number(value)), labels[name as string] ?? name];
              }} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="grossMargin" fill="var(--color-grossMargin)" radius={[4, 4, 0, 0]} name={`${year}`} />
              {compareYear && <Bar dataKey="compareMargin" fill="var(--color-compareMargin)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />}
              {showGoals && <Bar dataKey="grossMarginGoal" fill="var(--color-grossMarginGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />}
              {showProjected && <Bar dataKey="projectedMargin" fill="var(--color-projectedMargin)" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
            </BarChart>
          </ChartContainer>
          {/* Summaries */}
          {(compareYear && data.comparisonData || showProjected && projectedMonthData) && (
            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              {compareYear && data.comparisonData && (() => {
                const ytdMonths = isCurrentYear ? currentMonthIdx + 1 : 12;
                const ytdLabel = isCurrentYear ? ' YTD' : '';
                const compMarginYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.grossMargin, 0);
                const compVolumeYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedVolume, 0);
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const diff = totals.grossMargin - compMarginYTD;
                const pctChange = compMarginYTD > 0 ? (diff / compMarginYTD * 100) : 0;
                const yoyPct = compMarginYTD > 0 ? Math.round((totals.grossMargin / compMarginYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Margin vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Volume</span><p className="font-semibold">{formatCurrency(compVolumeYTD, true)}</p></div>
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
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Margin</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 2: Dollar Volume ────────────────────────────────────────── */}
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
                  {isCurrentYear ? `YTD Volume Grade (as of today)` : `Full Year Volume Grade`}
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
                const compMarginYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.grossMargin, 0);
                const compSalesYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.closedCount, 0);
                const diff = totals.closedVolume - compVolumeYTD;
                const pctChange = compVolumeYTD > 0 ? (diff / compVolumeYTD * 100) : 0;
                const yoyPct = compVolumeYTD > 0 ? Math.round((totals.closedVolume / compVolumeYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Volume vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Margin</span><p className="font-semibold">{formatCurrency(compMarginYTD, true)}</p></div>
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
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Margin</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CHART 3: Number of Sales ──────────────────────────────────────── */}
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
                  {isCurrentYear ? `YTD Sales Grade (as of today)` : `Full Year Sales Grade`}
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
                const compMarginYTD = data.comparisonData.months.slice(0, ytdMonths).reduce((s, m) => s + m.grossMargin, 0);
                const diff = totals.closedCount - compSalesYTD;
                const pctChange = compSalesYTD > 0 ? (diff / compSalesYTD * 100) : 0;
                const yoyPct = compSalesYTD > 0 ? Math.round((totals.closedCount / compSalesYTD) * 100) : 0;
                const yoyGrade = letterGrade(yoyPct);
                return (
                  <div className="grid grid-cols-4 gap-4 items-start">
                    <div><span className="text-muted-foreground">Sales vs {compareYear}{ytdLabel}</span><p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{diff} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Volume</span><p className="font-semibold">{formatCurrency(compVolumeYTD, true)}</p></div>
                    <div><span className="text-muted-foreground">{compareYear}{ytdLabel} Margin</span><p className="font-semibold">{formatCurrency(compMarginYTD, true)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground mr-1">YoY</span>
                      <span className={`text-3xl font-black leading-none ${yoyGrade.color}`}>{yoyGrade.letter}</span>
                      <span className={`text-base font-bold ${yoyGrade.color}`}>{yoyPct}%</span>
                    </div>
                  </div>
                );
              })()}
              {showProjected && projectedMonthData && (
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground">Projected Full-Year Sales</span><p className="font-semibold text-amber-600">{formatNumber(projectedMonthData.fullYearSales)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Volume</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearVolume, true)}</p></div>
                  <div><span className="text-muted-foreground">Projected Full-Year Margin</span><p className="font-semibold text-amber-600">{formatCurrency(projectedMonthData.fullYearMargin, true)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Multi-Year Production Comparison ──────────────────────────────── */}
      <MultiYearComparison teamId={selectedTeam} />

      {/* ── Category Breakdown ─────────────────────────────────────────────── */}
      {(() => {
        const CAT_LABELS: Record<string, string> = {
          residential_sale: 'Residential',
          commercial_sale: 'Commercial Sale',
          commercial_lease: 'Commercial Lease',
          land: 'Land',
          rental: 'Rental / Lease',
        };
        const CAT_KEYS = ['residential_sale', 'commercial_sale', 'commercial_lease', 'land', 'rental'] as const;
        const CAT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

        const activeCat = catBreakdown ?? categoryBreakdown;
        const catYearOptions = [year, ...(data.availableYears ?? [])].sort((a, b) => b - a);

        const marginData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k].netRevenue, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);
        const salesData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k].count, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);
        const volumeData = CAT_KEYS
          .map((k, i) => ({ name: CAT_LABELS[k], value: activeCat.closed[k].volume, color: CAT_COLORS[i] }))
          .filter(d => d.value > 0);

        if (marginData.length === 0 && !catLoading) return null;

        const renderPie = (data: typeof marginData, formatter: (v: number) => string, title: string) => (
          <div className="flex flex-col items-center">
            <p className="text-sm font-semibold mb-2 text-center">{title}</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(val: number) => formatter(val)} />
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Category Breakdown — {catYear}</CardTitle>
                  <CardDescription>Closed transactions by type — gross margin, sales, and volume</CardDescription>
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
                    {renderPie(marginData, v => formatCurrency(v, true), 'Gross Margin')}
                    {renderPie(salesData, v => `${v} sales`, 'Number of Sales')}
                    {renderPie(volumeData, v => formatCurrency(v, true), 'Dollar Volume')}
                  </div>
                  {/* Detail table */}
                  <div className="mt-6 border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Category</th>
                          <th className="px-4 py-2 text-right font-medium">Closed</th>
                          <th className="px-4 py-2 text-right font-medium">Volume</th>
                          <th className="px-4 py-2 text-right font-medium">Gross Margin</th>
                          <th className="px-4 py-2 text-right font-medium">Pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CAT_KEYS.map((k, i) => {
                          const c = activeCat.closed[k];
                          const p = activeCat.pending[k];
                          if (c.count === 0 && p.count === 0) return null;
                          return (
                            <tr key={k} className="border-t">
                              <td className="px-4 py-2 flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                                {CAT_LABELS[k]}
                              </td>
                              <td className="px-4 py-2 text-right">{c.count}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.volume, true)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(c.netRevenue, true)}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">{p.count > 0 ? `${p.count} (${formatCurrency(p.volume, true)})` : '—'}</td>
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
      })()}

      {/* ── Goals Editor ───────────────────────────────────────────────────── */}
      <GoalsEditor months={months} year={year} prevYearStats={data.prevYearStats} onSaved={fetchData} segment={selectedTeam || 'TOTAL'} />
    </div>
  );
}
