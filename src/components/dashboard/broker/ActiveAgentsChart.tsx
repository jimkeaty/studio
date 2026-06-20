'use client';
// ActiveAgentsChart — 12-month stacked bar chart of active agent counts
// Features:
//   - Team filter (All / CGL / SGL / Charles Ditch Team)
//   - Deals-per-agent KPI card and monthly tooltip
//   - No Deals Yet KPI card
//   - Grace Period graduation projection block (next 3 months)
//   - Year comparison, goal line, projected line
import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users, TrendingUp, UserPlus, UserMinus, Save, Target,
  BarChart2, AlertTriangle, GraduationCap,
} from 'lucide-react';
import { useUser } from '@/firebase';

// ── Chart config ─────────────────────────────────────────────────────────────
const chartConfig: ChartConfig = {
  totalActive:  { label: 'Active Agents', color: 'hsl(var(--chart-1))' },
  pipeline:     { label: 'Pipeline (Upcoming)', color: 'hsl(var(--chart-4))' },
  goal:         { label: 'Goal', color: 'hsl(var(--chart-3))' },
  projected:    { label: 'Projected', color: 'hsl(38 92% 50%)' },
  compare:      { label: 'Prior Year', color: 'hsl(var(--chart-5))' },
};

const TEAM_GROUP_OPTIONS = [
  { value: 'all', label: 'All Teams' },
  { value: 'cgl', label: 'CGL' },
  { value: 'sgl', label: 'SGL' },
  { value: 'charles_ditch_team', label: 'Charles Ditch Team' },
  { value: 'independent', label: 'Independent' },
  { value: 'referral_group', label: 'Referral Group' },
];

// ── KPI Card ─────────────────────────────────────────────────────────────────


// ── Goal Editor ───────────────────────────────────────────────────────────────
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
    months.forEach(m => { if (m.goal != null) map[m.month] = String(m.goal); });
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
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
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

