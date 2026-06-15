'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, CheckCircle2, XCircle, Plus, Users, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

interface OneOnOne {
  id: string;
  agentId: string;
  agentName: string;
  scheduledDate: string;   // ISO date string YYYY-MM-DD
  scheduledTime?: string;  // HH:MM
  type: 'weekly' | 'monthly' | 'requested' | 'ad_hoc';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  completionNotes?: string;
  requestedBy?: 'agent' | 'dad' | 'broker';
  createdAt: string;
}

interface Agent {
  agentId: string;
  displayName: string;
  isGracePeriod?: boolean;
  daysSinceStart?: number;
}

interface Props {
  agents: Agent[];
  compact?: boolean; // show compact version for To-Do Board
}

const TYPE_LABELS: Record<string, string> = {
  weekly: 'Weekly (Grace Period)',
  monthly: 'Monthly (CGL)',
  requested: 'Agent Requested',
  ad_hoc: 'Ad Hoc',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-300',
  no_show: 'bg-red-100 text-red-800 border-red-300',
};

export function OneOnOneScheduler({ agents, compact = false }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [oneOnOnes, setOneOnOnes] = useState<OneOnOne[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<OneOnOne | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completing, setCompleting] = useState(false);

  // Schedule form state
  const [form, setForm] = useState({
    agentId: '',
    scheduledDate: '',
    scheduledTime: '09:00',
    type: 'weekly' as OneOnOne['type'],
    notes: '',
  });
  const [scheduling, setScheduling] = useState(false);

  const fetchOneOnOnes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/one-on-ones?upcoming=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setOneOnOnes(d.oneOnOnes || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchOneOnOnes(); }, [fetchOneOnOnes]);

  // Auto-suggest type based on agent
  const handleAgentChange = (agentId: string) => {
    const agent = agents.find(a => a.agentId === agentId);
    const suggestedType = agent?.isGracePeriod ? 'weekly' : 'monthly';
    setForm(f => ({ ...f, agentId, type: suggestedType }));
  };

  const handleSchedule = async () => {
    if (!user || !form.agentId || !form.scheduledDate) return;
    setScheduling(true);
    try {
      const token = await user.getIdToken();
      const agentName = agents.find(a => a.agentId === form.agentId)?.displayName || '';
      const res = await fetch('/api/agent/one-on-ones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, agentName }),
      });
      if (!res.ok) throw new Error('Failed to schedule');
      const d = await res.json();
      setOneOnOnes(prev => [d.oneOnOne, ...prev]);
      setScheduleOpen(false);
      setForm({ agentId: '', scheduledDate: '', scheduledTime: '09:00', type: 'weekly', notes: '' });
      toast({ title: '1:1 Scheduled', description: `1:1 with ${agentName} scheduled. They have been notified.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setScheduling(false); }
  };

  const handleComplete = async () => {
    if (!user || !completeTarget) return;
    setCompleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent/one-on-ones?id=${completeTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'completed', completionNotes }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setOneOnOnes(prev => prev.map(o => o.id === completeTarget.id ? { ...o, status: 'completed', completionNotes } : o));
      setCompleteTarget(null);
      setCompletionNotes('');
      toast({ title: '1:1 Completed', description: `1:1 with ${completeTarget.agentName} marked as completed.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setCompleting(false); }
  };

  const handleMarkNoShow = async (oneOnOne: OneOnOne) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/agent/one-on-ones?id=${oneOnOne.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'no_show' }),
      });
      setOneOnOnes(prev => prev.map(o => o.id === oneOnOne.id ? { ...o, status: 'no_show' } : o));
      toast({ title: 'Marked No Show', description: `${oneOnOne.agentName} marked as no-show.` });
    } catch { /* ignore */ }
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = oneOnOnes.filter(o => o.status === 'scheduled' && o.scheduledDate >= today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const overdue = oneOnOnes.filter(o => o.status === 'scheduled' && o.scheduledDate < today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const todayItems = upcoming.filter(o => o.scheduledDate === today);
  const futureItems = upcoming.filter(o => o.scheduledDate > today);
  const recentCompleted = oneOnOnes.filter(o => o.status === 'completed').sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).slice(0, 5);

  const displayItems = showAll ? [...overdue, ...todayItems, ...futureItems] : [...overdue, ...todayItems, ...futureItems.slice(0, 5)];

  if (compact) {
    // Compact view for To-Do Board
    const allPending = [...overdue, ...todayItems];
    if (allPending.length === 0) return null;
    return (
      <div className="space-y-1.5">
        {allPending.map(o => (
          <div key={o.id} className={`flex items-center justify-between p-2 rounded border text-sm ${o.scheduledDate < today ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
            <div>
              <span className="font-medium">{o.agentName}</span>
              <span className="text-muted-foreground ml-2 text-xs">{TYPE_LABELS[o.type]} · {o.scheduledDate < today ? `⚠️ Overdue (${o.scheduledDate})` : 'Today'}</span>
            </div>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setCompleteTarget(o); setCompletionNotes(''); }}>
              <CheckCircle2 className="h-3 w-3 mr-1" />Done
            </Button>
          </div>
        ))}
        {/* Complete dialog */}
        <Dialog open={!!completeTarget} onOpenChange={open => { if (!open) { setCompleteTarget(null); setCompletionNotes(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Complete 1:1 — {completeTarget?.agentName}</DialogTitle>
              <DialogDescription>Add any notes from this meeting.</DialogDescription>
            </DialogHeader>
            <Textarea placeholder="Meeting notes, action items, next steps..." value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} rows={4} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCompleteTarget(null); setCompletionNotes(''); }}>Cancel</Button>
              <Button onClick={handleComplete} disabled={completing}>{completing ? 'Saving...' : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Mark Complete</>}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-base">One-on-One Meetings</CardTitle>
            {overdue.length > 0 && (
              <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">
                {overdue.length} Overdue
              </Badge>
            )}
            {todayItems.length > 0 && (
              <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-xs">
                {todayItems.length} Today
              </Badge>
            )}
          </div>
          <Button size="sm" onClick={() => setScheduleOpen(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Schedule 1:1
          </Button>
        </div>
        <CardDescription className="text-xs">
          Weekly for grace-period agents · Monthly for CGL agents. Agents are notified when a 1:1 is scheduled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}

        {!loading && displayItems.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No upcoming 1:1s scheduled.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setScheduleOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Schedule First 1:1
            </Button>
          </div>
        )}

        {/* Overdue */}
        {overdue.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />Overdue ({overdue.length})</p>
            {overdue.map(o => (
              <OneOnOneRow key={o.id} item={o} onComplete={() => { setCompleteTarget(o); setCompletionNotes(''); }} onNoShow={() => handleMarkNoShow(o)} isOverdue />
            ))}
          </div>
        )}

        {/* Today */}
        {todayItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-blue-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Today ({todayItems.length})</p>
            {todayItems.map(o => (
              <OneOnOneRow key={o.id} item={o} onComplete={() => { setCompleteTarget(o); setCompletionNotes(''); }} onNoShow={() => handleMarkNoShow(o)} />
            ))}
          </div>
        )}

        {/* Upcoming */}
        {futureItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Upcoming</p>
            {(showAll ? futureItems : futureItems.slice(0, 5)).map(o => (
              <OneOnOneRow key={o.id} item={o} onComplete={() => { setCompleteTarget(o); setCompletionNotes(''); }} onNoShow={() => handleMarkNoShow(o)} />
            ))}
            {futureItems.length > 5 && (
              <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setShowAll(s => !s)}>
                {showAll ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show Less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show All {futureItems.length} Upcoming</>}
              </Button>
            )}
          </div>
        )}

        {/* Recent Completed */}
        {recentCompleted.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            <p className="text-xs font-semibold text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Recently Completed</p>
            {recentCompleted.map(o => (
              <div key={o.id} className="flex items-center justify-between p-2 rounded border bg-green-50/30 border-green-200 text-xs">
                <div>
                  <span className="font-medium">{o.agentName}</span>
                  <span className="text-muted-foreground ml-2">{TYPE_LABELS[o.type]} · {o.scheduledDate}</span>
                </div>
                <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Completed</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-purple-600" />Schedule 1:1 Meeting</DialogTitle>
            <DialogDescription>The agent will receive an in-app notification when scheduled.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <Select value={form.agentId} onValueChange={handleAgentChange}>
                <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.agentId} value={a.agentId}>
                      {a.displayName}{a.isGracePeriod ? ' 🟡 Grace' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} min={today} />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as OneOnOne['type'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agenda / Notes (optional)</Label>
              <Textarea placeholder="Topics to cover, prep items for the agent..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={scheduling || !form.agentId || !form.scheduledDate} className="bg-purple-600 hover:bg-purple-700 text-white">
              {scheduling ? 'Scheduling...' : <><Calendar className="h-4 w-4 mr-1.5" />Schedule & Notify Agent</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={!!completeTarget} onOpenChange={open => { if (!open) { setCompleteTarget(null); setCompletionNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Complete 1:1 — {completeTarget?.agentName}</DialogTitle>
            <DialogDescription>Add meeting notes and action items. These are saved to the agent's coaching record.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Meeting notes, action items, commitments made, next steps..." value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} rows={5} className="text-sm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCompleteTarget(null); setCompletionNotes(''); }}>Cancel</Button>
            <Button onClick={handleComplete} disabled={completing} className="bg-green-600 hover:bg-green-700 text-white">
              {completing ? 'Saving...' : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Mark Complete</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function OneOnOneRow({ item, onComplete, onNoShow, isOverdue }: { item: OneOnOne; onComplete: () => void; onNoShow: () => void; isOverdue?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-2.5 rounded border text-sm ${isOverdue ? 'bg-red-50/50 border-red-200' : 'bg-muted/20 border-border'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{item.agentName}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[item.status]}`}>{item.status}</span>
          <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[item.type]}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{item.scheduledDate}{item.scheduledTime ? ` at ${item.scheduledTime}` : ''}</span>
          {isOverdue && <span className="text-red-600 font-medium">⚠️ Overdue</span>}
          {item.notes && <span className="truncate max-w-[200px]">· {item.notes}</span>}
        </div>
      </div>
      {item.status === 'scheduled' && (
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50" onClick={onComplete}>
            <CheckCircle2 className="h-3 w-3 mr-1" />Done
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={onNoShow} title="Mark No Show">
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
