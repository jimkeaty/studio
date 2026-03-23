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
  compareMargin: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
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

// ── Goals Editor with Smart Auto-Calculations + Editable Seasonality ────────

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
  // Editable seasonality weights (% of year for each month)
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

    // Initialize seasonality weights
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats?.seasonality?.[m - 1];
      sw[m] = {
        salesPct: String(s?.salesPct ?? 8.33),
        volumePct: String(s?.volumePct ?? 8.33),
      };
    }
    setSeasonWeights(sw);
  }, [months, prevYearStats]);

  const update = (month: number, field: 'margin' | 'volume' | 'sales', val: string) => {
    setGoals(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }));
  };

  const updateSeasonWeight = (month: number, field: 'salesPct' | 'volumePct', val: string) => {
    setSeasonWeights(prev => ({ ...prev, [month]: { ...prev[month], [field]: val } }));
  };

  // ── Auto-calculate derived fields when volume changes ───────────────────
  // Volume → auto-calc sales (volume / avgSalePrice) and margin
  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    if (vol > 0 && avgSalePrice > 0) {
      const calcSales = Math.round(vol / avgSalePrice);
      setYearlySales(String(calcSales));
    }
    if (vol > 0 && avgCommPct > 0 && avgMarginPct > 0) {
      // volume × avgCommission% = total GCI → × avgMarginPct% = gross margin
      const totalGCI = vol * (avgCommPct / 100);
      const calcMargin = Math.round(totalGCI * (avgMarginPct / 100));
      setYearlyMargin(String(calcMargin));
    }
  };

  // Sales → auto-calc volume (sales × avgSalePrice) and margin
  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    if (sales > 0 && avgSalePrice > 0) {
      const calcVol = Math.round(sales * avgSalePrice);
      setYearlyVolume(String(calcVol));
      if (avgCommPct > 0 && avgMarginPct > 0) {
        const totalGCI = calcVol * (avgCommPct / 100);
        const calcMargin = Math.round(totalGCI * (avgMarginPct / 100));
        setYearlyMargin(String(calcMargin));
      }
    }
  };

  // Margin → back-calculate volume and sales from margin
  const handleMarginChange = (val: string) => {
    setYearlyMargin(val);
    const margin = parseFloat(val) || 0;
    if (margin > 0 && avgMarginPct > 0 && avgCommPct > 0) {
      // margin = volume × commPct × marginPct
      // volume = margin / (commPct × marginPct)
      const calcVol = Math.round(margin / ((avgCommPct / 100) * (avgMarginPct / 100)));
      setYearlyVolume(String(calcVol));
      if (avgSalePrice > 0) {
        setYearlySales(String(Math.round(calcVol / avgSalePrice)));
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
      const volPct = parseFloat(sw?.volumePct) || 8.33;
      const salesPct = parseFloat(sw?.salesPct) || 8.33;

      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol * (volPct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (salesPct / 100))) : '',
        margin: margin > 0 ? String(Math.round(margin * (salesPct / 100))) : '',
      };
    }
    setGoals(newGoals);
  };

  // Reset seasonality to even split
  const resetSeasonality = () => {
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      sw[m] = { salesPct: '8.33', volumePct: '8.33' };
    }
    setSeasonWeights(sw);
  };

  // Reset seasonality to previous year
  const resetSeasonalityToPrev = () => {
    if (!prevYearStats) return;
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      const s = prevYearStats.seasonality[m - 1];
      sw[m] = {
        salesPct: String(s?.salesPct ?? 8.33),
        volumePct: String(s?.volumePct ?? 8.33),
      };
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

  // Seasonality totals for validation
  const totalSalesPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.salesPct) || 0), 0);
  const totalVolPct = Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.volumePct) || 0), 0);

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="yearly-volume" className="text-xs">Total Volume Goal ($)</Label>
                  <Input
                    id="yearly-volume"
                    type="number"
                    value={yearlyVolume}
                    onChange={e => handleVolumeChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats.totalVolume, true)}` : 'e.g. 50000000'}
                  />
                  {hasPrevData && yearlyVolume && (
                    <p className="text-xs text-muted-foreground">
                      {((parseFloat(yearlyVolume) / prevYearStats.totalVolume) * 100).toFixed(0)}% of last year
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yearly-sales" className="text-xs">
                    Total Sales Goal (#)
                    {avgSalePrice > 0 && <span className="text-muted-foreground ml-1">@ {formatCurrency(avgSalePrice)} avg</span>}
                  </Label>
                  <Input
                    id="yearly-sales"
                    type="number"
                    value={yearlySales}
                    onChange={e => handleSalesChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${prevYearStats.totalSales}` : 'e.g. 200'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yearly-margin" className="text-xs">
                    Total Gross Margin Goal ($)
                    {avgMarginPct > 0 && <span className="text-muted-foreground ml-1">@ {avgMarginPct}% margin</span>}
                  </Label>
                  <Input
                    id="yearly-margin"
                    type="number"
                    value={yearlyMargin}
                    onChange={e => handleMarginChange(e.target.value)}
                    placeholder={hasPrevData ? `Last year: ${formatCurrency(prevYearStats.totalGrossMargin, true)}` : 'e.g. 500000'}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default" onClick={distribute} disabled={!yearlyVolume && !yearlySales && !yearlyMargin}>
                  <Target className="mr-2 h-4 w-4" />
                  Distribute Across Months
                </Button>
              </div>
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
                      <Button variant="outline" size="sm" onClick={resetSeasonalityToPrev}>
                        Use {prevYearStats.year} Data
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={resetSeasonality}>
                      Even Split
                    </Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const sw = seasonWeights[m] || { salesPct: '8.33', volumePct: '8.33' };
                      const label = months.find(md => md.month === m)?.label || `M${m}`;
                      return (
                        <div key={m} className="border rounded p-2 space-y-1">
                          <span className="font-medium text-xs">{label}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              value={sw.salesPct}
                              onChange={e => updateSeasonWeight(m, 'salesPct', e.target.value)}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-xs text-muted-foreground">% sales</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              value={sw.volumePct}
                              onChange={e => updateSeasonWeight(m, 'volumePct', e.target.value)}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-xs text-muted-foreground">% vol</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className={totalSalesPct < 99 || totalSalesPct > 101 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      Sales total: {totalSalesPct.toFixed(1)}%
                    </span>
                    <span className={totalVolPct < 99 || totalVolPct > 101 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      Volume total: {totalVolPct.toFixed(1)}%
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
                    <th className="text-left py-2 pr-2 font-medium">Month</th>
                    <th className="text-left py-2 px-2 font-medium">Volume Goal ($)</th>
                    <th className="text-left py-2 px-2 font-medium">Sales Goal (#)</th>
                    <th className="text-left py-2 px-2 font-medium">Margin Goal ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const g = goals[m] || { margin: '', volume: '', sales: '' };
                    const label = months.find(md => md.month === m)?.label || `M${m}`;
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{label}</td>
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
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [data, setData] = useState<BrokerCommandMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(year) });
      if (compareYear) params.set('compareYear', String(compareYear));
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
  }, [user, year, compareYear]);

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
  const gradeMargin = yearlyGrossMarginGoal
    ? Math.round((totals.grossMargin / yearlyGrossMarginGoal) * 100) : null;
  const gradeVolume = yearlyVolumeGoal
    ? Math.round((totals.closedVolume / yearlyVolumeGoal) * 100) : null;
  const gradeSales = yearlySalesGoal
    ? Math.round((totals.closedCount / yearlySalesGoal) * 100) : null;

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
            {gradeMargin && (
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Grade vs Goal</span>
                <span className={`text-sm font-bold ${gradeMargin >= 100 ? 'text-green-600' : gradeMargin >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {gradeMargin}%
                  <span className="text-muted-foreground font-normal text-xs ml-1">
                    ({formatCurrency(totals.grossMargin, true)} / {formatCurrency(yearlyGrossMarginGoal!, true)})
                  </span>
                </span>
              </div>
            )}
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
                {gradeVolume && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Volume Grade</span>
                    <span className={`text-sm font-bold ${gradeVolume >= 100 ? 'text-green-600' : gradeVolume >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {gradeVolume}%
                    </span>
                  </div>
                )}
                {gradeSales && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Sales Grade</span>
                    <span className={`text-sm font-bold ${gradeSales >= 100 ? 'text-green-600' : gradeSales >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {gradeSales}%
                    </span>
                  </div>
                )}
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
                <div className="flex justify-between text-muted-foreground">
                  <span>vs {data.prevYearStats.year}:</span>
                  <span>
                    {formatCurrency(data.prevYearStats.avgSalePrice)} avg price ·{' '}
                    {data.prevYearStats.avgCommissionPct.toFixed(2)}% comm
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── CHART 1: Gross Margin vs Goal + YoY Comparison ─────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Monthly Gross Margin vs Goal</CardTitle>
              <CardDescription>
                Company retained revenue after agent payouts — {year}
                {compareYear ? ` compared to ${compareYear}` : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Compare to:</span>
              <Select
                value={compareYear ? String(compareYear) : 'none'}
                onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(data.availableYears ?? []).map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={marginChartConfig} className="h-[350px] w-full">
            <BarChart
              data={months.map((m, i) => ({
                ...m,
                compareMargin: data.comparisonData?.months?.[i]?.grossMargin ?? null,
              }))}
              margin={{ top: 20, right: 20, bottom: 5, left: 20 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={val => formatCurrency(val, true)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        grossMargin: `${year} Gross Margin`,
                        grossMarginGoal: `${year} Goal`,
                        compareMargin: `${compareYear ?? ''} Gross Margin`,
                      };
                      return [formatCurrency(Number(value)), labels[name as string] ?? name];
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="grossMargin" fill="var(--color-grossMargin)" radius={[4, 4, 0, 0]} name={`${year}`} />
              {compareYear && (
                <Bar dataKey="compareMargin" fill="var(--color-compareMargin)" radius={[4, 4, 0, 0]} opacity={0.6} name={`${compareYear}`} />
              )}
              <Bar dataKey="grossMarginGoal" fill="var(--color-grossMarginGoal)" radius={[4, 4, 0, 0]} opacity={0.35} name="Goal" />
            </BarChart>
          </ChartContainer>
          {/* YoY Summary when comparing */}
          {compareYear && data.comparisonData && (
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm border-t pt-4">
              {(() => {
                const compTotal = data.comparisonData.months.reduce((s, m) => s + m.grossMargin, 0);
                const diff = totals.grossMargin - compTotal;
                const pctChange = compTotal > 0 ? ((diff / compTotal) * 100) : 0;
                const compVolume = data.comparisonData.months.reduce((s, m) => s + m.closedVolume, 0);
                const compSales = data.comparisonData.months.reduce((s, m) => s + m.closedCount, 0);
                return (
                  <>
                    <div>
                      <span className="text-muted-foreground">Margin Change</span>
                      <p className={`font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff, true)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{compareYear} Total Volume</span>
                      <p className="font-semibold">{formatCurrency(compVolume, true)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{compareYear} Total Sales</span>
                      <p className="font-semibold">{formatNumber(compSales)}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
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
