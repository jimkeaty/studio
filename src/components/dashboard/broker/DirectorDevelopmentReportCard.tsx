'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  CalendarCheck2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Download,
  Phone,
  Plus,
  Save,
  Settings2,
  Target,
  Trash2,
  Users,
} from 'lucide-react';

type Metric = {
  key: string;
  label: string;
  actual: number;
  goal: number;
  unit: string;
  detail: string;
  pct: number | null;
  grade: string;
  missingAgents?: Array<{ agentId: string; name: string }>;
};

const ACTIVITY_LABELS: Record<string, string> = {
  call_night: 'Call Night',
  recruiting_workshop: 'Recruiting Workshop',
  buyer_seller_workshop: 'Buyer & Seller Workshop',
  ypn_event: 'YPN Event',
  partner_event: 'Mortgage / Builder / RCA Event',
  team_appointments: 'Team Appointments',
  new_agent_welcome_call: 'New Agent Welcome Call',
  new_agent_follow_up: 'New Agent Follow-Up',
  in_person_relationship_meeting: 'In-Person Coffee / Lunch Relationship Meeting',
  sales_meeting: 'Sales Meeting',
  huddle: 'Team Huddle',
  role_play_ids: 'Role Play / New Agent IDS',
  training_session: 'Training Session',
  custom: 'Custom KPI Activity',
};

const GRADE_STYLE: Record<string, string> = {
  A: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  B: 'border-blue-200 bg-blue-50 text-blue-700',
  C: 'border-amber-200 bg-amber-50 text-amber-700',
  D: 'border-orange-200 bg-orange-50 text-orange-700',
  F: 'border-red-200 bg-red-50 text-red-700',
  '—': 'border-slate-200 bg-slate-50 text-slate-600',
};

