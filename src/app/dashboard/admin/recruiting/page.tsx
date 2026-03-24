'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, TrendingUp, Target, AlertCircle, UserPlus, UserMinus, Phone, Calendar, ChevronDown, ChevronUp, Save, BarChart3 } from 'lucide-react';
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, ComposedChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const fmt = (n: number | null | undefined, compact = false) => {
  if (n == null) return '—';
  if (compact && Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toLocaleString();
};
const fmtPct = (n: number | null | undefined) => n != null ? `${n}%` : '—';

const agentChartConfig: ChartConfig = {
  activeAgents: { label: 'Active Agents', color: 'hsl(var(--chart-1))' },
  activeAgentsGoal: { label: 'Goal', color: 'hsl(var(--chart-3))' },
  compareActiveAgents: { label: 'Comparison Year', color: 'hsl(var(--chart-5))' },
  dealsPerAgent: { label: 'Deals/Agent', color: 'hsl(var(--chart-2))' },
};

const hiringChartConfig: ChartConfig = {
  newHires: { label: 'New Hires', color: 'hsl(142 71% 45%)' },
  departures: { label: 'Departures', color: 'hsl(0 84% 60%)' },
  inTraining: { label: 'In Training', color: 'hsl(var(--chart-4))' },
  committed: { label: 'Committed', color: 'hsl(var(--chart-2))' },
  newHiresGoal: { label: 'Hire Goal', color: 'hsl(var(--chart-3))' },
  compareNewHires: { label: 'Comp Year Hires', color: 'hsl(var(--chart-5))' },
};

const pipelineChartConfig: ChartConfig = {
  prospectCalls: { label: 'Prospect Calls', color: 'hsl(var(--chart-1))' },
  interviewsSet: { label: 'Interviews Set', color: 'hsl(var(--chart-2))' },
  interviewsHeld: { label: 'Interviews Held', color: 'hsl(var(--chart-4))' },
  hotProspects: { label: 'Hot Prospects', color: 'hsl(0 84% 60%)' },
};

function GradeCard({ label, grade, actual, goal, pct }: { label: string; grade: string; actual: number; goal: number; pct: number }) {
  const color = grade === 'A' ? 'text-green-600' : grade === 'B' ? 'text-blue-600' : grade === 'C' ? 'text-yellow-600' : 'text-red-600';
  const bg = grade === 'A' ? 'bg-green-50 border-green-200' : grade === 'B' ? 'bg-blue-50 border-blue-200' : grade === 'C' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
  return (
    <div className={`border rounded-lg p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-2xl font-bold ${color}`}>{grade}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {fmt(actual)} / {fmt(goal)} ({fmtPct(pct)})
      </div>
      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: grade === 'A' ? '#22c55e' : grade === 'B' ? '#3b82f6' : grade === 'C' ? '#eab308' : '#ef4444' }} />
      </div>
    </div>
  );
}

