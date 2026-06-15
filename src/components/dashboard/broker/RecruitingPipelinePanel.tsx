'use client';
// RecruitingPipelinePanel — Full Kanban + Table view with activity log, follow-up tracking,
// source analytics, and conversion funnel.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus, Pencil, Trash2, TrendingUp, LayoutGrid, List,
  Clock, Phone, Mail, MessageSquare, CalendarDays, AlertTriangle,
  ChevronRight, Activity, BarChart2, Plus, CheckCircle2, X,
} from 'lucide-react';
import { useUser } from '@/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'prospect',        label: 'Prospect',         color: 'bg-slate-100 text-slate-700',   border: 'border-slate-300',   dot: 'bg-slate-400'   },
  { value: 'engaged',         label: 'Engaged',          color: 'bg-blue-100 text-blue-700',     border: 'border-blue-300',    dot: 'bg-blue-500'    },
  { value: 'interview_set',   label: 'Interview Set',    color: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-300',  dot: 'bg-yellow-500'  },
  { value: 'interview_held',  label: 'Interview Held',   color: 'bg-orange-100 text-orange-700', border: 'border-orange-300',  dot: 'bg-orange-500'  },
  { value: 'offer_extended',  label: 'Offer Extended',   color: 'bg-purple-100 text-purple-700', border: 'border-purple-300',  dot: 'bg-purple-500'  },
  { value: 'offer_accepted',  label: 'Offer Accepted',   color: 'bg-green-100 text-green-700',   border: 'border-green-300',   dot: 'bg-green-500'   },
  { value: 'scheduled_start', label: 'Scheduled Start',  color: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  { value: 'declined',        label: 'Declined',         color: 'bg-red-100 text-red-700',       border: 'border-red-300',     dot: 'bg-red-500'     },
];

const ACTIVE_STATUSES = STATUSES.filter(s => s.value !== 'declined');

const ACTIVITY_TYPES = [
  { value: 'call',    label: 'Call',    icon: Phone },
  { value: 'email',   label: 'Email',   icon: Mail },
  { value: 'text',    label: 'Text',    icon: MessageSquare },
  { value: 'meeting', label: 'Meeting', icon: CalendarDays },
  { value: 'note',    label: 'Note',    icon: Activity },
];

const SOURCES = [
  'Referral', 'LinkedIn', 'Indeed', 'Cold Call', 'Walk-In', 'Career Fair',
  'Social Media', 'Website', 'Agent Referral', 'Other',
];

const EMPTY_FORM = {
  name: '', source: '', recruiter: '', status: 'prospect',
  expectedStartDate: '', phone: '', email: '', currentBrokerage: '', notes: '',
  followUpDate: '', followUpAction: '',
};

type Candidate = {
  id: string;
  name: string;
  source?: string;
  recruiter?: string;
  status: string;
  expectedStartDate?: string;
  phone?: string;
  email?: string;
  currentBrokerage?: string;
  notes?: string;
  followUpDate?: string;
  followUpAction?: string;
  lastContactedAt?: string;
  stageEnteredAt?: string;
  createdAt?: string;
};

type ActivityEntry = {
  id: string;
  candidateId: string;
  type: string;
  summary: string;
  notes?: string;
  authorName?: string;
  followUpDate?: string;
  followUpAction?: string;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function isOverdue(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr + 'T00:00:00') < new Date(new Date().toDateString());
}

function isToday(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return dateStr === new Date().toISOString().split('T')[0];
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s?.color ?? 'bg-gray-100 text-gray-700'}`}>
      {s?.label ?? status}
    </span>
  );
}

function FollowUpBadge({ date }: { date?: string | null }) {
  if (!date) return null;
  const over = isOverdue(date);
  const tod = isToday(date);
  if (!over && !tod) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${over ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
      <AlertTriangle className="h-3 w-3" />
      {over ? 'Overdue' : 'Today'}
    </span>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({
  candidate,
  onEdit,
  onDelete,
  onLogActivity,
  onViewActivity,
}: {
  candidate: Candidate;
  onEdit: (c: Candidate) => void;
  onDelete: (id: string) => void;
  onLogActivity: (c: Candidate) => void;
  onViewActivity: (c: Candidate) => void;
}) {
  const daysInStage = daysSince(candidate.stageEnteredAt);
  const daysSinceContact = daysSince(candidate.lastContactedAt);
  const followUpOver = candidate.followUpDate ? isOverdue(candidate.followUpDate) : false;
  const followUpToday = candidate.followUpDate ? isToday(candidate.followUpDate) : false;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm space-y-2 hover:shadow-md transition-shadow ${followUpOver ? 'border-red-300' : followUpToday ? 'border-amber-300' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{candidate.name}</p>
          {candidate.currentBrokerage && (
            <p className="text-xs text-muted-foreground truncate">{candidate.currentBrokerage}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(candidate)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(candidate.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Contact info */}
      {(candidate.phone || candidate.email) && (
        <div className="space-y-0.5">
          {candidate.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{candidate.phone}</p>}
          {candidate.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{candidate.email}</p>}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {daysInStage !== null && (
          <span className="text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />{daysInStage}d in stage
          </span>
        )}
        {daysSinceContact !== null && (
          <span className={`flex items-center gap-0.5 ${daysSinceContact > 7 ? 'text-red-600' : 'text-muted-foreground'}`}>
            <Phone className="h-3 w-3" />Last: {daysSinceContact}d ago
          </span>
        )}
      </div>

      {/* Follow-up */}
      {candidate.followUpDate && (
        <div className={`rounded px-2 py-1 text-xs flex items-center gap-1 ${followUpOver ? 'bg-red-50 text-red-700' : followUpToday ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {followUpOver ? '⚠️ Overdue: ' : followUpToday ? '📅 Today: ' : 'Follow-up: '}
            {fmtDate(candidate.followUpDate)}
            {candidate.followUpAction && ` — ${candidate.followUpAction}`}
          </span>
        </div>
      )}

      {/* Source */}
      {candidate.source && (
        <p className="text-xs text-muted-foreground">Source: {candidate.source}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-1 pt-1 border-t border-gray-100 dark:border-gray-700">
        <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => onLogActivity(candidate)}>
          <Plus className="h-3 w-3 mr-1" />Log
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => onViewActivity(candidate)}>
          <Activity className="h-3 w-3 mr-1" />History
        </Button>
      </div>
    </div>
  );
}

