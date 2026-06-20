'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, TrendingUp, Target, AlertCircle, UserPlus, UserMinus, Phone, Calendar, ChevronDown, ChevronUp, Save, BarChart3, ArrowUpDown, Eye, ArrowUp, ArrowDown, Clock, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Flame, Send, Trash2, Activity, Info } from 'lucide-react';
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, ComposedChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/firebase';
import { ActiveAgentsChart } from '@/components/dashboard/broker/ActiveAgentsChart';
import { RecruitingPipelinePanel } from '@/components/dashboard/broker/RecruitingPipelinePanel';
import { RecruiterReportCard } from '@/components/dashboard/broker/RecruiterReportCard';
import { RecruiterTodoBoard } from '@/components/dashboard/broker/RecruiterTodoBoard';
import { OneOnOneScheduler } from '@/components/dashboard/broker/OneOnOneScheduler';
import { BrokerKPIReportCard } from '@/components/dashboard/broker/BrokerKPIReportCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { RecruitingIncentiveConfig } from '@/lib/types/recruitingConfig';
import { DEFAULT_RECRUITING_CONFIG } from '@/lib/types/recruitingConfig';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  projected: { label: 'Projected', color: 'hsl(var(--chart-4))' },
};

const dealsPerAgentChartConfig: ChartConfig = {
  dealsPerAgent: { label: 'Deals/Agent', color: 'hsl(var(--chart-2))' },
  dealsGoal: { label: 'Goal (1/agent/mo)', color: 'hsl(var(--chart-3))' },
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

function GradeCard({ label, grade, actual, goal, pct, yearlyGoal, monthsElapsed: mo }: { label: string; grade: string; actual: number; goal: number; pct: number; yearlyGoal?: number; monthsElapsed?: number }) {
  const color = grade === 'A' ? 'text-green-600' : grade === 'B' ? 'text-blue-600' : grade === 'C' ? 'text-yellow-600' : grade === 'D' ? 'text-orange-600' : 'text-red-600';
  const bg = grade === 'A' ? 'bg-green-50 border-green-200' : grade === 'B' ? 'bg-blue-50 border-blue-200' : grade === 'C' ? 'bg-yellow-50 border-yellow-200' : grade === 'D' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200';
  return (
    <div className={`border rounded-lg p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-2xl font-bold ${color}`}>{grade}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {typeof actual === 'number' && actual % 1 !== 0 ? actual.toFixed(2) : fmt(actual)} / {typeof goal === 'number' && goal % 1 !== 0 ? goal.toFixed(2) : fmt(goal)} ({fmtPct(pct)})
      </div>
      {mo && yearlyGoal && (
        <div className="text-xs text-muted-foreground mt-0.5">
          YTD goal ({mo} of 12 mo): {typeof goal === 'number' && goal % 1 !== 0 ? goal.toFixed(2) : fmt(goal)} of {fmt(yearlyGoal)} yearly
        </div>
      )}
      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: grade === 'A' ? '#22c55e' : grade === 'B' ? '#3b82f6' : grade === 'C' ? '#eab308' : grade === 'D' ? '#f97316' : '#ef4444' }} />
      </div>
    </div>
  );
}

