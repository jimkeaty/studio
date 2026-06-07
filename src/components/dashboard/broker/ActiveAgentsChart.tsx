'use client';
// ActiveAgentsChart — 12-month stacked bar chart of active agent counts
// Mirrors the existing Agent Production Goals chart pattern in BrokerDashboardInner.
// Props:
//   year         — calendar year to display (default: current year)
//   showGoalEdit — whether to show the inline goal editor (broker command only)
import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, Legend,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, TrendingUp, UserPlus, UserMinus, Save, Target } from 'lucide-react';
import { useUser } from '@/firebase';

// ── Chart config (mirrors production chart colors) ───────────────────────────
const chartConfig: ChartConfig = {
  activeClosed: { label: 'Active (Closed Deal)', color: 'hsl(var(--chart-1))' },
  activeTenure: { label: 'Active (No Deals Yet)', color: 'hsl(var(--chart-2))' },
  pipeline:     { label: 'Pipeline (Upcoming)', color: 'hsl(var(--chart-4))' },
  goal:         { label: 'Goal', color: 'hsl(var(--chart-3))' },
  projected:    { label: 'Projected', color: 'hsl(38 92% 50%)' },
  compare:      { label: 'Prior Year', color: 'hsl(var(--chart-5))' },
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({
  title, value, sub, icon: Icon, trend,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Goal Editor (inline, per-month) ─────────────────────────────────────────
function GoalEditor({
  year, months, token, onSaved,
}: {
  year: number;
  months: any[];
  token: string;
  onSaved: () => void;
}) {
  const [goals, setGoals] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [yearlyGoal, setYearlyGoal] = useState('');

  useEffect(() => {
    const map: Record<number, string> = {};
    months.forEach(m => {
      if (m.goal != null) map[m.month] = String(m.goal);
    });
    setGoals(map);
  }, [months]);

  const distributeYearly = () => {
    const total = parseInt(yearlyGoal, 10);
    if (!total || total <= 0) return;
    const newGoals: Record<number, string> = {};
    for (let m = 1; m <= 12; m++) newGoals[m] = String(total);
    setGoals(newGoals);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/broker/active-agents/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, goals }),
      });
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-sm">Year-End Agent Count Goal</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              placeholder="e.g. 50"
              value={yearlyGoal}
              onChange={e => setYearlyGoal(e.target.value)}
              className="w-36"
            />
            <Button variant="outline" size="sm" onClick={distributeYearly}>
              Apply to All Months
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const label = new Date(2000, i).toLocaleString('default', { month: 'short' });
          return (
            <div key={m} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                value={goals[m] ?? ''}
                onChange={e => setGoals(prev => ({ ...prev, [m]: e.target.value }))}
                className="h-8 text-sm"
                placeholder="—"
              />
            </div>
          );
        })}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving…' : 'Save Goals'}
      </Button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface ActiveAgentsChartProps {
  /** Whether to show the goal editor panel (broker command / recruiting admin) */
  showGoalEdit?: boolean;
  /** Initial year to display */
  initialYear?: number;
}

export function ActiveAgentsChart({ showGoalEdit = false, initialYear }: ActiveAgentsChartProps) {
  const { user } = useUser();
  const [year, setYear] = useState(initialYear ?? new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Toggles
  const [showGoal, setShowGoal] = useState(true);
  const [showProjected, setShowProjected] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);

  // Get auth token
  useEffect(() => {
    user?.getIdToken().then(setToken).catch(() => setToken(null));
  }, [user]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (compareYear) params.set('compareYear', String(compareYear));
      const res = await fetch(`/api/broker/active-agents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, year, compareYear]);

  useEffect(() => { load(); }, [load]);

  // Merge API months with projection and compare data
  const chartData = data?.months?.map((m: any) => {
    const proj = data.projection?.find((p: any) => p.month === m.month);
    const comp = data.compareMonths?.find((c: any) => c.month === m.month);
    return {
      ...m,
      projected: showProjected ? (proj?.projected ?? null) : null,
      compare: showCompare ? (comp?.totalActive ?? null) : null,
      goal: showGoal ? (m.goal ?? null) : null,
    };
  }) ?? [];

  const kpi = data?.kpi;
  const availableYears: number[] = data?.availableYears ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Agent Count
            </CardTitle>
            <CardDescription>
              Monthly active agents — stacked by activation type — {year}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Year selector */}
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year - 1, year, year + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Compare year */}
            <Select
              value={compareYear ? String(compareYear) : 'none'}
              onValueChange={v => {
                if (v === 'none') { setCompareYear(null); setShowCompare(false); }
                else { setCompareYear(Number(v)); setShowCompare(true); }
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Compare…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Compare</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Toggle buttons */}
            <Button
              variant={showGoal ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowGoal(v => !v)}
            >
              <Target className="h-3.5 w-3.5 mr-1" />
              Goal
            </Button>
            <Button
              variant={showProjected ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowProjected(v => !v)}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Projected
            </Button>
            {showGoalEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGoalEditor(v => !v)}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Edit Goals
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* KPI Cards */}
        {kpi && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard
              title="Active Agents"
              value={kpi.currentActive ?? '—'}
              sub="This month"
              icon={Users}
            />
            <KPICard
              title="YTD New Hires"
              value={kpi.ytdNewHires ?? '—'}
              sub={`${year} activations`}
              icon={UserPlus}
            />
            <KPICard
              title="YTD Departures"
              value={kpi.ytdDepartures ?? '—'}
              sub={`${year} exits`}
              icon={UserMinus}
            />
            <KPICard
              title="Pipeline"
              value={kpi.pipelineCount ?? '—'}
              sub="Candidates tracked"
              icon={TrendingUp}
            />
          </div>
        )}

        {/* Chart */}
        {loading && <Skeleton className="h-[350px] w-full" />}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && (
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />

              {/* Stacked bars */}
              <Bar
                dataKey="activeClosed"
                stackId="agents"
                fill="var(--color-activeClosed)"
                radius={[0, 0, 0, 0]}
                name="Active (Closed Deal)"
              />
              <Bar
                dataKey="activeTenure"
                stackId="agents"
                fill="var(--color-activeTenure)"
                radius={[0, 0, 0, 0]}
                name="Active (No Deals Yet)"
              />
              <Bar
                dataKey="pipeline"
                stackId="agents"
                fill="var(--color-pipeline)"
                radius={[4, 4, 0, 0]}
                opacity={0.6}
                name="Pipeline (Upcoming)"
              />

              {/* Goal bars (ghost) */}
              {showGoal && (
                <Bar
                  dataKey="goal"
                  fill="var(--color-goal)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.25}
                  name="Goal"
                />
              )}

              {/* Compare year bars */}
              {showCompare && compareYear && (
                <Bar
                  dataKey="compare"
                  fill="var(--color-compare)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.4}
                  name={String(compareYear)}
                />
              )}

              {/* Projection line */}
              {showProjected && (
                <Line
                  dataKey="projected"
                  type="monotone"
                  stroke="var(--color-projected)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3 }}
                  name="Projected"
                  connectNulls
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}

        {/* Goal Editor */}
        {showGoalEdit && showGoalEditor && token && data?.months && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Agent Count Goals — {year}
            </h4>
            <GoalEditor
              year={year}
              months={data.months}
              token={token}
              onSaved={() => { setShowGoalEditor(false); load(); }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