function KPI({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Monthly Tracking Form ───────────────────────────────────────────────────

function TrackingForm({ months, year, onSaved }: { months: any[]; year: number; onSaved: () => void }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Record<number, Record<string, string>>>({});

  useEffect(() => {
    const d: typeof data = {};
    for (const m of months) {
      d[m.month] = {
        activeAgents: String(m.activeAgents || ''),
        newHires: String(m.newHires || ''),
        departures: String(m.departures || ''),
        inTraining: String(m.inTraining || ''),
        committed: String(m.committed || ''),
        interviewsHeld: String(m.interviewsHeld || ''),
        interviewsSet: String(m.interviewsSet || ''),
        prospectCalls: String(m.prospectCalls || ''),
        hotProspects: String(m.hotProspects || ''),
        nurtureProspects: String(m.nurtureProspects || ''),
        watchProspects: String(m.watchProspects || ''),
      };
    }
    setData(d);
  }, [months]);

  const update = (month: number, field: string, val: string) => {
    setData(p => ({ ...p, [month]: { ...p[month], [field]: val } }));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      for (let m = 1; m <= 12; m++) {
        const d = data[m];
        if (!d) continue;
        const numData: Record<string, number> = {};
        for (const [k, v] of Object.entries(d)) {
          numData[k] = parseInt(v, 10) || 0;
        }
        await fetch('/api/broker/recruiting-metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'saveTracking', year, month: m, data: numData }),
        });
      }
      onSaved();
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  };

  const fields = [
    { key: 'activeAgents', label: 'Active Agents' },
    { key: 'newHires', label: 'New Hires' },
    { key: 'departures', label: 'Departures' },
    { key: 'inTraining', label: 'In Training' },
    { key: 'committed', label: 'Committed' },
    { key: 'interviewsHeld', label: 'Interviews Held' },
    { key: 'interviewsSet', label: 'Interviews Set' },
    { key: 'prospectCalls', label: 'Prospect Calls' },
    { key: 'hotProspects', label: 'Hot' },
    { key: 'nurtureProspects', label: 'Nurture' },
    { key: 'watchProspects', label: 'Watch' },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg">Monthly Recruiting Data Entry</CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Enter monthly recruiting activity data for each month.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 font-medium sticky left-0 bg-background">Month</th>
                    {fields.map(f => <th key={f.key} className="text-left py-2 px-1 font-medium whitespace-nowrap">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const d = data[m] || {};
                    return (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-1 pr-2 font-medium sticky left-0 bg-background">{months.find(md => md.month === m)?.label || m}</td>
                        {fields.map(f => (
                          <td key={f.key} className="py-1 px-1">
                            <Input type="number" value={d[f.key] || ''} onChange={e => update(m, f.key, e.target.value)}
                              className="h-7 w-16 text-xs" placeholder="0" />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={save} disabled={saving} size="sm">
                <Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save All Months'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Recruiting Plan/Goals Form ──────────────────────────────────────────────

function PlanForm({ plan, year, onSaved }: { plan: any; year: number; onSaved: () => void }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hiresGoal, setHiresGoal] = useState(String(plan?.yearlyNewHiresGoal || ''));
  const [agentsGoal, setAgentsGoal] = useState(String(plan?.yearlyActiveAgentsGoal || ''));
  const [rates, setRates] = useState({
    callToInterview: String((plan?.conversionRates?.callToInterview ?? 0.20) * 100),
    interviewSetToHeld: String((plan?.conversionRates?.interviewSetToHeld ?? 0.70) * 100),
    interviewToOffer: String((plan?.conversionRates?.interviewToOffer ?? 0.50) * 100),
    offerToCommit: String((plan?.conversionRates?.offerToCommit ?? 0.60) * 100),
    commitToOnboard: String((plan?.conversionRates?.commitToOnboard ?? 0.85) * 100),
    expectedAttritionPct: String((plan?.conversionRates?.expectedAttritionPct ?? 0.15) * 100),
  });

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/broker/recruiting-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'savePlan', year,
          yearlyNewHiresGoal: parseInt(hiresGoal, 10) || null,
          yearlyActiveAgentsGoal: parseInt(agentsGoal, 10) || null,
          conversionRates: {
            callToInterview: (parseFloat(rates.callToInterview) || 20) / 100,
            interviewSetToHeld: (parseFloat(rates.interviewSetToHeld) || 70) / 100,
            interviewToOffer: (parseFloat(rates.interviewToOffer) || 50) / 100,
            offerToCommit: (parseFloat(rates.offerToCommit) || 60) / 100,
            commitToOnboard: (parseFloat(rates.commitToOnboard) || 85) / 100,
            expectedAttritionPct: (parseFloat(rates.expectedAttritionPct) || 15) / 100,
          },
        }),
      });
      onSaved();
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-lg">Recruiting Plan & Assumptions</CardTitle>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Set yearly recruiting goals and conversion rate assumptions — the system will calculate your funnel targets.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Yearly New Hires Goal</Label>
                <Input type="number" value={hiresGoal} onChange={e => setHiresGoal(e.target.value)} placeholder="e.g. 24" />
                <p className="text-xs text-muted-foreground">How many new agents to onboard this year</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Year-End Active Agents Goal</Label>
                <Input type="number" value={agentsGoal} onChange={e => setAgentsGoal(e.target.value)} placeholder="e.g. 50" />
                <p className="text-xs text-muted-foreground">Target active agent count by December</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-3">Conversion Rate Assumptions (%)</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: 'callToInterview', label: 'Call → Interview Set' },
                  { key: 'interviewSetToHeld', label: 'Set → Held' },
                  { key: 'interviewToOffer', label: 'Interview → Offer' },
                  { key: 'offerToCommit', label: 'Offer → Committed' },
                  { key: 'commitToOnboard', label: 'Committed → Onboarded' },
                  { key: 'expectedAttritionPct', label: 'Expected Attrition' },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" value={(rates as any)[key]} onChange={e => setRates(p => ({ ...p, [key]: e.target.value }))}
                        className="h-8" />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Plan'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function RecruitingDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
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
      const res = await fetch(`/api/broker/recruiting-metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [user, year, compareYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (userLoading || loading) {
    return <div className="space-y-8"><Skeleton className="h-12 w-1/2" /><div className="grid grid-cols-4 gap-6">{[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div></div>;
  }
  if (!user) return <Alert><AlertTitle>Sign In Required</AlertTitle></Alert>;
  if (error) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!data) return null;

  const { months, totals, plan, funnelTargets, grades, availableYears } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recruiting & Agent Development</h1>
          <p className="text-muted-foreground">Track recruiting pipeline, agent activity, and development goals.</p>
        </div>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI title="Active Agents" value={fmt(totals.activeAgents)} sub={plan.yearlyActiveAgentsGoal ? `Goal: ${plan.yearlyActiveAgentsGoal}` : 'No goal set'} icon={Users} />
        <KPI title="New Hires YTD" value={fmt(totals.newHires)} sub={`${fmt(totals.departures)} departures · Net: ${fmt(totals.newHires - totals.departures)}`} icon={UserPlus} />
        <KPI title="Avg Deals/Agent" value={String(totals.avgDealsPerAgent)} sub={`${fmt(totals.totalDeals)} total deals`} icon={BarChart3} />
        <KPI title="Interviews YTD" value={fmt(totals.totalInterviews)} sub={`${fmt(totals.totalProspectCalls)} prospect calls`} icon={Phone} />
      </div>

      {/* Grade Cards */}
      {grades && Object.keys(grades).length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3">Recruiting Lead Indicator Grades</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {grades.prospectCalls && <GradeCard label="Prospect Calls" {...grades.prospectCalls} />}
            {grades.interviewsHeld && <GradeCard label="Interviews Held" {...grades.interviewsHeld} />}
            {grades.newHires && <GradeCard label="New Hires" {...grades.newHires} />}
            {grades.activeAgents && <GradeCard label="Active Agents" {...grades.activeAgents} />}
          </div>
        </div>
      )}

      {/* Funnel Targets */}
      {funnelTargets && (
        <Card>
          <CardHeader>
            <CardTitle>Recruiting Funnel — What It Takes</CardTitle>
            <CardDescription>Reverse-calculated from your goal of {plan.yearlyNewHiresGoal} new hires/year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
              {[
                { label: 'Prospect Calls', yearly: funnelTargets.yearly.calls, monthly: funnelTargets.monthly.calls, weekly: funnelTargets.weekly.calls },
                { label: 'Interviews Set', yearly: funnelTargets.yearly.interviewsSet, monthly: funnelTargets.monthly.interviewsSet, weekly: funnelTargets.weekly.interviewsSet },
                { label: 'Interviews Held', yearly: funnelTargets.yearly.interviewsHeld, monthly: funnelTargets.monthly.interviewsHeld, weekly: funnelTargets.weekly.interviewsHeld },
                { label: 'Offers Made', yearly: funnelTargets.yearly.offers, monthly: funnelTargets.monthly.offers },
                { label: 'Committed', yearly: funnelTargets.yearly.committed, monthly: funnelTargets.monthly.committed },
                { label: 'Onboarded', yearly: funnelTargets.yearly.onboarded, monthly: funnelTargets.monthly.onboarded },
              ].map((item, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-xl font-bold">{item.yearly}</p>
                  <p className="text-xs text-muted-foreground">{item.monthly}/mo{item.weekly ? ` · ${item.weekly}/wk` : ''}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CHART 1: Active Agents + Deals Per Agent ─────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Active Agents & Deals Per Agent</CardTitle>
              <CardDescription>Monthly agent count vs goal, with deals per agent overlay — {year}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Compare to:</span>
              <Select value={compareYear ? String(compareYear) : 'none'} onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(availableYears ?? []).map((y: number) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={agentChartConfig} className="h-[350px] w-full">
            <ComposedChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => v.toFixed(1)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar yAxisId="left" dataKey="activeAgents" fill="var(--color-activeAgents)" radius={[4, 4, 0, 0]} name={`${year} Active`} />
              {compareYear && <Bar yAxisId="left" dataKey="compareActiveAgents" fill="var(--color-compareActiveAgents)" radius={[4, 4, 0, 0]} opacity={0.5} name={`${compareYear}`} />}
              <Bar yAxisId="left" dataKey="activeAgentsGoal" fill="var(--color-activeAgentsGoal)" radius={[4, 4, 0, 0]} opacity={0.3} name="Goal" />
              <Line yAxisId="right" dataKey="dealsPerAgent" type="monotone" stroke="var(--color-dealsPerAgent)" strokeWidth={2} dot={{ r: 3 }} name="Deals/Agent" />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── CHART 2: Hiring & Departures ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Hiring & Pipeline</CardTitle>
          <CardDescription>New hires, departures, agents in training, and committed — {year}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={hiringChartConfig} className="h-[300px] w-full">
            <BarChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="newHires" fill="var(--color-newHires)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="departures" fill="var(--color-departures)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inTraining" fill="var(--color-inTraining)" radius={[4, 4, 0, 0]} opacity={0.7} />
              <Bar dataKey="committed" fill="var(--color-committed)" radius={[4, 4, 0, 0]} opacity={0.7} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── CHART 3: Pipeline Activity ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Recruiting Activity</CardTitle>
          <CardDescription>Prospect calls, interviews set, interviews held, hot prospects — {year}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={pipelineChartConfig} className="h-[300px] w-full">
            <BarChart data={months} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="prospectCalls" fill="var(--color-prospectCalls)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="interviewsSet" fill="var(--color-interviewsSet)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="interviewsHeld" fill="var(--color-interviewsHeld)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="hotProspects" fill="var(--color-hotProspects)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Prospect Categories */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Hot Prospects', value: months.reduce((s: number, m: any) => Math.max(s, m.hotProspects || 0), 0), color: 'text-red-600' },
          { label: 'Nurture', value: months.reduce((s: number, m: any) => Math.max(s, m.nurtureProspects || 0), 0), color: 'text-yellow-600' },
          { label: 'Watch', value: months.reduce((s: number, m: any) => Math.max(s, m.watchProspects || 0), 0), color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">Latest month count</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Plan & Tracking Forms ────────────────────────────────────────── */}
      <PlanForm plan={plan} year={year} onSaved={fetchData} />
      <TrackingForm months={months} year={year} onSaved={fetchData} />
    </div>
  );
}