function KPI({ title, value, sub, icon: Icon, tooltip }: { title: string; value: string; sub: string; icon: React.ElementType; tooltip?: { what: string; how: string } }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs space-y-1.5">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-muted-foreground leading-relaxed">{tooltip.what}</p>
                  <div className="border-t pt-1.5">
                    <p className="font-medium text-foreground/80 mb-0.5">How it&apos;s calculated:</p>
                    <p className="text-muted-foreground leading-relaxed">{tooltip.how}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
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
  // Fields that are auto-populated from live data (departures from endDate, inTraining from grace period)
  const AUTO_FIELDS = new Set(['departures', 'inTraining']);
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
    { key: 'departures', label: 'Departures*' },
    { key: 'inTraining', label: 'In Training*' },
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
          <CardDescription>
            Enter monthly recruiting activity data for each month.
            <span className="text-amber-700 font-medium"> * Departures and In Training are auto-populated from agent profiles (endDate and grace period). Enter a value to override.</span>
          </CardDescription>
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
                        {fields.map(f => {
                          const isAuto = AUTO_FIELDS.has(f.key);
                          const autoVal = f.key === 'departures' ? (months.find(md => md.month === m)?.autoDepartures ?? 0) : f.key === 'inTraining' ? (months.find(md => md.month === m)?.autoInTraining ?? 0) : null;
                          return (
                            <td key={f.key} className="py-1 px-1">
                              <div className="relative">
                                <Input
                                  type="number"
                                  value={d[f.key] || ''}
                                  onChange={e => update(m, f.key, e.target.value)}
                                  className={`h-7 w-16 text-xs ${isAuto && !d[f.key] ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}`}
                                  placeholder={isAuto && autoVal != null ? String(autoVal) : '0'}
                                />
                              </div>
                            </td>
                          );
                        })}
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

// ── Historical Year Goals Editor ────────────────────────────────────────────
// Collapsible section with a toggle switch — lets broker/team leader set
// goals for past years so the Year Scorecard can grade historical performance.

function HistoricalGoalsEditor() {
  const { user } = useUser();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const pastYears = Array.from({ length: 6 }, (_, i) => currentYear - 1 - i); // last 6 years

  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(pastYears[0]);
  const [goals, setGoals] = useState<Record<number, { agentsGoal: string; hiresGoal: string; netGainGoal: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(async (yr: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/broker/active-agents/year-scorecard?year=${yr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const g = data.goals ?? {};
      setGoals(prev => ({
        ...prev,
        [yr]: {
          agentsGoal: g.yearlyActiveAgentsGoal != null ? String(g.yearlyActiveAgentsGoal) : '',
          hiresGoal: g.yearlyNewHiresGoal != null ? String(g.yearlyNewHiresGoal) : '',
          netGainGoal: g.netGainGoal != null ? String(g.netGainGoal) : '',
        },
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (open) loadGoals(selectedYear);
  }, [open, selectedYear, loadGoals]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const g = goals[selectedYear] ?? {};
      await fetch('/api/broker/active-agents/year-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          year: selectedYear,
          yearlyActiveAgentsGoal: g.agentsGoal ? parseInt(g.agentsGoal, 10) : null,
          yearlyNewHiresGoal: g.hiresGoal ? parseInt(g.hiresGoal, 10) : null,
          netGainGoal: g.netGainGoal !== '' ? parseInt(g.netGainGoal, 10) : null,
        }),
      });
      toast({ title: 'Saved!', description: `${selectedYear} historical goals updated.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: 'Could not save goals.' });
    } finally { setSaving(false); }
  };

  const g = goals[selectedYear] ?? { agentsGoal: '', hiresGoal: '', netGainGoal: '' };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch checked={open} onCheckedChange={setOpen} id="historical-goals-toggle" />
              <label htmlFor="historical-goals-toggle" className="cursor-pointer">
                <CardTitle className="text-lg">Historical Year Goals</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Set goals for past years to grade historical performance in the Year Scorecard.
                </CardDescription>
              </label>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Select Year</Label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pastYears.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Year-End Active Agents Goal</Label>
                <Input
                  type="number"
                  placeholder="e.g. 80"
                  value={g.agentsGoal}
                  onChange={e => setGoals(prev => ({ ...prev, [selectedYear]: { ...g, agentsGoal: e.target.value } }))}
                />
                <p className="text-xs text-muted-foreground">Target active agent count by Dec {selectedYear}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Yearly New Hires Goal</Label>
                <Input
                  type="number"
                  placeholder="e.g. 24"
                  value={g.hiresGoal}
                  onChange={e => setGoals(prev => ({ ...prev, [selectedYear]: { ...g, hiresGoal: e.target.value } }))}
                />
                <p className="text-xs text-muted-foreground">How many new agents to onboard in {selectedYear}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Net Agent Gain Goal</Label>
                <Input
                  type="number"
                  placeholder="e.g. 10"
                  value={g.netGainGoal}
                  onChange={e => setGoals(prev => ({ ...prev, [selectedYear]: { ...g, netGainGoal: e.target.value } }))}
                />
                <p className="text-xs text-muted-foreground">Net new agents (hires minus departures) for {selectedYear}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : `Save ${selectedYear} Goals`}
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

// ── Team Group & Status Helpers ─────────────────────────────────────────────

const TEAM_GROUP_LABELS: Record<string, string> = {
  referral_group: 'Referral Group',
  cgl: 'CGL',
  sgl: 'SGL',
  charles_ditch_team: 'Charles Ditch Team',
  independent: 'Independent',
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 border-green-300' },
  grace_period: { label: 'Grace Period', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-600 border-gray-300' },
  out: { label: 'Out', className: 'bg-red-100 text-red-800 border-red-300' },
};

function TeamGroupBadge({ teamGroup }: { teamGroup: string | null }) {
  const label = TEAM_GROUP_LABELS[teamGroup || ''] || teamGroup || 'Unknown';
  return <span className="text-[10px] text-muted-foreground">{label}</span>;
}

function AgentStatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_LABELS[status || 'active'] || STATUS_LABELS.active;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Agent Performance Roster ────────────────────────────────────────────────

type SortField = 'name' | 'teamGroup' | 'engGrade' | 'apptGrade' | 'incomeGrade' | 'pipelineGrade' | 'incomeActual' | 'engActual' | 'apptActual' | 'graceStatus';
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
  const [filterTeamGroup, setFilterTeamGroup] = useState<string>('all');
  const [filterGrace, setFilterGrace] = useState<string>('all');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [resetTarget, setResetTarget] = useState<{ agentId: string; name: string } | null>(null);
  const [resetNote, setResetNote] = useState('');
  const [resetting, setResetting] = useState(false);
  // Coaching notes state
  const [notesTarget, setNotesTarget] = useState<{ agentId: string; name: string } | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const { toast } = useToast();

  const openNotesPanel = async (agentId: string, name: string) => {
    if (!user) return;
    setNotesTarget({ agentId, name });
    setNotesLoading(true);
    setNotes([]);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/coaching-notes?agentId=${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); setNotes(d.notes || []); }
    } catch { /* ignore */ }
    finally { setNotesLoading(false); }
  };

  const handleAddNote = async () => {
    if (!user || !notesTarget || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/coaching-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentId: notesTarget.agentId, note: newNote.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      const d = await res.json();
      setNotes(prev => [d.note, ...prev]);
      setNewNote('');
      toast({ title: 'Note Saved', description: `Coaching note added for ${notesTarget.name}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingNote(false); }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/agent/coaching-notes?id=${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch { /* ignore */ }
  };

  const handleResetPlan = async () => {
    if (!user || !resetTarget) return;
    setResetting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/plan/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentId: resetTarget.agentId, note: resetNote }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Reset failed'); }
      toast({ title: 'Plan Reset', description: `${resetTarget.name}'s business plan has been reset to today.` });
      setResetTarget(null);
      setResetNote('');
      fetchRoster();
    } catch (e: any) {
      toast({ title: 'Reset Failed', description: e.message, variant: 'destructive' });
    } finally { setResetting(false); }
  };

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

  // Get unique team groups from agents
  const teamGroups = [...new Set(agents.map((a: any) => a.teamGroup).filter(Boolean))].sort() as string[];

  // Filter
  let filtered = [...agents];
  if (filterGrade !== 'all') {
    filtered = filtered.filter((a: any) => a.incomeGrade === filterGrade);
  }
  if (filterTeamGroup !== 'all') {
    filtered = filtered.filter((a: any) => a.teamGroup === filterTeamGroup);
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
    } else if (filterGrace === 'no_deals_yet') {
      filtered = filtered.filter((a: any) => !a.isGracePeriod && a.closedDeals === 0 && a.pendingDeals === 0);
    }
  }

  // Sort
  filtered.sort((a: any, b: any) => {
    let cmp = 0;
    switch (sortField) {
      case 'name': cmp = a.displayName.localeCompare(b.displayName); break;
      case 'teamGroup': cmp = (a.teamGroup || '').localeCompare(b.teamGroup || ''); break;
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

  // First-year tracker agents: grace period + first-year (day 0-365), sorted by trackerPriority
  const firstYearTrackerAgents = agents
    .filter((a: any) => a.isFirstYearAgent === true)
    .sort((a: any, b: any) => {
      // Primary: trackerPriority (lower = more urgent)
      const pDiff = (a.trackerPriority ?? 99) - (b.trackerPriority ?? 99);
      if (pDiff !== 0) return pDiff;
      // Secondary: days since start descending (more days = more urgent within same priority)
      return (b.daysSinceStart ?? 0) - (a.daysSinceStart ?? 0);
    });

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
        <button
          onClick={() => setFilterGrace(filterGrace === 'no_deals_yet' ? 'all' : 'no_deals_yet')}
          className={`rounded-lg border-2 transition-all text-left ${filterGrace === 'no_deals_yet' ? 'border-amber-500 ring-2 ring-amber-400 ring-offset-1' : 'border-amber-200 hover:border-amber-400'} bg-amber-50/50`}>
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <p className="text-xs text-amber-700 font-medium">No Deals Yet</p>
            </div>
            <p className="text-2xl font-bold text-amber-700">{summary.noDealsYet ?? 0}</p>
            <p className="text-[10px] text-amber-600">Click to filter</p>
          </div>
        </button>
      </div>

      {/* Team Group Breakdown */}
      {summary.teamGroupBreakdown && Object.keys(summary.teamGroupBreakdown).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground font-medium">By Team Group:</span>
          {Object.entries(summary.teamGroupBreakdown as Record<string, number>)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([key, count]) => (
              <button key={key}
                onClick={() => setFilterTeamGroup(filterTeamGroup === key ? 'all' : key)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors border ${
                  filterTeamGroup === key ? 'ring-2 ring-offset-1 ring-blue-500 bg-blue-50' : 'hover:bg-muted'
                }`}>
                <span className="font-medium">{TEAM_GROUP_LABELS[key] || key}</span>
                <span className="text-muted-foreground">({count as number})</span>
              </button>
            ))}
          {filterTeamGroup !== 'all' && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterTeamGroup('all')}>Clear</Button>
          )}
        </div>
      )}

      {/* ── Block 1: New Agent 90-Day + First-Year Tracker ──────────────── */}
      {firstYearTrackerAgents.length > 0 && (
        <Card className="border-2 border-amber-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg">New Agent 90-Day + First-Year Tracker</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {summary.firstYearCritical > 0 && (
                  <Badge className="bg-red-100 text-red-800 border border-red-300">
                    🚨 {summary.firstYearCritical} Critical
                  </Badge>
                )}
                {summary.firstYearNeedAttention > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-300">
                    ⚠️ {summary.firstYearNeedAttention} Need Attention
                  </Badge>
                )}
                {summary.firstYearSlipped > 0 && (
                  <Badge className="bg-orange-100 text-orange-800 border border-orange-300">
                    ⏰ {summary.firstYearSlipped} Slipped
                  </Badge>
                )}
                {summary.firstYearOnTrack > 0 && (
                  <Badge className="bg-green-100 text-green-800 border border-green-300">
                    ✓ {summary.firstYearOnTrack} On Track
                  </Badge>
                )}
                {summary.firstYearProducing > 0 && (
                  <Badge className="bg-blue-100 text-blue-800 border border-blue-300">
                    🏆 {summary.firstYearProducing} Producing
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription>
              Goal: every new agent closes a deal by day 90. Something under contract by day 60. First-year agents (day 0–365) only. Sorted by urgency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {firstYearTrackerAgents.map((a: any) => {
                const isInGrace = a.isGracePeriod;
                const days = a.daysSinceStart ?? 0;
                const progressPct = Math.min(100, (days / 365) * 100);
                const gracePct = Math.min(100, (days / 90) * 100);

                // Row color by priority
                const rowBg =
                  a.trackerPriority === 0 ? 'bg-red-50/60 border-red-300'
                  : a.trackerPriority === 1 ? 'bg-amber-50/50 border-amber-200'
                  : a.trackerPriority === 2 ? 'bg-orange-50/50 border-orange-200'
                  : a.trackerPriority === 3 ? 'bg-green-50/30 border-green-200'
                  : 'bg-blue-50/20 border-blue-200';

                const priorityLabel =
                  a.trackerPriority === 0 ? { text: '🚨 Critical', cls: 'bg-red-100 text-red-800 border-red-300' }
                  : a.trackerPriority === 1 ? { text: '⚠️ Needs Attention', cls: 'bg-amber-100 text-amber-800 border-amber-300' }
                  : a.trackerPriority === 2 ? { text: '⏰ Slipped', cls: 'bg-orange-100 text-orange-800 border-orange-300' }
                  : a.trackerPriority === 3 ? { text: '✓ On Track', cls: 'bg-green-100 text-green-800 border-green-300' }
                  : { text: '🏆 Producing', cls: 'bg-blue-100 text-blue-800 border-blue-300' };

                return (
                  <div key={a.agentId} className={`border rounded-lg p-3 ${rowBg}`}>
                    <div className="flex items-start gap-4 flex-wrap">
                      {/* Name & Team */}
                      <div className="min-w-[150px]">
                        <p className="text-sm font-semibold">{a.displayName}</p>
                        <TeamGroupBadge teamGroup={a.teamGroup} />
                        <div className="mt-1">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${priorityLabel.cls}`}>
                            {priorityLabel.text}
                          </span>
                        </div>
                      </div>

                      {/* Progress bars */}
                      <div className="flex-1 min-w-[160px]">
                        {/* Year progress */}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                          <span>Day {days} / 365</span>
                          {a.startDate && <span>Started {a.startDate}</span>}
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative mb-1">
                          <div className="h-full rounded-full bg-gray-400 transition-all" style={{ width: `${progressPct}%` }} />
                          {/* 90-day marker */}
                          <div className="absolute top-0 left-[24.6%] w-px h-full bg-amber-500/70" />
                        </div>
                        {/* 90-day grace bar (if still in grace) */}
                        {isInGrace && (
                          <>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                              <span>Grace: Day {days} / 90</span>
                              {a.gracePeriodDaysRemaining != null && <span>{a.gracePeriodDaysRemaining}d left</span>}
                            </div>
                            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden relative">
                              <div className={`h-full rounded-full transition-all ${
                                a.graceStatus === 'grace_on_track' ? 'bg-green-500'
                                : a.graceStatus === 'grace_at_risk' ? 'bg-red-500'
                                : 'bg-amber-500'
                              }`} style={{ width: `${gracePct}%` }} />
                              <div className="absolute top-0 left-[33.3%] w-px h-full bg-gray-400/50" />
                              <div className="absolute top-0 left-[66.6%] w-px h-full bg-gray-400/50" />
                            </div>
                            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                              <span>M1</span><span>M2</span><span>M3</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Milestone Warnings */}
                      <div className="flex flex-col gap-1 min-w-[120px]">
                        <div className={`text-[10px] px-2 py-1 rounded border font-medium ${
                          a.warn60DayNoPending
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : (a.pendingDeals > 0 || a.closedDeals > 0)
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          {a.warn60DayNoPending ? '⚠️ 60-day: no pending' : (a.pendingDeals > 0 || a.closedDeals > 0) ? '✓ Has deal in pipeline' : `Day ${days < 60 ? 60 - days : 0} until 60-day check`}
                        </div>
                        <div className={`text-[10px] px-2 py-1 rounded border font-medium ${
                          a.warn90DayNoClose
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : a.closedDeals > 0
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          {a.warn90DayNoClose ? '🚨 90-day: no close' : a.closedDeals > 0 ? '✓ Has closed deal' : `Day ${days < 90 ? 90 - days : 0} until 90-day check`}
                        </div>
                      </div>

                      {/* Deals & Engagements */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center min-w-[45px]">
                          <p className="text-[10px] text-muted-foreground">Closed</p>
                          <p className={`text-sm font-bold ${a.closedDeals > 0 ? 'text-green-600' : 'text-red-500'}`}>{a.closedDeals}</p>
                        </div>
                        <div className="text-center min-w-[45px]">
                          <p className="text-[10px] text-muted-foreground">Pending</p>
                          <p className={`text-sm font-bold ${a.pendingDeals > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>{a.pendingDeals}</p>
                        </div>
                        <div className="text-center min-w-[45px]">
                          <p className="text-[10px] text-muted-foreground">Eng.</p>
                          <p className="text-sm font-medium">{a.engagementsActual}</p>
                        </div>
                        {/* Last Activity */}
                        <div className="text-center min-w-[55px]">
                          <p className="text-[10px] text-muted-foreground">Last Active</p>
                          <p className={`text-xs font-semibold ${
                            !a.lastActivityDate ? 'text-red-500'
                            : a.daysSinceLastActivity === 0 ? 'text-green-600'
                            : a.daysSinceLastActivity <= 3 ? 'text-green-500'
                            : a.daysSinceLastActivity <= 7 ? 'text-amber-600'
                            : 'text-red-600'
                          }`}>
                            {!a.lastActivityDate ? 'Never'
                              : a.daysSinceLastActivity === 0 ? 'Today'
                              : a.daysSinceLastActivity === 1 ? 'Yesterday'
                              : `${a.daysSinceLastActivity}d ago`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" />View</Button>
                          </Link>
                          <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openNotesPanel(a.agentId, a.displayName)}>
                            <MessageSquare className="h-3 w-3 mr-1" />Notes
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Block 2: Active — No Deals Yet (all tenures) ─────────────── */}
      {(() => {
        const noDealsYetAgents = agents.filter((a: any) =>
          a.closedDeals === 0 && a.pendingDeals === 0
        ).sort((a: any, b: any) => {
          const aDate = a.startDate ? new Date(a.startDate).getTime() : Infinity;
          const bDate = b.startDate ? new Date(b.startDate).getTime() : Infinity;
          return aDate - bDate;
        });
        if (noDealsYetAgents.length === 0) return null;
        return (
          <Card className="border-2 border-amber-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Active — No Deals Yet This Year</CardTitle>
                </div>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                  {noDealsYetAgents.length} agent{noDealsYetAgents.length !== 1 ? 's' : ''} need attention
                </Badge>
              </div>
              <CardDescription>
                All active agents with zero closed and zero pending deals so far this year. Includes all tenures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {noDealsYetAgents.map((a: any) => (
                  <div key={a.agentId} className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50/30 border-amber-200">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {TEAM_GROUP_LABELS[a.teamGroup] || a.teamGroup || 'No Team'}
                        {a.startDate && ` · Started ${a.startDate}`}
                        {a.daysSinceStart != null && ` · Day ${a.daysSinceStart}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 flex-wrap">
                      <div className="text-center min-w-[55px]">
                        <p className="text-[10px] text-muted-foreground">Engagements</p>
                        <p className="text-sm font-medium">{a.engagementsActual}</p>
                        <Delta value={a.engagementsDelta} />
                      </div>
                      <div className="text-center min-w-[55px]">
                        <p className="text-[10px] text-muted-foreground">Appts Held</p>
                        <p className="text-sm font-medium">{a.appointmentsHeldActual}</p>
                        <Delta value={a.appointmentsDelta} />
                      </div>
                      <div className="text-center min-w-[55px]">
                        <p className="text-[10px] text-muted-foreground">Eng. Grade</p>
                        <GradeBadge grade={a.engagementsGrade} />
                      </div>
                      <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                          <Eye className="h-3 w-3 mr-1" />View Dashboard
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Block 3: Director's Live Scorecard ───────────────────── */}
      <Card className="border-2 border-blue-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Director’s Live Scorecard</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">F {summary.gradeDistribution['F'] || 0}</Badge>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">D {summary.gradeDistribution['D'] || 0}</Badge>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">C {summary.gradeDistribution['C'] || 0}</Badge>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">B {summary.gradeDistribution['B'] || 0}</Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">A {summary.gradeDistribution['A'] || 0}</Badge>
            </div>
          </div>
          <CardDescription>
            Live engagement, appointment, and income scorecard for all agents. Struggling agents (D/F) shown first. Use the “Reset Plan” button to restart an agent’s business plan from today.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

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
        {teamGroups.length > 1 && (
          <Select value={filterTeamGroup} onValueChange={setFilterTeamGroup}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Team Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Groups</SelectItem>
              {teamGroups.map(tg => <SelectItem key={tg} value={tg}>{TEAM_GROUP_LABELS[tg] || tg}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterGrace} onValueChange={setFilterGrace}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="in_grace">In Grace Period</SelectItem>
            <SelectItem value="at_risk">Grace At Risk</SelectItem>
            <SelectItem value="no_deal">Grace — No Deal</SelectItem>
            <SelectItem value="no_deals_yet">Active — No Deals Yet</SelectItem>
            <SelectItem value="established">Established</SelectItem>
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
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort('teamGroup')}>
                      <div className="flex items-center justify-center gap-1">Team Group <SortIcon field="teamGroup" /></div>
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
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Activity className="h-3 w-3" />Last Active</div></TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a: any) => (
                    <TableRow key={a.agentId} className={a.isGracePeriod ? 'bg-amber-50/50' : (!a.isGracePeriod && a.closedDeals === 0 && a.pendingDeals === 0 ? 'bg-amber-50/20' : '')}>
                      {/* Agent Name */}
                      <TableCell className="sticky left-0 bg-background z-10 font-medium">
                        <div>
                          <span className="text-sm">{a.displayName}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <AgentStatusBadge status={a.agentStatus} />
                            {a.teamRole === 'leader' && <Badge variant="outline" className="text-[9px] h-4 px-1">Leader</Badge>}
                            {!a.isGracePeriod && a.closedDeals === 0 && a.pendingDeals === 0 && (
                              <Badge className="text-[9px] h-4 px-1 bg-amber-100 text-amber-800 border border-amber-300">No Deals Yet</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Team Group */}
                      <TableCell className="text-center">
                        <span className="text-xs">{TEAM_GROUP_LABELS[a.teamGroup] || a.teamGroup || '—'}</span>
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

                      {/* Last Activity */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {a.retentionRisk && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">
                              <Flame className="h-2.5 w-2.5" />At Risk
                            </span>
                          )}
                          {a.lastActivityDate ? (
                            <>
                              <span className={`text-xs font-medium ${
                                a.daysSinceLastActivity === 0 ? 'text-green-600'
                                : a.daysSinceLastActivity <= 3 ? 'text-green-500'
                                : a.daysSinceLastActivity <= 7 ? 'text-amber-600'
                                : a.daysSinceLastActivity <= 14 ? 'text-orange-600'
                                : 'text-red-600'
                              }`}>
                                {a.daysSinceLastActivity === 0 ? 'Today'
                                  : a.daysSinceLastActivity === 1 ? 'Yesterday'
                                  : `${a.daysSinceLastActivity}d ago`}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{a.lastActivityDate}</span>
                            </>
                          ) : (
                            <span className="text-xs text-red-500 font-medium">No activity</span>
                          )}
                        </div>
                      </TableCell>

                      {/* View + Reset + Notes */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Dashboard"><Eye className="h-3.5 w-3.5" /></Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Coaching Notes" onClick={() => openNotesPanel(a.agentId, a.displayName)}>
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" title="Reset Business Plan" onClick={() => { setResetTarget({ agentId: a.agentId, name: a.displayName }); setResetNote(''); }}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
            <Card key={a.agentId} className={`overflow-hidden ${a.isGracePeriod ? 'border-amber-300' : (!a.isGracePeriod && a.closedDeals === 0 && a.pendingDeals === 0) ? 'border-amber-300 bg-amber-50/20' : (a.incomeGrade === 'F' || a.incomeGrade === 'D') ? 'border-red-300' : (a.incomeGrade === 'A') ? 'border-green-300' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{a.displayName}</CardTitle>
                      {!a.isGracePeriod && a.closedDeals === 0 && a.pendingDeals === 0 && (
                        <Badge className="text-[9px] h-4 px-1 bg-amber-100 text-amber-800 border border-amber-300">No Deals Yet</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs">
                      {TEAM_GROUP_LABELS[a.teamGroup] || a.teamGroup || 'Independent'}
                      {a.teamRole === 'leader' && ' · Team Leader'}
                      {a.agentStatus && a.agentStatus !== 'active' && (
                        <span className="ml-1">· <AgentStatusBadge status={a.agentStatus} /></span>
                      )}
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

                {/* Last Activity */}
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" />Last Active</span>
                  <div className="flex items-center gap-1.5">
                    {a.retentionRisk && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-300"><Flame className="h-2.5 w-2.5" />At Risk</span>}
                    <span className={`font-medium ${
                      !a.lastActivityDate ? 'text-red-500'
                      : a.daysSinceLastActivity === 0 ? 'text-green-600'
                      : a.daysSinceLastActivity <= 7 ? 'text-amber-600'
                      : 'text-red-600'
                    }`}>
                      {!a.lastActivityDate ? 'No activity logged'
                        : a.daysSinceLastActivity === 0 ? 'Today'
                        : a.daysSinceLastActivity === 1 ? 'Yesterday'
                        : `${a.daysSinceLastActivity} days ago`}
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Link href={`/dashboard?viewAs=${a.agentId}&viewAsName=${encodeURIComponent(a.displayName)}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" />View Dashboard</Button>
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openNotesPanel(a.agentId, a.displayName)}>
                      <MessageSquare className="h-3 w-3 mr-1" />Notes
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => { setResetTarget({ agentId: a.agentId, name: a.displayName }); setResetNote(''); }}>
                      <RefreshCw className="h-3 w-3 mr-1" />Reset Plan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </CardContent>
      </Card>

      {/* Coaching Notes Dialog */}
      <Dialog open={!!notesTarget} onOpenChange={open => { if (!open) { setNotesTarget(null); setNotes([]); setNewNote(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Coaching Notes — {notesTarget?.name}
            </DialogTitle>
            <DialogDescription>Notes are visible to the agent and Director of Agent Development.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Add new note */}
            <div className="space-y-2">
              <Textarea
                placeholder="Add a coaching note... (e.g. Met today, discussed prospecting strategy, reset plan)"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <Button onClick={handleAddNote} disabled={savingNote || !newNote.trim()} size="sm" className="w-full">
                {savingNote ? 'Saving...' : <><Send className="h-3.5 w-3.5 mr-1.5" />Add Note</>}
              </Button>
            </div>
            {/* Notes list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notesLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading notes...</p>}
              {!notesLoading && notes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No coaching notes yet. Add the first one above.</p>
              )}
              {notes.map((n: any) => (
                <div key={n.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm">{n.note}</p>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 flex-shrink-0" onClick={() => handleDeleteNote(n.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{n.authorName} · {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNotesTarget(null); setNotes([]); setNewNote(''); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Plan Confirmation Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={open => { if (!open) { setResetTarget(null); setResetNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-600" />
              Reset Business Plan
            </DialogTitle>
            <DialogDescription>
              This will reset <strong>{resetTarget?.name}</strong>&apos;s business plan start date to <strong>today</strong>. Their existing goals and targets stay the same — only the start date changes, so all YTD calculations will prorate from today forward.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
              <p className="font-medium">What this does:</p>
              <ul className="mt-1 space-y-1 text-xs list-disc list-inside">
                <li>Sets a new plan start date to today</li>
                <li>All engagement, appointment, and income goals remain unchanged</li>
                <li>YTD progress calculations restart from today</li>
                <li>The agent will receive an in-app notification</li>
              </ul>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Note to Agent (optional)</Label>
              <Textarea
                placeholder="e.g. We met today and agreed to reset your plan. New targets start fresh from today — let's hit that first deal in 30 days!"
                value={resetNote}
                onChange={e => setResetNote(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetNote(''); }}>Cancel</Button>
            <Button onClick={handleResetPlan} disabled={resetting} className="bg-orange-600 hover:bg-orange-700 text-white">
              {resetting ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Resetting...</> : <><RefreshCw className="h-4 w-4 mr-2" />Reset Plan from Today</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function RecruitingDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [activeAgentsData, setActiveAgentsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportCardOpen, setReportCardOpen] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const params = new URLSearchParams({ year: String(year) });
      if (compareYear) params.set('compareYear', String(compareYear));
      // Fetch both recruiting metrics and real active agent data in parallel
      const [metricsRes, activeRes] = await Promise.all([
        fetch(`/api/broker/recruiting-metrics?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/broker/active-agents?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!metricsRes.ok) { const e = await metricsRes.json(); throw new Error(e.error); }
      const [metricsData, activeData] = await Promise.all([metricsRes.json(), activeRes.ok ? activeRes.json() : null]);
      setData(metricsData);
      setActiveAgentsData(activeData);
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

  // Real active agent data from the authoritative active-agents API
  const realActiveAgents = activeAgentsData?.kpi?.currentActive ?? totals.activeAgents;
  const realYtdNewHires = activeAgentsData?.kpi?.ytdNewHires ?? totals.newHires;
  const realYtdDepartures = activeAgentsData?.kpi?.ytdDepartures ?? totals.departures;
  const realYtdDealsPerAgent = activeAgentsData?.kpi?.ytdDealsPerAgent ?? totals.avgDealsPerAgent;
  const realPipelineCount = activeAgentsData?.kpi?.pipelineCount ?? 0;

  // Build chart data for Active Agents chart (from real active-agents API)
  const activeAgentChartData = (activeAgentsData?.months ?? months).map((m: any) => {
    const proj = activeAgentsData?.projection?.find((p: any) => p.month === m.month);
    return {
      ...m,
      activeAgents: m.totalActive ?? m.activeAgents ?? 0,
      activeAgentsGoal: m.goal ?? null,
      projected: proj?.projected ?? null,
    };
  });

  // Build chart data for Deals/Agent chart (from real active-agents API)
  const dealsPerAgentChartData = (activeAgentsData?.months ?? months).map((m: any) => ({
    ...m,
    dealsPerAgent: m.dealsPerAgent ?? 0,
    dealsGoal: 1, // goal = 1 deal per agent per month
  }));

  // Correct avg deals/agent: average of monthly ratios YTD
  const currentMonthNum = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;
  const monthsElapsed = totals.monthsElapsed ?? currentMonthNum;
  const monthlyRatiosYTD = (activeAgentsData?.months ?? []).slice(0, monthsElapsed).filter((m: any) => (m.totalActive ?? m.activeAgents ?? 0) > 0).map((m: any) => m.dealsPerAgent ?? 0);
  const avgDealsPerAgentYTD = monthlyRatiosYTD.length > 0
    ? Math.round((monthlyRatiosYTD.reduce((s: number, r: number) => s + r, 0) / monthlyRatiosYTD.length) * 100) / 100
    : totals.avgDealsPerAgent;
  const ytdDealsGoal = monthsElapsed; // 1 deal/agent/month × months elapsed

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

      {/* ── Recruiter & DAD To-Do Board ──────────────────────────────── */}
      <RecruiterTodoBoard />

      <Tabs defaultValue="recruiting" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recruiting">Recruiting Pipeline</TabsTrigger>
          <TabsTrigger value="roster">Agent Performance Roster</TabsTrigger>
          <TabsTrigger value="incentive">Incentive Program Config</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Agent Performance Roster ─────────────────────────────── */}
        <TabsContent value="roster" className="space-y-6 mt-6">
          <AgentPerformanceRoster year={year} />
          <OneOnOneScheduler agents={[]} />
        </TabsContent>

        {/* ── TAB 2: Recruiting Pipeline (existing content) ───────────────── */}
        <TabsContent value="recruiting" className="space-y-8 mt-6">
      {/* ── Broker Agent KPI Report Card ──────────────────────────────────── */}
      <BrokerKPIReportCard year={year} />


      {/* ── Recruiter Report Card ────────────────────────────────────────── */}
      <RecruiterReportCard
        activeAgents={realActiveAgents}
        ytdNewHires={realYtdNewHires}
        ytdDepartures={realYtdDepartures}
        ytdInterviewsHeld={totals.totalInterviews}
        ytdInterviewsSet={totals.totalInterviewsSet ?? 0}
        ytdProspectCalls={totals.totalProspectCalls}
        yearlyActiveAgentsGoal={plan.yearlyActiveAgentsGoal ?? null}
        yearlyNewHiresGoal={plan.yearlyNewHiresGoal ?? null}
        yearlyInterviewsGoal={funnelTargets?.yearly?.interviewsHeld ?? null}
        yearlyInterviewsSetGoal={funnelTargets?.yearly?.interviewsSet ?? null}
        yearlyProspectCallsGoal={funnelTargets?.yearly?.calls ?? null}
        monthsElapsed={monthsElapsed}
        isCurrentYear={new Date().getFullYear() === year}
        open={reportCardOpen}
        onToggle={() => setReportCardOpen(v => !v)}
      />





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

      {/* ── CHART 1: Active Agents Count ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Active Agent Count</CardTitle>
              <CardDescription>Monthly active agent count vs goal and pipeline — {year}</CardDescription>
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
          <ChartContainer config={agentChartConfig} className="h-[300px] w-full">
            <ComposedChart data={activeAgentChartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="activeAgents" fill="var(--color-activeAgents)" radius={[4, 4, 0, 0]} name={`${year} Active`} />
              {compareYear && <Bar dataKey="compareActiveAgents" fill="var(--color-compareActiveAgents)" radius={[4, 4, 0, 0]} opacity={0.5} name={`${compareYear}`} />}
              <Line dataKey="activeAgentsGoal" type="monotone" stroke="var(--color-activeAgentsGoal)" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Goal" />
              <Line dataKey="projected" type="monotone" stroke="hsl(var(--chart-4))" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Projected" />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── CHART 1b: Avg Deals Per Agent ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Avg Deals Per Agent (Monthly)</CardTitle>
          <CardDescription>
            Deals closed ÷ active agents per month. Goal = 1 deal/agent/month.
            YTD avg: <strong>{avgDealsPerAgentYTD}</strong> vs goal of <strong>{ytdDealsGoal}</strong> ({monthsElapsed} months × 1/mo)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={dealsPerAgentChartConfig} className="h-[280px] w-full">
            <ComposedChart data={dealsPerAgentChartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => v.toFixed(1)} domain={[0, 'auto']} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="dealsPerAgent" fill="var(--color-dealsPerAgent)" radius={[4, 4, 0, 0]} name="Deals/Agent" />
              <Line dataKey="dealsGoal" type="monotone" stroke="var(--color-dealsGoal)" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Goal (1/mo)" />
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
      <HistoricalGoalsEditor />

      {/* ── Active Agents Chart (computed from Firestore) ──────────────── */}
      <ActiveAgentsChart showGoalEdit={true} initialYear={year} />

      {/* ── Recruiting Pipeline ─────────────────────────────────────────────── */}
      <RecruitingPipelinePanel />

        </TabsContent>

        {/* ── TAB 3: Incentive Program Config ─────────────────────────────── */}
        <TabsContent value="incentive" className="space-y-6 mt-6">
          <IncentiveConfigPanel />
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ── Incentive Program Config Panel ──────────────────────────────────────────
function IncentiveConfigPanel() {
  const { user } = useUser();
  const { toast } = useToast();
  const [config, setConfig] = useState<RecruitingIncentiveConfig | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<RecruitingIncentiveConfig, 'id' | 'updatedAt' | 'updatedByUid'>>(DEFAULT_RECRUITING_CONFIG);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/recruiting-config', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.ok) {
          setConfig(json.config);
          setIsDefault(json.isDefault);
          const { id: _id, updatedAt: _ua, updatedByUid: _ub, ...rest } = json.config;
          setForm(rest);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/recruiting-config', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        setConfig(json.config);
        setIsDefault(false);
        toast({ title: 'Saved', description: 'Incentive program configuration saved.' });
      } else {
        toast({ title: 'Error', description: json.error || 'Failed to save configuration.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Unexpected error.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const upd = (key: keyof typeof form, val: any) => setForm(p => ({ ...p, [key]: val }));

  if (loading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {isDefault && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Using Default Configuration</AlertTitle>
          <AlertDescription>No custom configuration has been saved yet. The values below are the system defaults. Save to lock in your program settings.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-green-600" /> Recruiting Incentive Program Settings</CardTitle>
          <CardDescription>Configure the recruiting incentive program for your brokerage. These settings apply to all agents and are used in the Recruiting Incentive Tracker and Business Plan projections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Program Name & Enable */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Program Name</Label>
              <Input value={form.programName} onChange={e => upd('programName', e.target.value)} placeholder="e.g. Keaty Recruiting Incentive Program" />
            </div>
            <div className="space-y-2">
              <Label>Program Status</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={form.enabled} onCheckedChange={v => upd('enabled', v)} />
                <span className={form.enabled ? 'text-green-600 font-medium' : 'text-muted-foreground'}>{form.enabled ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* GCI Threshold & Window */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>GCI Threshold to Qualify ($)</Label>
              <Input type="number" min={0} value={form.gciThreshold} onChange={e => upd('gciThreshold', Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Recruit must close this much GCI within their window to trigger a payout.</p>
            </div>
            <div className="space-y-2">
              <Label>Window Type</Label>
              <Select value={form.windowType} onValueChange={v => upd('windowType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anniversary">Anniversary Year (12 months from hire date)</SelectItem>
                  <SelectItem value="calendar">Calendar Year (Jan 1 – Dec 31)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Window Length (months)</Label>
              <Input type="number" min={1} max={24} value={form.windowMonths} onChange={e => upd('windowMonths', Number(e.target.value))} />
            </div>
          </div>

          {/* Payout Amounts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Tier 1 Payout Amount ($)</Label>
              <Input type="number" min={0} value={form.tier1PayoutAmount} onChange={e => upd('tier1PayoutAmount', Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Paid to the direct referrer when their recruit qualifies.</p>
            </div>
            <div className="space-y-2">
              <Label>Tier 2 Payout Amount ($)</Label>
              <Input type="number" min={0} value={form.tier2PayoutAmount} onChange={e => upd('tier2PayoutAmount', Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Paid to the upline agent when a Tier 2 recruit qualifies. Set to $0 to disable Tier 2 payouts.</p>
            </div>
            <div className="space-y-2">
              <Label>Tier Depth</Label>
              <Select value={String(form.tierDepth)} onValueChange={v => upd('tierDepth', Number(v) as 1 | 2)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Direct recruits only</SelectItem>
                  <SelectItem value="2">2 — Direct + their recruits</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring */}
          <div className="space-y-2">
            <Label>Payout Recurrence</Label>
            <div className="flex items-center gap-3">
              <Switch checked={form.recurring} onCheckedChange={v => upd('recurring', v)} />
              <span className="text-sm">{form.recurring ? 'Recurring — payout renews every year the recruit re-qualifies' : 'One-time — payout is earned once per recruit, ever'}</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Program Description (shown to agents)</Label>
            <Textarea value={form.description || ''} onChange={e => upd('description', e.target.value)} rows={3} placeholder="Describe the program in plain language for agents..." />
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted/50 border p-4 space-y-1">
            <p className="text-sm font-semibold mb-2">Program Preview</p>
            <p className="text-sm text-muted-foreground">Earn <strong>${form.tier1PayoutAmount.toLocaleString()}</strong> for each agent you directly recruit who closes <strong>${form.gciThreshold.toLocaleString()}</strong> in GCI within their {form.windowType === 'anniversary' ? 'anniversary year' : 'calendar year'} ({form.windowMonths} months).</p>
            {form.tierDepth === 2 && form.tier2PayoutAmount > 0 && (
              <p className="text-sm text-muted-foreground">Also earn <strong>${form.tier2PayoutAmount.toLocaleString()}</strong> for each agent your recruits bring on who also qualifies.</p>
            )}
            {form.recurring && <p className="text-sm text-muted-foreground">This payout <strong>renews every year</strong> the recruit stays active and re-qualifies.</p>}
          </div>

          {config?.updatedAt && (
            <p className="text-xs text-muted-foreground">Last saved: {new Date(config.updatedAt).toLocaleString()}</p>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
            <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save Configuration'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
