'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, TrendingUp, Target, AlertCircle, UserPlus, UserMinus, Phone, Calendar, ChevronDown, ChevronUp, Save, BarChart3, ArrowUpDown, Eye, ArrowUp, ArrowDown, Clock, ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';

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

// ── Grade Badge ─────────────────────────────────────────────────────────────

function GradeBadge({ grade, size = 'sm' }: { grade: string; size?: 'sm' | 'lg' }) {
  const colors: Record<string, string> = {
    A: 'bg-green-100 text-green-800 border-green-300',
    B: 'bg-blue-100 text-blue-800 border-blue-300',
    C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    D: 'bg-orange-100 text-orange-800 border-orange-300',
    F: 'bg-red-100 text-red-800 border-red-300',
  };
  const cls = colors[grade] || 'bg-gray-100 text-gray-800 border-gray-300';
  return (
    <span className={`inline-flex items-center justify-center font-bold border rounded ${cls} ${size === 'lg' ? 'text-lg px-2.5 py-1' : 'text-xs px-1.5 py-0.5'}`}>
      {grade}
    </span>
  );
}

// ── Delta Display ───────────────────────────────────────────────────────────

function Delta({ value, isCurrency = false }: { value: number; isCurrency?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = value > 0;
  const display = isCurrency
    ? `${positive ? '+' : ''}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${positive ? '+' : ''}${value.toLocaleString()}`;
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${positive ? 'text-green-600' : 'text-red-600'}`}>
      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {display}
    </span>
  );
}

// ── Grace Status Badge ──────────────────────────────────────────────────────

function GraceStatusBadge({ status, daysRemaining, month, hasFirstDeal }: {
  status: string; daysRemaining: number | null; month: number | null; hasFirstDeal: boolean;
}) {
  if (status === 'established') return null;

  const configs: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    grace_on_track: { label: 'On Track', className: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle2 },
    in_grace: { label: 'In Grace', className: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock },
    grace_at_risk: { label: 'At Risk', className: 'bg-red-100 text-red-800 border-red-300', icon: ShieldAlert },
    grace_passed: { label: 'Past Grace', className: 'bg-gray-100 text-gray-600 border-gray-300', icon: ShieldCheck },
  };

  const cfg = configs[status] || configs.in_grace;
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.className}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
      {month !== null && daysRemaining !== null && daysRemaining > 0 && (
        <span className="text-[10px] text-muted-foreground">Month {month}/3 · {daysRemaining}d left</span>
      )}
      {status !== 'grace_passed' && status !== 'established' && (
        <span className={`text-[10px] font-medium ${hasFirstDeal ? 'text-green-600' : 'text-red-600'}`}>
          {hasFirstDeal ? '✓ Has deal' : '✗ No deal yet'}
        </span>
      )}
    </div>
  );
}

// ── Agent Performance Roster ────────────────────────────────────────────────

type SortField = 'name' | 'engGrade' | 'apptGrade' | 'incomeGrade' | 'pipelineGrade' | 'incomeActual' | 'engActual' | 'apptActual' | 'graceStatus';
type SortDir = 'asc' | 'desc';

const GRADE_ORDER: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function AgentPerformanceRoster({ year }: { year: number }) {
  const { user } = useUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('incomeGrade');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterGrace, setFilterGrace] = useState<string>('all');
  const [view, setView] = useState<'table' | 'cards'>('table');

  const fetchRoster = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ year: String(year) });
      const res = await fetch(`/api/broker/agent-roster-metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [user, year]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  if (loading) return <Card><CardContent className="p-8"><Skeleton className="h-64 w-full" /></CardContent></Card>;
  if (error) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!data?.agents?.length) return <Card><CardContent className="p-8 text-center text-muted-foreground">No active agents found for {year}.</CardContent></Card>;

  const { agents, summary } = data;

  // Get unique teams
  const teams = [...new Set(agents.map((a: any) => a.teamName).filter(Boolean))].sort() as string[];

  // Filter
  let filtered = [...agents];
  if (filterGrade !== 'all') {
    filtered = filtered.filter((a: any) => a.incomeGrade === filterGrade);
  }
  if (filterTeam !== 'all') {
    filtered = filtered.filter((a: any) => a.teamName === filterTeam);
  }
  if (filterGrace !== 'all') {
    if (filterGrace === 'in_grace') {
      filtered = filtered.filter((a: any) => a.isGracePeriod);
    } else if (filterGrace === 'established') {
      filtered = filtered.filter((a: any) => !a.isGracePeriod);
    } else if (filterGrace === 'at_risk') {
      filtered = filtered.filter((a: any) => a.graceStatus === 'grace_at_risk');
    } else if (filterGrace === 'no_deal') {
      filtered = filtered.filter((a: any) => a.isGracePeriod && !a.hasFirstDeal);
    }
  }

  // Sort
  filtered.sort((a: any, b: any) => {
    let cmp = 0;
    switch (sortField) {
      case 'name': cmp = a.displayName.localeCompare(b.displayName); break;
      case 'engGrade': cmp = (GRADE_ORDER[a.engagementsGrade] ?? 0) - (GRADE_ORDER[b.engagementsGrade] ?? 0); break;
      case 'apptGrade': cmp = (GRADE_ORDER[a.appointmentsGrade] ?? 0) - (GRADE_ORDER[b.appointmentsGrade] ?? 0); break;
      case 'incomeGrade': cmp = (GRADE_ORDER[a.incomeGrade] ?? 0) - (GRADE_ORDER[b.incomeGrade] ?? 0); break;
      case 'pipelineGrade': cmp = (GRADE_ORDER[a.incomePipelineGrade] ?? 0) - (GRADE_ORDER[b.incomePipelineGrade] ?? 0); break;
      case 'incomeActual': cmp = a.incomeActual - b.incomeActual; break;
      case 'engActual': cmp = a.engagementsActual - b.engagementsActual; break;
      case 'apptActual': cmp = a.appointmentsHeldActual - b.appointmentsHeldActual; break;
      case 'graceStatus': {
        const graceOrder: Record<string, number> = { grace_at_risk: 0, in_grace: 1, grace_on_track: 2, grace_passed: 3, established: 4 };
        cmp = (graceOrder[a.graceStatus] ?? 5) - (graceOrder[b.graceStatus] ?? 5);
        break;
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const fmtCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;

  // Separate grace period agents for the tracker
  const graceAgents = agents.filter((a: any) => a.isGracePeriod || a.graceStatus === 'grace_passed');

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Agents</p>
            <p className="text-2xl font-bold">{summary.totalAgents}</p>
            <p className="text-[10px] text-muted-foreground">{summary.established} established · {summary.totalInGrace} new</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-green-200 bg-green-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">On Track (A/B)</p>
            <p className="text-2xl font-bold text-green-700">{summary.onTrack}</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-red-200 bg-red-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Struggling (D/F)</p>
            <p className="text-2xl font-bold text-red-700">{summary.struggling}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Avg Engagement %</p>
            <p className="text-2xl font-bold">{summary.avgEngagementPerf}%</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Avg Income %</p>
            <p className="text-2xl font-bold">{summary.avgIncomePerf}%</p>
          </CardContent>
        </Card>
      </div>

      {/* ── New Agent Grace Period Tracker ──────────────────────────────── */}
      {summary.totalInGrace > 0 && (
        <Card className="border-2 border-amber-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg">New Agent 90-Day Tracker</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                  {summary.totalInGrace} agent{summary.totalInGrace !== 1 ? 's' : ''} in grace period
                </Badge>
              </div>
            </div>
            <CardDescription>
              Standard: at least 1 deal under contract or closed by month 3. Agents are tracked from their start date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Grace period summary mini-cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="border rounded-lg p-3 text-center bg-green-50/50 border-green-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">On Track</span>
                </div>
                <p className="text-2xl font-bold text-green-700">{summary.graceOnTrack}</p>
                <p className="text-[10px] text-muted-foreground">Have a deal</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-amber-50/50 border-amber-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-700">No Deal Yet</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">{summary.graceNoDeal}</p>
                <p className="text-[10px] text-muted-foreground">Month 1-2, still time</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-red-50/50 border-red-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">At Risk</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{summary.graceAtRisk}</p>
                <p className="text-[10px] text-muted-foreground">Month 3, no deal</p>
              </div>
            </div>

            {/* Grace period agent list */}
            <div className="space-y-2">
              {graceAgents
                .sort((a: any, b: any) => {
                  // At risk first, then no deal, then on track, then passed
                  const order: Record<string, number> = { grace_at_risk: 0, in_grace: 1, grace_on_track: 2, grace_passed: 3 };
                  return (order[a.graceStatus] ?? 4) - (order[b.graceStatus] ?? 4);
                })
                .map((a: any) => {
                  const progressPct = a.gracePeriodDaysElapsed != null ? Math.min(100, (a.gracePeriodDaysElapsed / 90) * 100) : 0;
                  const barColor = a.graceStatus === 'grace_on_track' ? 'bg-green-500'
                    : a.graceStatus === 'grace_at_risk' ? 'bg-red-500'
                    : a.graceStatus === 'grace_passed' ? 'bg-gray-400'
                    : 'bg-amber-500';
                  const rowBg = a.graceStatus === 'grace_at_risk' ? 'bg-red-50/50 border-red-200'
                    : a.graceStatus === 'grace_on_track' ? 'bg-green-50/30 border-green-200'
                    : a.graceStatus === 'grace_passed' ? 'bg-gray-50/50 border-gray-200'
                    : 'bg-amber-50/30 border-amber-200';

                  return (
                    <div key={a.agentId} className={`flex items-center gap-4 border rounded-lg p-3 ${rowBg}`}>
                      {/* Name & Team */}
                      <div className="min-w-[140px]">
                        <p className="text-sm font-medium">{a.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">{a.teamName || 'Independent'}</p>
                      </div>

                      {/* Grace Status Badge */}
                      <div className="min-w-[100px]">
                        <GraceStatusBadge status={a.graceStatus} daysRemaining={a.gracePeriodDaysRemaining} month={a.gracePeriodMonth} hasFirstDeal={a.hasFirstDeal} />
                      </div>

                      {/* Progress Bar */}
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Day {a.gracePeriodDaysElapsed ?? '?'} / 90</span>
                          {a.startDate && <span>Started {a.startDate}</span>}
                        </div>
                        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden relative">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${progressPct}%` }} />
                          {/* Month markers */}
                          <div className="absolute top-0 left-[33.3%] w-px h-full bg-gray-400/50" />
                          <div className="absolute top-0 left-[66.6%] w-px h-full bg-gray-400/50" />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                          <span>M1</span><span>M2</span><span>M3</span>
                        </div>
                      </div>

                      {/* Deals */}
                      <div className="text-center min-w-[60px]">
                        <p className="text-xs text-muted-foreground">Deals</p>
                        <p className="text-sm font-bold">
                          {a.closedDeals + a.pendingDeals > 0 ? (
                            <span className="text-green-600">{a.closedDeals}c / {a.pendingDeals}p</span>
                          ) : (
                            <span className="text-red-600">0</span>
                          )}
                        </p>
                      </div>

                      {/* Engagements */}
                      <div className="text-center min-w-[50px]">
                        <p className="text-xs text-muted-foreground">Eng.</p>
                        <p className="text-sm font-medium">{a.engagementsActual}</p>
                      </div>

                      {/* View button */}
                      <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" />View</Button>
                      </Link>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grade Distribution Bar */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground font-medium">Grade Distribution:</span>
        {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
          <button key={g} onClick={() => setFilterGrade(filterGrade === g ? 'all' : g)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${filterGrade === g ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:bg-muted'}`}>
            <GradeBadge grade={g} />
            <span className="text-xs font-medium">{summary.gradeDistribution[g] || 0}</span>
          </button>
        ))}
        {filterGrade !== 'all' && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterGrade('all')}>Clear</Button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {teams.length > 1 && (
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterGrace} onValueChange={setFilterGrace}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="in_grace">🕐 In Grace Period</SelectItem>
            <SelectItem value="at_risk">🔴 Grace At Risk</SelectItem>
            <SelectItem value="no_deal">⚠️ Grace — No Deal</SelectItem>
            <SelectItem value="established">✅ Established</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setView('table')}>Table</Button>
          <Button variant={view === 'cards' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setView('cards')}>Cards</Button>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} agent{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 bg-muted/50 z-10 cursor-pointer" onClick={() => toggleSort('name')}>
                      <div className="flex items-center gap-1">Agent <SortIcon field="name" /></div>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('graceStatus')}>
                      <div className="flex items-center justify-center gap-1">Status <SortIcon field="graceStatus" /></div>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('engGrade')}>
                      <div className="flex items-center justify-center gap-1">Engagements <SortIcon field="engGrade" /></div>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('apptGrade')}>
                      <div className="flex items-center justify-center gap-1">Appts Held <SortIcon field="apptGrade" /></div>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('incomeGrade')}>
                      <div className="flex items-center justify-center gap-1">Income <SortIcon field="incomeGrade" /></div>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('pipelineGrade')}>
                      <div className="flex items-center justify-center gap-1">w/ Pipeline <SortIcon field="pipelineGrade" /></div>
                    </TableHead>
                    <TableHead className="text-center">Deals</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a: any) => (
                    <TableRow key={a.agentId} className={a.isGracePeriod ? 'bg-amber-50/50' : ''}>
                      {/* Agent Name */}
                      <TableCell className="sticky left-0 bg-background z-10 font-medium">
                        <div>
                          <span className="text-sm">{a.displayName}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {a.teamName && <span className="text-[10px] text-muted-foreground">{a.teamName}</span>}
                            {a.teamRole === 'leader' && <Badge variant="outline" className="text-[9px] h-4 px-1">Leader</Badge>}
                          </div>
                        </div>
                      </TableCell>

                      {/* Grace / Status */}
                      <TableCell className="text-center">
                        {a.graceStatus === 'established' ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Established</Badge>
                        ) : (
                          <GraceStatusBadge status={a.graceStatus} daysRemaining={a.gracePeriodDaysRemaining} month={a.gracePeriodMonth} hasFirstDeal={a.hasFirstDeal} />
                        )}
                      </TableCell>

                      {/* Engagements */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <GradeBadge grade={a.engagementsGrade} />
                          <span className="text-xs">{a.engagementsActual} / {a.engagementsGoal}</span>
                          <Delta value={a.engagementsDelta} />
                        </div>
                      </TableCell>

                      {/* Appointments Held */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <GradeBadge grade={a.appointmentsGrade} />
                          <span className="text-xs">{a.appointmentsHeldActual} / {a.appointmentsHeldGoal}</span>
                          <Delta value={a.appointmentsDelta} />
                        </div>
                      </TableCell>

                      {/* Income (closed only) */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <GradeBadge grade={a.incomeGrade} />
                          <span className="text-xs">{fmtCurrency(a.incomeActual)} / {fmtCurrency(a.incomeGoal)}</span>
                          <Delta value={a.incomeDelta} isCurrency />
                        </div>
                      </TableCell>

                      {/* Income with pipeline */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <GradeBadge grade={a.incomePipelineGrade} />
                          <span className="text-xs">{fmtCurrency(a.incomePipelineActual)}</span>
                          <span className="text-[10px] text-muted-foreground">{a.incomePipelinePerf}%</span>
                        </div>
                      </TableCell>

                      {/* Deals */}
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">{a.closedDeals}</span>
                        {a.pendingDeals > 0 && <span className="text-xs text-muted-foreground ml-1">(+{a.pendingDeals}p)</span>}
                      </TableCell>

                      {/* Volume */}
                      <TableCell className="text-right">
                        <span className="text-sm">{fmtCurrency(a.closedVolume)}</span>
                        {a.pendingVolume > 0 && <p className="text-[10px] text-muted-foreground">+{fmtCurrency(a.pendingVolume)} pending</p>}
                      </TableCell>

                      {/* View */}
                      <TableCell>
                        <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="h-3.5 w-3.5" /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards View */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a: any) => (
            <Card key={a.agentId} className={`overflow-hidden ${a.isGracePeriod ? 'border-amber-300' : (a.incomeGrade === 'F' || a.incomeGrade === 'D') ? 'border-red-300' : (a.incomeGrade === 'A') ? 'border-green-300' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{a.displayName}</CardTitle>
                    <CardDescription className="text-xs">
                      {a.teamName || 'Independent'}
                      {a.teamRole === 'leader' && ' · Team Leader'}
                    </CardDescription>
                  </div>
                  <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" />View</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Grace Status Bar (only for non-established) */}
                {a.graceStatus !== 'established' && (
                  <div className={`rounded-lg p-2.5 border ${a.graceStatus === 'grace_at_risk' ? 'bg-red-50 border-red-200' : a.graceStatus === 'grace_on_track' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <GraceStatusBadge status={a.graceStatus} daysRemaining={a.gracePeriodDaysRemaining} month={a.gracePeriodMonth} hasFirstDeal={a.hasFirstDeal} />
                      {a.gracePeriodDaysElapsed != null && (
                        <span className="text-[10px] text-muted-foreground">Day {a.gracePeriodDaysElapsed}/90</span>
                      )}
                    </div>
                    {a.isGracePeriod && a.gracePeriodDaysElapsed != null && (
                      <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                        <div className={`h-full rounded-full ${a.graceStatus === 'grace_on_track' ? 'bg-green-500' : a.graceStatus === 'grace_at_risk' ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.min(100, (a.gracePeriodDaysElapsed / 90) * 100)}%` }} />
                        <div className="absolute top-0 left-[33.3%] w-px h-full bg-gray-400/50" />
                        <div className="absolute top-0 left-[66.6%] w-px h-full bg-gray-400/50" />
                      </div>
                    )}
                  </div>
                )}

                {/* Grades Row */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Engagements</p>
                    <GradeBadge grade={a.engagementsGrade} size="lg" />
                    <p className="text-[10px] mt-0.5">{a.engagementsActual}/{a.engagementsGoal}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Appts</p>
                    <GradeBadge grade={a.appointmentsGrade} size="lg" />
                    <p className="text-[10px] mt-0.5">{a.appointmentsHeldActual}/{a.appointmentsHeldGoal}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">Income</p>
                    <GradeBadge grade={a.incomeGrade} size="lg" />
                    <p className="text-[10px] mt-0.5">{fmtCurrency(a.incomeActual)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">w/ Pipeline</p>
                    <GradeBadge grade={a.incomePipelineGrade} size="lg" />
                    <p className="text-[10px] mt-0.5">{fmtCurrency(a.incomePipelineActual)}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs">
                  <div>
                    <span className="text-muted-foreground">Deals</span>
                    <p className="font-medium">{a.closedDeals} closed{a.pendingDeals > 0 ? ` · ${a.pendingDeals}p` : ''}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Volume</span>
                    <p className="font-medium">{fmtCurrency(a.closedVolume)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Goal</span>
                    <p className="font-medium">{a.annualIncomeGoal > 0 ? fmtCurrency(a.annualIncomeGoal) : 'Not set'}</p>
                  </div>
                </div>

                {/* Income Delta */}
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <span className="text-muted-foreground">Income vs Goal</span>
                  <Delta value={a.incomeDelta} isCurrency />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
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

      <Tabs defaultValue="roster" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="roster">Agent Performance Roster</TabsTrigger>
          <TabsTrigger value="recruiting">Recruiting Pipeline</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Agent Performance Roster ─────────────────────────────── */}
        <TabsContent value="roster" className="space-y-6 mt-6">
          <AgentPerformanceRoster year={year} />
        </TabsContent>

        {/* ── TAB 2: Recruiting Pipeline (existing content) ───────────────── */}
        <TabsContent value="recruiting" className="space-y-8 mt-6">

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

        </TabsContent>
      </Tabs>
    </div>
  );
}