// ─── Source Analytics ─────────────────────────────────────────────────────────

function SourceAnalytics({ candidates }: { candidates: Candidate[] }) {
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of candidates) {
      const s = c.source || 'Unknown';
      map[s] = (map[s] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [candidates]);

  const total = candidates.length;
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 className="h-4 w-4" />
          Lead Sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sourceCounts.map(([source, count]) => (
          <div key={source} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span>{source}</span>
              <span className="font-medium">{count} ({Math.round(count / total * 100)}%)</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.round(count / total * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Conversion Funnel ────────────────────────────────────────────────────────

function ConversionFunnel({ candidates }: { candidates: Candidate[] }) {
  const funnelStages = STATUSES.filter(s => s.value !== 'declined');
  const total = candidates.length;
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Conversion Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {funnelStages.map((stage, i) => {
          const count = candidates.filter(c => {
            const idx = STATUSES.findIndex(s => s.value === c.status);
            const stageIdx = STATUSES.findIndex(s => s.value === stage.value);
            return idx >= stageIdx && c.status !== 'declined';
          }).length;
          const pct = total > 0 ? Math.round(count / total * 100) : 0;
          return (
            <div key={stage.value} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-muted-foreground truncate">{stage.label}</span>
              <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                <div
                  className={`h-full ${stage.dot.replace('bg-', 'bg-')} opacity-70`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right font-medium">{count}</span>
              {i > 0 && (
                <span className="w-10 text-right text-muted-foreground">{pct}%</span>
              )}
            </div>
          );
        })}
        <div className="pt-1 border-t text-xs text-muted-foreground flex justify-between">
          <span>Declined: {candidates.filter(c => c.status === 'declined').length}</span>
          <span>Total: {total}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RecruitingPipelinePanel() {
  const { user } = useUser();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Activity log dialog
  const [activityCandidate, setActivityCandidate] = useState<Candidate | null>(null);
  const [activityMode, setActivityMode] = useState<'view' | 'log'>('view');
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: 'call', summary: '', notes: '', followUpDate: '', followUpAction: '',
  });
  const [loggingActivity, setLoggingActivity] = useState(false);

  // Analytics panel
  const [showAnalytics, setShowAnalytics] = useState(false);

  const getToken = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/broker/recruiting-pipeline', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { if (user) load(); }, [load, user]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      source: c.source || '',
      recruiter: c.recruiter || '',
      status: c.status || 'prospect',
      expectedStartDate: c.expectedStartDate || '',
      phone: c.phone || '',
      email: c.email || '',
      currentBrokerage: c.currentBrokerage || '',
      notes: c.notes || '',
      followUpDate: c.followUpDate || '',
      followUpAction: c.followUpAction || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (editing) {
        await fetch('/api/broker/recruiting-pipeline', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
      } else {
        await fetch('/api/broker/recruiting-pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/broker/recruiting-pipeline?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleteId(null);
    }
  };

  const handleQuickStatusChange = async (candidateId: string, newStatus: string) => {
    try {
      const token = await getToken();
      await fetch('/api/broker/recruiting-pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: candidateId, status: newStatus }),
      });
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status: newStatus } : c));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const fld = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }));

  // ── Activity Log ──────────────────────────────────────────────────────────

  const openActivityView = async (c: Candidate) => {
    setActivityCandidate(c);
    setActivityMode('view');
    setActivityLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/broker/recruiting-pipeline/activity?candidateId=${c.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch {}
    setActivityLoading(false);
  };

  const openActivityLog = (c: Candidate) => {
    setActivityCandidate(c);
    setActivityMode('log');
    setActivityForm({ type: 'call', summary: '', notes: '', followUpDate: '', followUpAction: '' });
  };

  const handleLogActivity = async () => {
    if (!activityCandidate || !activityForm.summary.trim()) return;
    setLoggingActivity(true);
    try {
      const token = await getToken();
      await fetch('/api/broker/recruiting-pipeline/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidateId: activityCandidate.id, ...activityForm }),
      });
      // Update candidate's follow-up date in local state
      if (activityForm.followUpDate) {
        setCandidates(prev => prev.map(c =>
          c.id === activityCandidate.id
            ? { ...c, followUpDate: activityForm.followUpDate, followUpAction: activityForm.followUpAction, lastContactedAt: new Date().toISOString() }
            : c
        ));
      }
      setActivityCandidate(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoggingActivity(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    for (const s of STATUSES) map[s.value] = [];
    for (const c of candidates) {
      if (map[c.status]) map[c.status].push(c);
      else map['prospect'].push(c);
    }
    return map;
  }, [candidates]);

  const overdueCount = candidates.filter(c => isOverdue(c.followUpDate)).length;
  const todayCount = candidates.filter(c => isToday(c.followUpDate)).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recruiting Pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Track candidates from prospect to scheduled start
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />{overdueCount} Overdue
            </Badge>
          )}
          {todayCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
              <CalendarDays className="h-3 w-3" />{todayCount} Due Today
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowAnalytics(v => !v)}>
            <BarChart2 className="h-4 w-4 mr-1" />
            {showAnalytics ? 'Hide' : 'Analytics'}
          </Button>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-8"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-4 w-4 mr-1" />Kanban
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-8"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4 mr-1" />Table
            </Button>
          </div>
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="h-4 w-4 mr-1" />Add Candidate
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Analytics panels */}
      {showAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SourceAnalytics candidates={candidates} />
          <ConversionFunnel candidates={candidates} />
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-16 text-sm">
            No pipeline candidates yet. Click &quot;Add Candidate&quot; to start tracking recruits.
          </CardContent>
        </Card>
      ) : viewMode === 'kanban' ? (
        /* ── Kanban Board ─────────────────────────────────────────────────── */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {ACTIVE_STATUSES.map(stage => {
              const cards = grouped[stage.value] || [];
              return (
                <div key={stage.value} className="w-56 shrink-0">
                  <div className={`flex items-center justify-between mb-2 px-2 py-1.5 rounded-md ${stage.color}`}>
                    <span className="text-xs font-semibold">{stage.label}</span>
                    <span className="text-xs font-bold bg-white/60 rounded-full px-1.5">{cards.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {cards.map(c => (
                      <KanbanCard
                        key={c.id}
                        candidate={c}
                        onEdit={openEdit}
                        onDelete={id => setDeleteId(id)}
                        onLogActivity={openActivityLog}
                        onViewActivity={openActivityView}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Declined column */}
            {grouped['declined']?.length > 0 && (
              <div className="w-56 shrink-0">
                <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-md bg-red-100 text-red-700">
                  <span className="text-xs font-semibold">Declined</span>
                  <span className="text-xs font-bold bg-white/60 rounded-full px-1.5">{grouped['declined'].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped['declined'].map(c => (
                    <KanbanCard
                      key={c.id}
                      candidate={c}
                      onEdit={openEdit}
                      onDelete={id => setDeleteId(id)}
                      onLogActivity={openActivityLog}
                      onViewActivity={openActivityView}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Table View ───────────────────────────────────────────────────── */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Days in Stage</TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Follow-Up</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Expected Start</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map(c => {
                    const daysInStage = daysSince(c.stageEnteredAt);
                    const daysSinceContact = daysSince(c.lastContactedAt);
                    return (
                      <TableRow key={c.id} className={isOverdue(c.followUpDate) ? 'bg-red-50/30' : isToday(c.followUpDate) ? 'bg-amber-50/30' : ''}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          {c.currentBrokerage && <div className="text-xs text-muted-foreground">{c.currentBrokerage}</div>}
                          {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                          {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                        </TableCell>
                        <TableCell>
                          <Select value={c.status} onValueChange={v => handleQuickStatusChange(c.id, v)}>
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {daysInStage !== null ? (
                            <span className={`text-sm ${daysInStage > 14 ? 'text-amber-600 font-medium' : ''}`}>
                              {daysInStage}d
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {daysSinceContact !== null ? (
                            <span className={`text-sm ${daysSinceContact > 7 ? 'text-red-600 font-medium' : ''}`}>
                              {daysSinceContact}d ago
                            </span>
                          ) : <span className="text-muted-foreground text-xs">Never</span>}
                        </TableCell>
                        <TableCell>
                          {c.followUpDate ? (
                            <div className="space-y-0.5">
                              <FollowUpBadge date={c.followUpDate} />
                              <div className="text-xs text-muted-foreground">{fmtDate(c.followUpDate)}</div>
                              {c.followUpAction && <div className="text-xs text-muted-foreground truncate max-w-[120px]">{c.followUpAction}</div>}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">Not set</span>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{c.source || '—'}</div>
                          {c.recruiter && <div className="text-xs text-muted-foreground">{c.recruiter}</div>}
                        </TableCell>
                        <TableCell>{fmtDate(c.expectedStartDate)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Log Activity" onClick={() => openActivityLog(c)}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View History" onClick={() => openActivityView(c)}>
                              <Activity className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Candidate' : 'Add Pipeline Candidate'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={e => fld('name', e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => fld('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Start Date</Label>
                <Input type="date" value={form.expectedStartDate} onChange={e => fld('expectedStartDate', e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => fld('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => fld('email', e.target.value)} placeholder="jane@example.com" />
              </div>
              <div>
                <Label>Current Brokerage</Label>
                <Input value={form.currentBrokerage} onChange={e => fld('currentBrokerage', e.target.value)} placeholder="Keller Williams" />
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.source} onValueChange={v => fld('source', v)}>
                  <SelectTrigger><SelectValue placeholder="Select source…" /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Recruiter / Assigned To</Label>
                <Input value={form.recruiter} onChange={e => fld('recruiter', e.target.value)} placeholder="Agent or staff name" />
              </div>
              <div>
                <Label>Follow-Up Date</Label>
                <Input type="date" value={form.followUpDate} onChange={e => fld('followUpDate', e.target.value)} />
              </div>
              <div>
                <Label>Follow-Up Action</Label>
                <Input value={form.followUpAction} onChange={e => fld('followUpAction', e.target.value)} placeholder="e.g. Send info packet" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Any relevant notes…" rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Candidate?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove this candidate from the pipeline. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Activity Log Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!activityCandidate} onOpenChange={() => setActivityCandidate(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {activityMode === 'log' ? 'Log Activity' : 'Activity History'}
                {activityCandidate && ` — ${activityCandidate.name}`}
              </DialogTitle>
              <div className="flex gap-1">
                <Button variant={activityMode === 'view' ? 'default' : 'ghost'} size="sm" onClick={() => { setActivityMode('view'); if (activityCandidate) openActivityView(activityCandidate); }}>
                  History
                </Button>
                <Button variant={activityMode === 'log' ? 'default' : 'ghost'} size="sm" onClick={() => setActivityMode('log')}>
                  Log New
                </Button>
              </div>
            </div>
          </DialogHeader>

          {activityMode === 'log' ? (
            <div className="space-y-3 py-2">
              <div>
                <Label>Activity Type</Label>
                <Select value={activityForm.type} onValueChange={v => setActivityForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Summary *</Label>
                <Input
                  value={activityForm.summary}
                  onChange={e => setActivityForm(p => ({ ...p, summary: e.target.value }))}
                  placeholder="e.g. Called, left voicemail"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={activityForm.notes}
                  onChange={e => setActivityForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional details…"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Next Follow-Up Date</Label>
                  <Input type="date" value={activityForm.followUpDate} onChange={e => setActivityForm(p => ({ ...p, followUpDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Next Action</Label>
                  <Input value={activityForm.followUpAction} onChange={e => setActivityForm(p => ({ ...p, followUpAction: e.target.value }))} placeholder="e.g. Schedule interview" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActivityCandidate(null)}>Cancel</Button>
                <Button onClick={handleLogActivity} disabled={loggingActivity || !activityForm.summary.trim()}>
                  {loggingActivity ? 'Saving…' : 'Log Activity'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-2">
              {activityLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : activities.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">No activity logged yet.</div>
              ) : (
                <div className="space-y-3">
                  {activities.map(a => {
                    const atype = ACTIVITY_TYPES.find(t => t.value === a.type);
                    const Icon = atype?.icon || Activity;
                    return (
                      <div key={a.id} className="flex gap-3 text-sm">
                        <div className="mt-0.5 p-1.5 bg-gray-100 rounded-full shrink-0">
                          <Icon className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{a.summary}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{fmtDate(a.createdAt)}</span>
                          </div>
                          {a.notes && <p className="text-muted-foreground text-xs mt-0.5">{a.notes}</p>}
                          {a.followUpDate && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              Next: {fmtDate(a.followUpDate)}{a.followUpAction ? ` — ${a.followUpAction}` : ''}
                            </p>
                          )}
                          {a.authorName && <p className="text-xs text-muted-foreground">by {a.authorName}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