// ── Grace Period Projection Block ─────────────────────────────────────────────
function GraceProjectionBlock({ graceProjection }: { graceProjection: any[] }) {
  if (!graceProjection || graceProjection.length === 0) return null;
  const hasGraduating = graceProjection.some((g: any) => g.graduatingCount > 0);
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
        <GraduationCap className="h-4 w-4" />
        Grace Period Graduation Forecast — Next 3 Months
      </div>
      {!hasGraduating && (
        <p className="text-xs text-blue-600">No agents are scheduled to complete their grace period in the next 3 months.</p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {graceProjection.map((g: any) => (
          <div key={g.ym} className="rounded-md border border-blue-200 bg-white p-3 text-center">
            <div className="text-xs text-muted-foreground font-medium">{g.label}</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">
              {g.graduatingCount > 0 ? `+${g.graduatingCount}` : '0'}
            </div>
            <div className="text-[10px] text-muted-foreground">graduating from grace</div>
            <div className="mt-1 pt-1 border-t border-blue-100">
              <span className="text-xs font-semibold">{g.projectedTotal}</span>
              <span className="text-[10px] text-muted-foreground ml-1">projected total</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-blue-600">
        "Graduating" agents have completed their 90-day grace period and will move from grace to established active status.
        Projected total includes current actives + pipeline candidates expected to join by that month.
      </p>
    </div>
  );
}

// ── Delta label renderer (goal vs actual) ────────────────────────────────────
function DeltaLabel(props: any) {
  const { x, y, width, value } = props;
  if (value == null) return null;
  const color = value > 0 ? '#16a34a' : value < 0 ? '#dc2626' : '#64748b';
  const label = value > 0 ? `+${value}` : String(value);
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill={color}
    >
      {label}
    </text>
  );
}

// ── Year-over-year delta label renderer (current year vs compare year) ────────
// Rendered on top of the compare year bar, showing how many more/fewer agents
// the current year has vs the compare year in the same month.
function YoYDeltaLabel(props: any) {
  const { x, y, width, value } = props;
  if (value == null) return null;
  // Offset upward so it sits above the taller of the two bars
  const color = value > 0 ? '#2563eb' : value < 0 ? '#dc2626' : '#64748b';
  const label = value > 0 ? `+${value}` : String(value);
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontSize={10}
      fontWeight={700}
      fill={color}
    >
      {label}
    </text>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface ActiveAgentsChartProps {
  showGoalEdit?: boolean;
  initialYear?: number;
}

export function ActiveAgentsChart({ showGoalEdit = false, initialYear }: ActiveAgentsChartProps) {
  const { user } = useUser();
  const [year, setYear] = useState(initialYear ?? new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [teamGroup, setTeamGroup] = useState<string>('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Toggles
  const [showGoal, setShowGoal] = useState(true);
  const [showProjected, setShowProjected] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const [showDealsPerAgent, setShowDealsPerAgent] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);

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
      if (teamGroup && teamGroup !== 'all') params.set('teamGroup', teamGroup);
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
  }, [token, year, compareYear, teamGroup]);

  useEffect(() => { load(); }, [load]);

  const chartData = data?.months?.map((m: any) => {
    const proj = data.projection?.find((p: any) => p.month === m.month);
    const comp = data.compareMonths?.find((c: any) => c.month === m.month);
    const goalVal = m.goal ?? null;
    const delta = (goalVal != null && m.totalActive != null) ? m.totalActive - goalVal : null;
    // Year-over-year delta: current year agents minus compare year agents for same month
    const compTotal = (comp && !comp.isFuture) ? (comp.totalActive ?? null) : null;
    const yoyDelta = (showCompare && m.totalActive != null && compTotal != null)
      ? m.totalActive - compTotal
      : null;
    return {
      ...m,
      projected: showProjected ? (proj?.projected ?? null) : null,
      compare: showCompare ? compTotal : null,
      goal: showGoal ? goalVal : null,
      dealsPerAgent: showDealsPerAgent ? (m.dealsPerAgent ?? null) : null,
      delta,
      yoyDelta,
    };
  }) ?? [];

  const kpi = data?.kpi;
  const availableYears: number[] = data?.availableYears ?? [];
  const graceProjection: any[] = data?.graceProjection ?? [];
  const selectedTeamLabel = TEAM_GROUP_OPTIONS.find(t => t.value === teamGroup)?.label ?? 'All Teams';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Agent Count
              {teamGroup !== 'all' && (
                <span className="text-sm font-normal text-muted-foreground ml-1">— {selectedTeamLabel}</span>
              )}
            </CardTitle>
            <CardDescription>
              Monthly active agent count — {year}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Team filter */}
            <Select value={teamGroup} onValueChange={setTeamGroup}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_GROUP_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Year selector — always anchored to current calendar year so
                 navigating to a past year doesn't hide the current year */}
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const currentCalYear = new Date().getFullYear();
                  // Show current year + 4 years back (e.g. 2026, 2025, 2024, 2023, 2022)
                  const opts = Array.from({ length: 5 }, (_, i) => currentCalYear - i);
                  // Also include the selected year if it falls outside this range
                  if (!opts.includes(year)) opts.push(year);
                  return opts.sort((a, b) => b - a).map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ));
                })()}
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
            <Button variant={showGoal ? 'default' : 'outline'} size="sm" onClick={() => setShowGoal(v => !v)}>
              <Target className="h-3.5 w-3.5 mr-1" />
              Goal
            </Button>
            <Button variant={showProjected ? 'default' : 'outline'} size="sm" onClick={() => setShowProjected(v => !v)}>
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Projected
            </Button>
            <Button variant={showDealsPerAgent ? 'default' : 'outline'} size="sm" onClick={() => setShowDealsPerAgent(v => !v)}>
              <BarChart2 className="h-3.5 w-3.5 mr-1" />
              Deals/Agent
            </Button>
            {showGoalEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowGoalEditor(v => !v)}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Edit Goals
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Chart */}
        {loading && <Skeleton className="h-[350px] w-full" />}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && (
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ComposedChart data={chartData} margin={{ top: 24, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              {/* Y-axis starts at 50 so month-to-month changes are visually meaningful */}
              <YAxis yAxisId="left" allowDecimals={false} domain={[50, 'auto']} />
              {showDealsPerAgent && (
                <YAxis yAxisId="right" orientation="right" allowDecimals tickFormatter={v => v.toFixed(1)} />
              )}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      if (name === 'dealsPerAgent') return [`${Number(value).toFixed(2)} deals/agent`, 'Deals per Agent'];
                      return [value, name];
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />

              {/* Single combined active bar — breakdown (No Deals Yet, Past Grace) shown in KPI blocks above */}
              <Bar yAxisId="left" dataKey="totalActive" fill="var(--color-totalActive)" radius={[4, 4, 0, 0]} name="Active Agents">
                {/* Delta label: green if above goal, red if below, grey if on target */}
                {showGoal && (
                  <LabelList dataKey="delta" content={<DeltaLabel />} />
                )}
              </Bar>
              <Bar yAxisId="left" dataKey="pipeline" fill="var(--color-pipeline)" radius={[4, 4, 0, 0]} opacity={0.6} name="Pipeline (Upcoming)" />

              {/* Goal bars */}
              {showGoal && (
                <Bar yAxisId="left" dataKey="goal" fill="var(--color-goal)" radius={[4, 4, 0, 0]} opacity={0.25} name="Goal" />
              )}

              {/* Compare year bars — with YoY delta annotation on top */}
              {showCompare && compareYear && (
                <Bar yAxisId="left" dataKey="compare" fill="var(--color-compare)" radius={[4, 4, 0, 0]} opacity={0.4} name={String(compareYear)}>
                  <LabelList dataKey="yoyDelta" content={<YoYDeltaLabel />} />
                </Bar>
              )}

              {/* Projection line */}
              {showProjected && (
                <Line yAxisId="left" dataKey="projected" type="monotone" stroke="var(--color-projected)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="Projected" connectNulls />
              )}

              {/* Deals per agent line */}
              {showDealsPerAgent && (
                <Line yAxisId="right" dataKey="dealsPerAgent" type="monotone" stroke="hsl(262 80% 50%)" strokeWidth={2} dot={{ r: 3 }} name="Deals/Agent" connectNulls />
              )}
            </ComposedChart>
          </ChartContainer>
        )}

        {/* YTD Summary Banner — shown when compare year is selected */}
        {!loading && !error && showCompare && compareYear && kpi && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-semibold text-blue-800 mb-2">
              Year-over-Year Summary — As of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">{year} Active Agents</div>
                <div className="text-2xl font-bold text-blue-700">{kpi.currentActive ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">{compareYear} Active Agents</div>
                <div className="text-2xl font-bold text-slate-600">{kpi.compareYtdAgents ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Difference</div>
                <div className={`text-2xl font-bold ${
                  kpi.compareYtdAgents != null && kpi.currentActive != null
                    ? (kpi.currentActive - kpi.compareYtdAgents) > 0 ? 'text-green-600' : (kpi.currentActive - kpi.compareYtdAgents) < 0 ? 'text-red-600' : 'text-slate-500'
                    : 'text-slate-500'
                }`}>
                  {kpi.compareYtdAgents != null && kpi.currentActive != null
                    ? ((kpi.currentActive - kpi.compareYtdAgents) > 0 ? '+' : '') + (kpi.currentActive - kpi.compareYtdAgents)
                    : '—'}
                </div>
              </div>
            </div>
            {kpi.compareAvgMonthlyDealsPerAgent != null && (
              <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">{year} Avg Deals/Agent/Mo</div>
                  <div className="text-lg font-bold text-blue-700">{kpi.avgMonthlyDealsPerAgent?.toFixed(2) ?? '—'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">{compareYear} Avg Deals/Agent/Mo</div>
                  <div className="text-lg font-bold text-slate-600">{kpi.compareAvgMonthlyDealsPerAgent.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Difference</div>
                  <div className={`text-lg font-bold ${
                    (() => {
                      const diff = (kpi.avgMonthlyDealsPerAgent ?? 0) - kpi.compareAvgMonthlyDealsPerAgent;
                      return diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-500';
                    })()
                  }`}>
                    {(() => {
                      const diff = Math.round(((kpi.avgMonthlyDealsPerAgent ?? 0) - kpi.compareAvgMonthlyDealsPerAgent) * 100) / 100;
                      return (diff > 0 ? '+' : '') + diff.toFixed(2);
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grace Period Graduation Projection */}
        {!loading && !error && (
          <GraceProjectionBlock graceProjection={graceProjection} />
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