function labelDate(date: string | null | undefined) {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function GoalCard({ metric }: { metric: Metric }) {
  const pct = metric.pct == null ? null : Math.min(metric.pct, 100);
  const missing = metric.missingAgents || [];
  return (
    <div className={`border rounded-lg p-4 min-h-[168px] ${GRADE_STYLE[metric.grade] || GRADE_STYLE['—']}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-5">{metric.label}</p>
        <span className="text-2xl leading-none font-bold">{metric.grade}</span>
      </div>
      <p className="mt-3 text-2xl font-bold leading-none">
        {metric.actual.toLocaleString()}<span className="text-sm font-medium"> / {metric.goal.toLocaleString()}</span>
      </p>
      <p className="mt-1 text-xs opacity-80">{metric.unit}{metric.pct == null ? ' · Set a goal' : ` · ${metric.pct}% of target`}</p>
      <div className="mt-3 h-2 rounded-full bg-white/70 overflow-hidden">
        <div className="h-full rounded-full bg-current" style={{ width: `${pct ?? 0}%` }} />
      </div>
      {missing.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium">{missing.length} agent{missing.length === 1 ? '' : 's'} still need{missing.length === 1 ? 's' : ''} attention</summary>
          <p className="mt-1 leading-5 opacity-80">{missing.map(agent => agent.name).join(', ')}</p>
        </details>
      ) : (
        <p className="mt-3 text-xs leading-4 opacity-80">{metric.detail}</p>
      )}
    </div>
  );
}

export function DirectorDevelopmentReportCard({ year }: { year: number }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingEligibility, setExportingEligibility] = useState(false);
  const [goalForm, setGoalForm] = useState({
    teamAppointments: '80',
    callNightHours: '3',
    recruitingWorkshops: '1',
    buyerSellerWorkshops: '1',
    networkingEvents: '1',
    ypnEventsScheduled: '0',
    salesMeetings: '0',
    huddles: '8',
    rolePlaySessions: '4',
    trainingSessions: '0',
    newAgentFollowUps: '0',
    directorName: 'Ethan',
    customKpis: [] as Array<{ id: string; label: string; unit: string; monthlyGoal: string; active: boolean }>,
  });
  const [activityForm, setActivityForm] = useState({
    activityType: 'call_night',
    occurredOn: new Date().toISOString().slice(0, 10),
    title: '',
    count: '1',
    durationHours: '3',
    relatedAgentId: '',
    customKpiId: '',
    organization: '',
    relationshipPurpose: '',
    notes: '',
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/broker/dad-report-card?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load Director report card');
      setData(result);
      const goals = result.plan?.monthlyGoals || {};
      setGoalForm({
        teamAppointments: String(goals.teamAppointments ?? 80),
        callNightHours: String(goals.callNightHours ?? 3),
        recruitingWorkshops: String(goals.recruitingWorkshops ?? 1),
        buyerSellerWorkshops: String(goals.buyerSellerWorkshops ?? 1),
        networkingEvents: String(goals.networkingEvents ?? goals.partnerEvents ?? 1),
        ypnEventsScheduled: String(goals.ypnEventsScheduled ?? 0),
        salesMeetings: String(goals.salesMeetings ?? 0),
        huddles: String(goals.huddles ?? 8),
        rolePlaySessions: String(goals.rolePlaySessions ?? 4),
        trainingSessions: String(goals.trainingSessions ?? 0),
        newAgentFollowUps: String(goals.newAgentFollowUps ?? 0),
        directorName: String(result.director?.name || result.plan?.directorName || 'Ethan'),
        customKpis: (result.plan?.customKpis || []).map((item: any) => ({ ...item, monthlyGoal: String(item.monthlyGoal ?? 0) })),
      });
    } catch (loadError: any) {
      setError(loadError.message || 'Unable to load Director report card');
    } finally {
      setLoading(false);
    }
  }, [user, year]);

  useEffect(() => { load(); }, [load]);

  const activeAgents = data?.eligibleAgents?.active || [];
  const newAgents = data?.eligibleAgents?.newAgent90 || [];
  const customKpis = useMemo(() => data?.plan?.customKpis?.filter((item: any) => item.active) || [], [data]);

  const saveGoals = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/broker/dad-report-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'savePlan',
          year,
          directorName: goalForm.directorName,
          monthlyGoals: Object.fromEntries(Object.entries(goalForm).filter(([key]) => key !== 'customKpis' && key !== 'directorName').map(([key, value]) => [key, Number(value) || 0])),
          customKpis: goalForm.customKpis.map(item => ({ ...item, monthlyGoal: Number(item.monthlyGoal) || 0 })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save Director goals');
      toast({ title: 'Director goals saved', description: 'The report-card targets have been updated.' });
      setSettingsOpen(false);
      load();
    } catch (saveError: any) {
      toast({ title: 'Unable to save goals', description: saveError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const logActivity = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const related = [...activeAgents, ...newAgents].find((agent: any) => agent.agentId === activityForm.relatedAgentId);
      const response = await fetch('/api/broker/dad-report-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'logActivity',
          year,
          ...activityForm,
          count: Number(activityForm.count) || 0,
          durationHours: Number(activityForm.durationHours) || 0,
          relatedAgentName: related?.name || '',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to log activity');
      toast({ title: 'Director activity logged', description: 'The report card has been updated.' });
      setActivityOpen(false);
      setActivityForm({ activityType: 'call_night', occurredOn: new Date().toISOString().slice(0, 10), title: '', count: '1', durationHours: '3', relatedAgentId: '', customKpiId: '', organization: '', relationshipPurpose: '', notes: '' });
      load();
    } catch (activityError: any) {
      toast({ title: 'Unable to log activity', description: activityError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteActivity = async (id: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/broker/dad-report-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'deleteActivity', year, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to remove activity');
      toast({ title: 'Activity removed' });
      load();
    } catch (deleteError: any) {
      toast({ title: 'Unable to remove activity', description: deleteError.message, variant: 'destructive' });
    }
  };

  const exportOperationalEligibility = async () => {
    if (!user) return;
    setExportingEligibility(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/broker/dad-report-card?year=${year}&format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Unable to export operational meeting eligibility');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `operational-meeting-eligibility-${year}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError: any) {
      toast({ title: 'Unable to export eligibility', description: exportError.message, variant: 'destructive' });
    } finally {
      setExportingEligibility(false);
    }
  };

  if (loading) return <Skeleton className="h-[520px] w-full" />;
  if (error) return <Card className="border-red-200"><CardContent className="py-5 text-sm text-red-700">{error}</CardContent></Card>;
  if (!data) return null;

  const scorecard = data.scorecard || { metrics: [], overallPct: null, overallGrade: '—', scoredMetricCount: 0 };
  const period = data.reportPeriod || {};
  const addCustomKpi = () => setGoalForm(form => ({
    ...form,
    customKpis: [...form.customKpis, { id: `custom_${Date.now()}`, label: '', unit: 'activities', monthlyGoal: '0', active: true }],
  }));

  return (
    <Card className="border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-background">
      <CardHeader className="border-b border-indigo-100 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl"><ClipboardList className="h-5 w-5 text-indigo-700" />{data.director?.name || 'Ethan'} — Director of Agent Development Report Card</CardTitle>
            <CardDescription className="mt-1">Operational coaching, recruiting activity, and team-development scorecard for {year}.</CardDescription>
            <p className="mt-2 text-xs text-muted-foreground">Current period: week of {labelDate(period.weekStart)} · month of {labelDate(period.monthStart)} · quarter starting {labelDate(period.quarterStart)}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`min-w-[126px] rounded-lg border px-3 py-2 text-center ${GRADE_STYLE[scorecard.overallGrade] || GRADE_STYLE['—']}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Overall Score</p>
              <p className="mt-1 text-2xl font-bold leading-none">{scorecard.overallPct == null ? '—' : `${scorecard.overallPct}%`} · {scorecard.overallGrade}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1.5 h-3.5 w-3.5" />Goals</Button>
            <Button variant="outline" size="sm" onClick={exportOperationalEligibility} disabled={exportingEligibility}><Download className="mr-1.5 h-3.5 w-3.5" />{exportingEligibility ? 'Exporting…' : 'Export 1:1 List'}</Button>
            <Button size="sm" onClick={() => setActivityOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Log Activity</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <section>
          <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-indigo-700" /><h3 className="text-sm font-semibold">Agent Coaching Coverage</h3></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {scorecard.metrics.slice(0, 4).map((metric: Metric) => <GoalCard key={metric.key} metric={metric} />)}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-700" /><h3 className="text-sm font-semibold">Monthly Development & Recruiting Activity</h3></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {scorecard.metrics.slice(4).map((metric: Metric) => <GoalCard key={metric.key} metric={metric} />)}
          </div>
        </section>
        <Collapsible>
          <div className="rounded-lg border bg-background">
            <CollapsibleTrigger asChild><Button variant="ghost" className="flex h-auto w-full justify-between px-4 py-3 hover:bg-muted/50"><span className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-indigo-700" />Activity Log ({data.activities?.length || 0})</span><ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 pb-4 pt-3">
                {data.activities?.length ? (
                  <div className="space-y-2">
                    {data.activities.slice(0, 20).map((activity: any) => (
                      <div key={activity.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                        <div><p className="font-medium">{ACTIVITY_LABELS[activity.activityType] || activity.activityType}{activity.title ? ` — ${activity.title}` : ''}</p><p className="mt-0.5 text-xs text-muted-foreground">{labelDate(activity.occurredOn)} · {activity.activityType === 'call_night' ? `${activity.durationHours} hours` : `${activity.count} ${activity.count === 1 ? 'activity' : 'activities'}`}{activity.relatedAgentName ? ` · ${activity.relatedAgentName}` : ''}{activity.organization ? ` · ${activity.organization}` : ''}{activity.relationshipPurpose ? ` · ${activity.relationshipPurpose === 'retention' ? 'Retention' : 'Recruiting'}` : ''}{activity.notes ? ` · ${activity.notes}` : ''}</p></div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => deleteActivity(activity.id)} aria-label="Remove activity"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-4 text-center text-sm text-muted-foreground">No Director activity has been logged for {year} yet.</p>}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </CardContent>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-indigo-700" />Director Report Card Goals</DialogTitle><DialogDescription>Set monthly company goals. The scorecard automatically prorates them through the selected year-to-date period.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Named Director of Agent Development</Label><Input value={goalForm.directorName} onChange={event => setGoalForm(form => ({ ...form, directorName: event.target.value }))} /><p className="text-xs text-muted-foreground">This report card and score are assigned to this named Director. Staff may document activities, but the score remains Ethan’s responsibility.</p></div>
            {[
              ['teamAppointments', 'Team Appointments / Month'],
              ['callNightHours', 'Call Night Hours / Month'],
              ['recruitingWorkshops', 'Recruiting Workshops / Month'],
              ['buyerSellerWorkshops', 'Buyer & Seller Workshops / Month'],
              ['networkingEvents', 'Qualifying Events / Month (YPN, Mortgage, Builder, RCA)'],
              ['ypnEventsScheduled', 'Scheduled YPN Events / Month'],
              ['newAgentFollowUps', 'New-Agent Follow-Ups / Month'],
            ].map(([key, label]) => <div key={key} className="space-y-1.5"><Label>{label}</Label><Input type="number" min="0" value={(goalForm as any)[key]} onChange={event => setGoalForm(form => ({ ...form, [key]: event.target.value }))} /></div>)}
          </div>
          <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700"><strong>YPN rule:</strong> record the number of scheduled YPN events here. The scorecard then expects the Director to log attendance at every one of them.</div>
          <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Custom KPIs</p><p className="text-xs text-muted-foreground">Add any additional measurable company goals for this role.</p></div><Button variant="outline" size="sm" onClick={addCustomKpi}><Plus className="mr-1 h-3.5 w-3.5" />Add KPI</Button></div>
            {goalForm.customKpis.map((item, index) => <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.3fr_.7fr_.45fr_auto]"><Input placeholder="KPI name" value={item.label} onChange={event => setGoalForm(form => ({ ...form, customKpis: form.customKpis.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) }))} /><Input placeholder="Unit" value={item.unit} onChange={event => setGoalForm(form => ({ ...form, customKpis: form.customKpis.map((entry, i) => i === index ? { ...entry, unit: event.target.value } : entry) }))} /><Input type="number" min="0" placeholder="Monthly goal" value={item.monthlyGoal} onChange={event => setGoalForm(form => ({ ...form, customKpis: form.customKpis.map((entry, i) => i === index ? { ...entry, monthlyGoal: event.target.value } : entry) }))} /><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setGoalForm(form => ({ ...form, customKpis: form.customKpis.filter((_, i) => i !== index) }))}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={saveGoals} disabled={saving}>{saving ? 'Saving...' : <><Save className="mr-1.5 h-4 w-4" />Save Goals</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-indigo-700" />Log Director Activity</DialogTitle><DialogDescription>Log a completed activity so the report card and overall score update immediately.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Activity</Label><Select value={activityForm.activityType} onValueChange={value => setActivityForm(form => ({ ...form, activityType: value, relatedAgentId: '', customKpiId: '' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACTIVITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Date</Label><Input type="date" value={activityForm.occurredOn} onChange={event => setActivityForm(form => ({ ...form, occurredOn: event.target.value }))} /></div></div>
            {activityForm.activityType !== 'in_person_relationship_meeting' && <div className="space-y-1.5"><Label>Title / Event Name</Label><Input placeholder="Optional description" value={activityForm.title} onChange={event => setActivityForm(form => ({ ...form, title: event.target.value }))} /></div>}
            {activityForm.activityType === 'call_night' ? <div className="space-y-1.5"><Label>Completed Hours</Label><Input type="number" min="0" step="0.25" value={activityForm.durationHours} onChange={event => setActivityForm(form => ({ ...form, durationHours: event.target.value }))} /></div> : <div className="space-y-1.5"><Label>Count</Label><Input type="number" min="1" value={activityForm.count} onChange={event => setActivityForm(form => ({ ...form, count: event.target.value }))} /></div>}
            {(activityForm.activityType === 'new_agent_welcome_call' || activityForm.activityType === 'new_agent_follow_up') && <div className="space-y-1.5"><Label>New Agent *</Label><Select value={activityForm.relatedAgentId} onValueChange={value => setActivityForm(form => ({ ...form, relatedAgentId: value }))}><SelectTrigger><SelectValue placeholder="Select new agent" /></SelectTrigger><SelectContent>{newAgents.map((agent: any) => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.name} · started {agent.startDate}</SelectItem>)}</SelectContent></Select></div>}
            {activityForm.activityType === 'in_person_relationship_meeting' && <><div className="space-y-1.5"><Label>Agent or Recruit Met *</Label><Input placeholder="Person's name" value={activityForm.title} onChange={event => setActivityForm(form => ({ ...form, title: event.target.value }))} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Organization / Brokerage</Label><Input placeholder="Brokerage or company" value={activityForm.organization} onChange={event => setActivityForm(form => ({ ...form, organization: event.target.value }))} /></div><div className="space-y-1.5"><Label>Purpose *</Label><Select value={activityForm.relationshipPurpose} onValueChange={value => setActivityForm(form => ({ ...form, relationshipPurpose: value }))}><SelectTrigger><SelectValue placeholder="Choose purpose" /></SelectTrigger><SelectContent><SelectItem value="retention">Retention — Current Keaty Agent</SelectItem><SelectItem value="recruiting">Recruiting — External Agent / Prospect</SelectItem></SelectContent></Select></div></div></>}
            {activityForm.activityType === 'custom' && <div className="space-y-1.5"><Label>Custom KPI *</Label><Select value={activityForm.customKpiId} onValueChange={value => setActivityForm(form => ({ ...form, customKpiId: value }))}><SelectTrigger><SelectValue placeholder="Select custom KPI" /></SelectTrigger><SelectContent>{customKpis.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>}
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Outcome, follow-up, or strategic context" value={activityForm.notes} onChange={event => setActivityForm(form => ({ ...form, notes: event.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setActivityOpen(false)}>Cancel</Button><Button onClick={logActivity} disabled={saving || ((activityForm.activityType === 'new_agent_welcome_call' || activityForm.activityType === 'new_agent_follow_up') && !activityForm.relatedAgentId) || (activityForm.activityType === 'in_person_relationship_meeting' && (!activityForm.title || !activityForm.relationshipPurpose)) || (activityForm.activityType === 'custom' && !activityForm.customKpiId)}>{saving ? 'Saving...' : <><CalendarCheck2 className="mr-1.5 h-4 w-4" />Log Completed Activity</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
