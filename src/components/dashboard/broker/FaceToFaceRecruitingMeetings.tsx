'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { CalendarDays, Coffee, Plus, Save, Target, UsersRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

const TYPE_LABELS: Record<string, string> = { coffee: 'Coffee', lunch: 'Lunch', drinks: 'Drinks', office_meeting: 'Office Meeting', other: 'Other In-Person Meeting' };
const OUTCOMES = ['Interested', 'Follow-up Needed', 'Not Ready', 'Not Interested', 'Appointment Scheduled'];

export function FaceToFaceRecruitingMeetings({ year }: { year: number }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [form, setForm] = useState({ occurredOn: new Date().toISOString().slice(0, 10), agentOrRecruit: '', recruiterName: 'Ethan', meetingType: 'coffee', organization: '', recruitingStatus: 'Licensed agent / prospect', outcome: 'Follow-up Needed', notes: '', nextFollowUpDate: '', nextFollowUpAction: '', pipelineCandidateId: '' });
  const [defaultGoal, setDefaultGoal] = useState('4');
  const [recruiterGoals, setRecruiterGoals] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/broker/face-to-face-meetings?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load face-to-face meetings');
      setData(result);
      setDefaultGoal(String(result.goalConfig?.defaultWeeklyGoal ?? 4));
      setRecruiterGoals(Object.fromEntries((result.recruiters || []).map((recruiter: any) => [recruiter.key, String(result.goalConfig?.recruiterGoals?.[recruiter.key] ?? '')])));
      if (!form.recruiterName && result.recruiters?.[0]?.name) setForm(current => ({ ...current, recruiterName: result.recruiters[0].name }));
    } catch (cause: any) {
      toast({ title: 'Unable to load meetings', description: cause.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [user, year, toast, form.recruiterName]);

  useEffect(() => { load(); }, [load]);
  const recruiters = data?.recruiters || [];
  const summary = data?.recruiterSummary || [];
  const candidates = data?.candidates || [];
  const meetingCount = data?.meetings?.length || 0;
  const monthlyTotal = useMemo(() => summary.reduce((total: number, recruiter: any) => total + Number(recruiter.monthly || 0), 0), [summary]);

  const saveGoals = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/broker/face-to-face-meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'saveGoals', year, defaultWeeklyGoal: Number(defaultGoal) || 0, recruiterGoals: Object.fromEntries(Object.entries(recruiterGoals).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value) || 0])) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save goals');
      toast({ title: 'Meeting goals saved', description: 'Goal history was preserved with this change.' });
      setGoalsOpen(false); load();
    } catch (cause: any) { toast({ title: 'Unable to save goals', description: cause.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const logMeeting = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/broker/face-to-face-meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'logMeeting', year, ...form, pipelineCandidateId: form.pipelineCandidateId === 'none' ? '' : form.pipelineCandidateId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save meeting');
      toast({ title: 'Face-to-face meeting saved', description: form.pipelineCandidateId && form.nextFollowUpDate ? 'The linked recruit follow-up was added to the existing pipeline history.' : 'Weekly, monthly, and YTD totals have been updated.' });
      setMeetingOpen(false);
      setForm({ occurredOn: new Date().toISOString().slice(0, 10), agentOrRecruit: '', recruiterName: form.recruiterName || 'Ethan', meetingType: 'coffee', organization: '', recruitingStatus: 'Licensed agent / prospect', outcome: 'Follow-up Needed', notes: '', nextFollowUpDate: '', nextFollowUpAction: '', pipelineCandidateId: '' });
      load();
    } catch (cause: any) { toast({ title: 'Unable to save meeting', description: cause.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <Card className="border-2 border-violet-200 bg-gradient-to-b from-violet-50/80 to-background">
      <CardHeader className="border-b border-violet-100"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-xl"><Coffee className="h-5 w-5 text-violet-700" />Face-to-Face Recruiting Meetings</CardTitle><CardDescription className="mt-1">Intentional in-person recruiting conversations with licensed agents and prospects. These records are separate from formal interviews and never change a recruit stage.</CardDescription></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setGoalsOpen(true)}><Target className="mr-1.5 h-3.5 w-3.5" />Goals</Button><Button size="sm" onClick={() => setMeetingOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Log Meeting</Button></div></div></CardHeader>
      <CardContent className="grid gap-3 pt-5 md:grid-cols-3"><div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This month</p><p className="mt-2 text-3xl font-bold">{monthlyTotal}</p><p className="mt-1 text-xs text-muted-foreground">in-person recruiting meetings</p></div><div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year to date</p><p className="mt-2 text-3xl font-bold">{meetingCount}</p><p className="mt-1 text-xs text-muted-foreground">preserved meeting records</p></div><div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default weekly goal</p><p className="mt-2 text-3xl font-bold">{data?.goalConfig?.defaultWeeklyGoal ?? 4}</p><p className="mt-1 text-xs text-muted-foreground">per recruiter; Admin/Broker configurable</p></div></CardContent>
    </Card>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{summary.map((item: any) => <Card key={item.key}><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{item.name}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.attainmentPct == null ? 'bg-slate-100 text-slate-600' : item.attainmentPct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.attainmentPct == null ? 'N/A' : `${item.attainmentPct}%`}</span></div><p className="mt-3 text-2xl font-bold">{item.weekly} <span className="text-sm font-medium text-muted-foreground">/ {item.weeklyGoal}</span></p><p className="text-xs text-muted-foreground">This week · {item.monthly} month · {item.ytd} YTD</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-violet-700" />Meeting History</CardTitle><CardDescription>Every record retains its recruiter, outcome, and optional next follow-up. Changing a goal does not alter historical meeting records.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Agent / Recruit</TableHead><TableHead>Recruiter</TableHead><TableHead>Meeting</TableHead><TableHead>Brokerage</TableHead><TableHead>Status / Outcome</TableHead><TableHead>Next Follow-Up</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading meetings…</TableCell></TableRow> : data?.meetings?.length ? data.meetings.map((meeting: any) => <TableRow key={meeting.id}><TableCell>{meeting.occurredOn || '—'}</TableCell><TableCell className="font-medium">{meeting.agentOrRecruit}</TableCell><TableCell>{meeting.recruiterName}</TableCell><TableCell>{TYPE_LABELS[meeting.meetingType] || meeting.meetingType}</TableCell><TableCell>{meeting.organization || '—'}</TableCell><TableCell><p>{meeting.recruitingStatus || '—'}</p><p className="text-xs text-muted-foreground">{meeting.outcome || '—'}</p></TableCell><TableCell>{meeting.nextFollowUpDate ? <><p>{meeting.nextFollowUpDate}</p><p className="text-xs text-muted-foreground">{meeting.nextFollowUpAction}</p></> : '—'}</TableCell><TableCell className="max-w-[260px] whitespace-normal text-xs text-muted-foreground">{meeting.notes || '—'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No face-to-face recruiting meetings have been logged for {year}.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    <Dialog open={goalsOpen} onOpenChange={setGoalsOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Face-to-Face Meeting Goals</DialogTitle><DialogDescription>Set the standard weekly target and, where needed, a specific recruiter target. Every saved change is retained in the annual recruiting-plan goal history.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-1.5"><Label>Default Meetings per Recruiter per Week</Label><Input type="number" min="0" value={defaultGoal} onChange={event => setDefaultGoal(event.target.value)} /></div><div className="space-y-2"><Label>Recruiter-specific overrides</Label>{recruiters.map((recruiter: any) => <div key={recruiter.key} className="grid grid-cols-[1fr_130px] items-center gap-3 rounded-md border p-3"><span className="text-sm font-medium">{recruiter.name}</span><Input type="number" min="0" placeholder={`Default ${defaultGoal || 4}`} value={recruiterGoals[recruiter.key] || ''} onChange={event => setRecruiterGoals(goals => ({ ...goals, [recruiter.key]: event.target.value }))} /></div>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setGoalsOpen(false)}>Cancel</Button><Button onClick={saveGoals} disabled={saving}>{saving ? 'Saving…' : <><Save className="mr-1.5 h-4 w-4" />Save Goals</>}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Log Face-to-Face Recruiting Meeting</DialogTitle><DialogDescription>Use this for intentional in-person meetings, not formal interviews. A linked pipeline follow-up is added only when you select a candidate and enter the next action.</DialogDescription></DialogHeader><div className="grid gap-3 py-2 sm:grid-cols-2"><div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.occurredOn} onChange={event => setForm(current => ({ ...current, occurredOn: event.target.value }))} /></div><div className="space-y-1.5"><Label>Recruiter *</Label><Select value={form.recruiterName} onValueChange={value => setForm(current => ({ ...current, recruiterName: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{recruiters.map((recruiter: any) => <SelectItem key={recruiter.key} value={recruiter.name}>{recruiter.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Agent / Recruit *</Label><Input value={form.agentOrRecruit} onChange={event => setForm(current => ({ ...current, agentOrRecruit: event.target.value }))} placeholder="Name of person met" /></div><div className="space-y-1.5"><Label>Meeting Type *</Label><Select value={form.meetingType} onValueChange={value => setForm(current => ({ ...current, meetingType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Current Brokerage / Company</Label><Input value={form.organization} onChange={event => setForm(current => ({ ...current, organization: event.target.value }))} /></div><div className="space-y-1.5"><Label>Recruiting Status</Label><Input value={form.recruitingStatus} onChange={event => setForm(current => ({ ...current, recruitingStatus: event.target.value }))} placeholder="Licensed agent, prospect, nurture…" /></div><div className="space-y-1.5"><Label>Outcome *</Label><Select value={form.outcome} onValueChange={value => setForm(current => ({ ...current, outcome: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OUTCOMES.map(outcome => <SelectItem key={outcome} value={outcome}>{outcome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Link Existing Recruit (optional)</Label><Select value={form.pipelineCandidateId || 'none'} onValueChange={value => setForm(current => ({ ...current, pipelineCandidateId: value }))}><SelectTrigger><SelectValue placeholder="No linked recruit" /></SelectTrigger><SelectContent><SelectItem value="none">No linked recruit</SelectItem>{candidates.map((candidate: any) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}{candidate.brokerage ? ` · ${candidate.brokerage}` : ''}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Next Follow-Up Date</Label><Input type="date" value={form.nextFollowUpDate} onChange={event => setForm(current => ({ ...current, nextFollowUpDate: event.target.value }))} /></div><div className="space-y-1.5"><Label>Next Follow-Up Action</Label><Input value={form.nextFollowUpAction} onChange={event => setForm(current => ({ ...current, nextFollowUpAction: event.target.value }))} placeholder="Call, send information, schedule…" /></div><div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={4} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Conversation, objections, interests, and agreed next step" /></div></div><DialogFooter><Button variant="outline" onClick={() => setMeetingOpen(false)}>Cancel</Button><Button onClick={logMeeting} disabled={saving || !form.agentOrRecruit || !form.recruiterName}>{saving ? 'Saving…' : <><CalendarDays className="mr-1.5 h-4 w-4" />Save Meeting</>}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
