'use client';
// RecruiterTodoBoard — Shows overdue and today's follow-ups (recruiting pipeline)
// and one-on-one meetings (agent development) at the top of the Recruiting & Dev page.
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle, CalendarDays, Phone, Users, CheckCircle2,
  ChevronDown, ChevronUp, Plus, Clock,
} from 'lucide-react';
import { useUser } from '@/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

type FollowUpItem = {
  id: string;
  candidateName: string;
  phone?: string;
  email?: string;
  followUpDate: string;
  followUpAction?: string;
  status: string;
  recruiter?: string;
  isOverdue: boolean;
};

type OneOnOneItem = {
  id: string;
  agentName: string;
  agentId: string;
  scheduledDate: string;
  scheduledTime?: string;
  type: 'weekly_90day' | 'monthly_cgl' | 'adhoc';
  notes?: string;
  isOverdue: boolean;
  isToday: boolean;
  completed: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isOverdue(dateStr: string) {
  return dateStr < todayStr();
}

function isToday(dateStr: string) {
  return dateStr === todayStr();
}

function fmtDate(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecruiterTodoBoard() {
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [oneOnOnes, setOneOnOnes] = useState<OneOnOneItem[]>([]);
  const [loading, setLoading] = useState(true);

  // One-on-one scheduling dialog
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    agentId: '', agentName: '', scheduledDate: todayStr(), scheduledTime: '10:00',
    type: 'adhoc' as 'weekly_90day' | 'monthly_cgl' | 'adhoc',
    notes: '',
  });
  const [agentList, setAgentList] = useState<{ id: string; name: string }[]>([]);
  const [scheduling, setScheduling] = useState(false);

  const getToken = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();

      // Load recruiting pipeline follow-ups (overdue + today)
      const pipelineRes = await fetch('/api/broker/recruiting-pipeline', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        const today = todayStr();
        const items: FollowUpItem[] = (data.candidates || [])
          .filter((c: any) => c.followUpDate && (c.followUpDate <= today))
          .map((c: any) => ({
            id: c.id,
            candidateName: c.name,
            phone: c.phone,
            email: c.email,
            followUpDate: c.followUpDate,
            followUpAction: c.followUpAction,
            status: c.status,
            recruiter: c.recruiter,
            isOverdue: isOverdue(c.followUpDate),
          }))
          .sort((a: FollowUpItem, b: FollowUpItem) => a.followUpDate.localeCompare(b.followUpDate));
        setFollowUps(items);
      }

      // Load one-on-ones (overdue + today)
      const oooRes = await fetch(`/api/agent/one-on-ones?scope=admin&dueOnly=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (oooRes.ok) {
        const data = await oooRes.json();
        const today = todayStr();
        const items: OneOnOneItem[] = (data.oneOnOnes || [])
          .filter((o: any) => !o.completed && o.scheduledDate <= today)
          .map((o: any) => ({
            id: o.id,
            agentName: o.agentName || 'Agent',
            agentId: o.agentId,
            scheduledDate: o.scheduledDate,
            scheduledTime: o.scheduledTime,
            type: o.type || 'adhoc',
            notes: o.notes,
            isOverdue: isOverdue(o.scheduledDate),
            isToday: isToday(o.scheduledDate),
            completed: o.completed || false,
          }))
          .sort((a: OneOnOneItem, b: OneOnOneItem) => a.scheduledDate.localeCompare(b.scheduledDate));
        setOneOnOnes(items);
      }

      // Load agent list for scheduling
      const agentRes = await fetch('/api/broker/agent-roster-metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgentList((data.rows || []).map((r: any) => ({ id: r.agentId, name: r.agentName })));
      }
    } catch (e) {
      console.error('RecruiterTodoBoard load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useEffect(() => { load(); }, [load]);

  const handleCompleteOneOnOne = async (id: string) => {
    try {
      const token = await getToken();
      await fetch('/api/agent/one-on-ones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, completed: true }),
      });
      setOneOnOnes(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleScheduleOneOnOne = async () => {
    if (!scheduleForm.agentId || !scheduleForm.scheduledDate) return;
    setScheduling(true);
    try {
      const token = await getToken();
      await fetch('/api/agent/one-on-ones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(scheduleForm),
      });
      setScheduleOpen(false);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setScheduling(false);
    }
  };

  const totalCount = followUps.length + oneOnOnes.length;
  const overdueCount = followUps.filter(f => f.isOverdue).length + oneOnOnes.filter(o => o.isOverdue).length;

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (totalCount === 0 && !loading) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">All caught up! No overdue follow-ups or 1:1s today.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Schedule 1:1
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={`border-2 ${overdueCount > 0 ? 'border-red-300 bg-red-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                {overdueCount > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : (
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                )}
                Recruiter &amp; DAD To-Do Board
              </CardTitle>
              {overdueCount > 0 && (
                <Badge variant="destructive" className="text-xs">{overdueCount} Overdue</Badge>
              )}
              {(totalCount - overdueCount) > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">{totalCount - overdueCount} Due Today</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setScheduleOpen(true)}>
                <Plus className="h-3 w-3 mr-1" />Schedule 1:1
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCollapsed(v => !v)}>
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="px-4 pb-3 space-y-3">
            {/* ── Recruiting Follow-Ups ──────────────────────────────────── */}
            {followUps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Phone className="h-3 w-3" />Recruiting Follow-Ups ({followUps.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {followUps.map(item => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-2.5 text-sm ${item.isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.candidateName}</p>
                          {item.phone && <p className="text-xs text-muted-foreground">{item.phone}</p>}
                        </div>
                        <span className={`text-xs shrink-0 font-medium ${item.isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                          {item.isOverdue ? `⚠️ ${fmtDate(item.followUpDate)}` : '📅 Today'}
                        </span>
                      </div>
                      {item.followUpAction && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">→ {item.followUpAction}</p>
                      )}
                      {item.recruiter && (
                        <p className="text-xs text-muted-foreground">Recruiter: {item.recruiter}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── One-on-Ones ───────────────────────────────────────────── */}
            {oneOnOnes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" />Agent One-on-Ones ({oneOnOnes.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {oneOnOnes.map(item => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-2.5 text-sm ${item.isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.agentName}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {item.type === 'weekly_90day' ? 'Weekly (90-Day)' : item.type === 'monthly_cgl' ? 'Monthly (CGL)' : 'Ad Hoc'}
                          </p>
                        </div>
                        <span className={`text-xs shrink-0 font-medium ${item.isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                          {item.isOverdue ? `⚠️ ${fmtDate(item.scheduledDate)}` : '📅 Today'}
                          {item.scheduledTime && ` ${item.scheduledTime}`}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{item.notes}</p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs mt-1.5 text-green-700 hover:text-green-800 hover:bg-green-100 p-1"
                        onClick={() => handleCompleteOneOnOne(item.id)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />Mark Complete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Schedule 1:1 Dialog ─────────────────────────────────────────────── */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />Schedule One-on-One
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Agent *</Label>
              <Select
                value={scheduleForm.agentId}
                onValueChange={v => {
                  const agent = agentList.find(a => a.id === v);
                  setScheduleForm(p => ({ ...p, agentId: v, agentName: agent?.name || '' }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select agent…" /></SelectTrigger>
                <SelectContent>
                  {agentList.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={scheduleForm.scheduledDate}
                  onChange={e => setScheduleForm(p => ({ ...p, scheduledDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={scheduleForm.scheduledTime}
                  onChange={e => setScheduleForm(p => ({ ...p, scheduledTime: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={scheduleForm.type}
                onValueChange={v => setScheduleForm(p => ({ ...p, type: v as typeof scheduleForm.type }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly_90day">Weekly — New Agent (90-Day)</SelectItem>
                  <SelectItem value="monthly_cgl">Monthly — CGL Agent</SelectItem>
                  <SelectItem value="adhoc">Ad Hoc / Special</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes / Agenda</Label>
              <Textarea
                value={scheduleForm.notes}
                onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Topics to cover, goals to review…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              onClick={handleScheduleOneOnOne}
              disabled={scheduling || !scheduleForm.agentId || !scheduleForm.scheduledDate}
            >
              {scheduling ? 'Scheduling…' : 'Schedule & Notify Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
