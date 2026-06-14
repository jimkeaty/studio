'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Trophy, Plus, Users, Calendar, Zap, TrendingUp, Phone, MessageSquare,
  CalendarCheck, FileSignature, CheckCircle2, DollarSign, Home, BarChart3,
  Clock, ChevronRight, Trash2, AlertCircle, Swords, Building2, Star,
  Flag, Target, Gift, Wallet, ChevronDown, ChevronUp, Settings2, Brackets,
} from 'lucide-react';
import { useUser } from '@/firebase';

// ── KPI options ─────────────────────────────────────────────────────────────
const KPI_OPTIONS = [
  { value: 'calls', label: 'Calls', icon: Phone, color: 'text-blue-500' },
  { value: 'engagements', label: 'Engagements', icon: MessageSquare, color: 'text-purple-500' },
  { value: 'appointments_set', label: 'Appointments Set', icon: Calendar, color: 'text-indigo-500' },
  { value: 'appointments_held', label: 'Appointments Held', icon: CalendarCheck, color: 'text-violet-500' },
  { value: 'contracts_written', label: 'Contracts Written', icon: FileSignature, color: 'text-orange-500' },
  { value: 'closed_deals', label: 'Closings', icon: CheckCircle2, color: 'text-emerald-500' },
  { value: 'closed_volume', label: 'Closed Volume ($)', icon: DollarSign, color: 'text-green-600' },
  { value: 'total_units', label: 'Total Units', icon: Home, color: 'text-teal-500' },
];

// ── Competition formats ──────────────────────────────────────────────────────
const FORMAT_OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    emoji: '🏆',
    description: 'Simple leaderboard — most KPI wins.',
    color: 'from-blue-500 to-indigo-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
  },
  {
    value: 'golf',
    label: 'Golf Challenge',
    emoji: '⛳',
    description: 'Daily threshold scoring — Eagles, Birdies, Pars, Bogeys.',
    color: 'from-green-500 to-emerald-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
  },
  {
    value: 'nascar',
    label: 'NASCAR Race',
    emoji: '🏎️',
    description: 'Points-based race — earn points for every activity.',
    color: 'from-red-500 to-orange-500',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
  },
  {
    value: 'march_madness',
    label: 'March Madness',
    emoji: '🏀',
    description: 'Bracket tournament — head-to-head elimination rounds.',
    color: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
  },
];

// ── Default threshold rules for Golf ────────────────────────────────────────
const DEFAULT_GOLF_RULES = [
  { min: 0, max: 0, score: 2, label: 'Double Bogey', emoji: '😬' },
  { min: 1, max: 1, score: 1, label: 'Bogey', emoji: '😐' },
  { min: 2, max: 2, score: 0, label: 'Par', emoji: '⛳' },
  { min: 3, max: 3, score: -1, label: 'Birdie', emoji: '🐦' },
  { min: 4, max: null, score: -2, label: 'Eagle', emoji: '🦅' },
];

// ── Default NASCAR point rules ───────────────────────────────────────────────
const DEFAULT_NASCAR_RULES = {
  closedDeal: 40,
  pendingDeal: 15,
  engagementPoint: 1,
  appointmentHeldPoint: 5,
  contractWrittenPoint: 10,
};

// ── Duration presets ─────────────────────────────────────────────────────────
function getDurationDates(preset: string): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  switch (preset) {
    case 'today': return { startDate: fmt(today), endDate: fmt(today) };
    case 'week': {
      const mon = new Date(today);
      mon.setDate(today.getDate() - today.getDay() + 1);
      return { startDate: fmt(mon), endDate: fmt(addDays(mon, 6)) };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { startDate: fmt(start), endDate: fmt(end) };
    }
    default: return { startDate: fmt(today), endDate: fmt(addDays(today, 6)) };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00Z');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function peerStatusBadge(status: string, endDate: string) {
  const now = new Date().toISOString().slice(0, 10);
  if (status === 'completed' || endDate < now)
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Completed</Badge>;
  if (status === 'active')
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">🔴 Live</Badge>;
  if (status === 'draft')
    return <Badge variant="outline" className="text-xs">Draft — Bracket Pending</Badge>;
  return <Badge variant="outline" className="text-xs">Draft</Badge>;
}
function officeStatusBadge(status: string, endDate: string) {
  const now = new Date().toISOString().slice(0, 10);
  if (status === 'archived' || endDate < now)
    return <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">Ended</Badge>;
  if (status === 'active')
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">🔴 Live</Badge>;
  if (status === 'draft')
    return <Badge variant="outline" className="text-xs">Coming Soon</Badge>;
  return <Badge variant="outline" className="text-xs capitalize">{status}</Badge>;
}
function kpiIcon(metric: string) {
  const opt = KPI_OPTIONS.find(k => k.value === metric);
  if (!opt) return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
  const Icon = opt.icon;
  return <Icon className={`h-4 w-4 ${opt.color}`} />;
}
function kpiLabel(metric: string) {
  return KPI_OPTIONS.find(k => k.value === metric)?.label || metric;
}
function formatLabel(format: string) {
  return FORMAT_OPTIONS.find(f => f.value === format)?.label || format;
}
function formatEmoji(format: string) {
  return FORMAT_OPTIONS.find(f => f.value === format)?.emoji || '🏆';
}
function daysLeft(endDate: string): string {
  const now = new Date().toISOString().slice(0, 10);
  if (endDate < now) return 'Ended';
  if (endDate === now) return 'Last day!';
  const diff = Math.round((new Date(endDate + 'T00:00:00Z').getTime() - new Date(now + 'T00:00:00Z').getTime()) / 86400000);
  return `${diff}d left`;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CompetitionsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  // Peer competitions
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [myProfileId, setMyProfileId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Office competitions
  const [officeComps, setOfficeComps] = useState<any[]>([]);
  const [officeLoading, setOfficeLoading] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create form — step 1: basics, step 2: format rules, step 3: prizes
  const [createStep, setCreateStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    metric: '',
    duration: 'week',
    startDate: '',
    endDate: '',
    format: 'standard',
    // Golf rules
    thresholdRules: DEFAULT_GOLF_RULES as any[],
    // NASCAR rules
    pointRules: { ...DEFAULT_NASCAR_RULES },
    // Prize/pot
    prizeDescription: '',
    buyInAmount: 0,
    // Vendor
    vendorName: '',
    vendorType: 'agent' as string,
  });
  const [agentList, setAgentList] = useState<{ id: string; displayName: string }[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

  const fetchCompetitions = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/agent-competitions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setCompetitions(data.competitions || []);
        setMyProfileId(data.agentProfileId || '');
        setMyName(data.agentName || '');
      } else {
        setError(data.error || 'Failed to load competitions');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchOfficeCompetitions = useCallback(async () => {
    if (!user) return;
    try {
      setOfficeLoading(true);
      const token = await user.getIdToken();
      const [activeRes, draftRes] = await Promise.all([
        fetch('/api/competitions?status=active', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/competitions?status=draft', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [activeData, draftData] = await Promise.all([activeRes.json(), draftRes.json()]);
      const all: any[] = [];
      if (activeData.ok) all.push(...(activeData.competitions || []));
      if (draftData.ok) all.push(...(draftData.competitions || []));
      const yearRes = await fetch(`/api/competitions?year=${new Date().getFullYear()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const yearData = await yearRes.json();
      if (yearData.ok) {
        for (const c of (yearData.competitions || [])) {
          if (!all.find((x: any) => x.id === c.id)) all.push(c);
        }
      }
      all.sort((a, b) => {
        const statusOrder: Record<string, number> = { active: 0, draft: 1, completed: 2, archived: 3 };
        const sa = statusOrder[a.config?.status] ?? 4;
        const sb = statusOrder[b.config?.status] ?? 4;
        if (sa !== sb) return sa - sb;
        return (b.config?.startDate || '').localeCompare(a.config?.startDate || '');
      });
      setOfficeComps(all);
    } catch {}
    finally { setOfficeLoading(false); }
  }, [user]);

  const fetchAgents = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent-competitions/agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setAgentList(data.agents || []);
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!userLoading && user) {
      fetchCompetitions();
      fetchOfficeCompetitions();
      fetchAgents();
    }
  }, [user, userLoading, fetchCompetitions, fetchOfficeCompetitions, fetchAgents]);

  useEffect(() => {
    if (form.duration !== 'custom') {
      const { startDate, endDate } = getDurationDates(form.duration);
      setForm(f => ({ ...f, startDate, endDate }));
    }
  }, [form.duration]);

  const openCreate = () => {
    const { startDate, endDate } = getDurationDates('week');
    setForm({
      name: '', metric: '', duration: 'week', startDate, endDate,
      format: 'standard',
      thresholdRules: DEFAULT_GOLF_RULES,
      pointRules: { ...DEFAULT_NASCAR_RULES },
      prizeDescription: '', buyInAmount: 0,
      vendorName: '', vendorType: 'agent',
    });
    setSelectedAgents([]);
    setCreateError(null);
    setCreateStep(1);
    setShowAdvancedRules(false);
    setShowCreate(true);
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!form.name.trim()) { setCreateError('Please enter a competition name.'); return; }
    if (!form.metric) { setCreateError('Please select a KPI to track.'); return; }
    if (selectedAgents.length === 0) { setCreateError('Please invite at least one other agent.'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const body: any = {
        name: form.name.trim(),
        metric: form.metric,
        metricLabel: kpiLabel(form.metric),
        startDate: form.startDate,
        endDate: form.endDate,
        participantIds: selectedAgents,
        format: form.format,
        prizeDescription: form.prizeDescription || null,
        buyInAmount: form.buyInAmount || 0,
      };
      if (form.format === 'golf') {
        body.thresholdRules = form.thresholdRules;
        body.scoringStrategy = 'threshold_map';
        body.rankingDirection = 'asc';
      }
      if (form.format === 'nascar') {
        body.pointRules = form.pointRules;
        body.scoringStrategy = 'points';
        body.rankingDirection = 'desc';
      }
      const res = await fetch('/api/agent-competitions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setShowCreate(false);
        await fetchCompetitions();
        router.push(`/dashboard/competitions/${data.competition.id}`);
      } else {
        setCreateError(data.error || 'Failed to create competition');
      }
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/agent-competitions/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      await fetchCompetitions();
    } catch {}
    setDeleting(false);
  };

  if (userLoading || loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeComps = competitions.filter(c => (c.status === 'active' || c.status === 'draft') && c.endDate >= today);
  const pastComps = competitions.filter(c => c.status === 'completed' || c.endDate < today);
  const activeOffice = officeComps.filter(c => c.config?.status === 'active' && (c.config?.endDate || '') >= today);
  const otherOffice = officeComps.filter(c => c.config?.status !== 'active' || (c.config?.endDate || '') < today);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <Swords className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Competition Center</h1>
            <p className="text-sm text-muted-foreground">Challenge teammates. Pick your format. Win prizes.</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-sm">
          <Plus className="h-4 w-4" />
          New Competition
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Format legend ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FORMAT_OPTIONS.map(f => (
          <div key={f.value} className={`rounded-lg border p-2.5 ${f.bg} ${f.border}`}>
            <div className="text-lg mb-0.5">{f.emoji}</div>
            <div className="text-xs font-semibold">{f.label}</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{f.description}</div>
          </div>
        ))}
      </div>

      {/* ── OFFICE COMPETITIONS ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Office Competitions</h2>
          {activeOffice.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />}
        </div>
        {officeLoading ? (
          <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : officeComps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No office competitions running right now.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Check back soon — your broker will post competitions here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeOffice.length > 0 && (
              <>
                <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  Live Now ({activeOffice.length})
                </p>
                {activeOffice.map(comp => <OfficeCompetitionCard key={comp.id} comp={comp} />)}
              </>
            )}
            {otherOffice.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground mt-2">
                  {activeOffice.length > 0 ? 'Other' : 'All'} Office Competitions ({otherOffice.length})
                </p>
                {otherOffice.map(comp => <OfficeCompetitionCard key={comp.id} comp={comp} />)}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── PEER COMPETITIONS ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My Competitions</h2>
          {activeComps.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />}
        </div>

        {competitions.length === 0 && (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <Swords className="h-10 w-10 text-amber-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold mb-2">No peer competitions yet</h2>
              <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
                Create a Golf Challenge, NASCAR Race, March Madness bracket, or simple leaderboard with your teammates.
              </p>
              <Button onClick={openCreate} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0">
                <Plus className="h-4 w-4" />
                Start a Competition
              </Button>
            </CardContent>
          </Card>
        )}

        {activeComps.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live Now ({activeComps.length})
            </p>
            {activeComps.map(comp => (
              <PeerCompetitionCard key={comp.id} comp={comp} myProfileId={myProfileId} onDelete={() => setDeleteTarget(comp)} />
            ))}
          </div>
        )}

        {pastComps.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Past ({pastComps.length})</p>
            {pastComps.map(comp => (
              <PeerCompetitionCard key={comp.id} comp={comp} myProfileId={myProfileId} onDelete={() => setDeleteTarget(comp)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Create Competition Dialog ─────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-amber-500" />
              Create a Competition
              <span className="ml-auto text-xs text-muted-foreground font-normal">Step {createStep} of 3</span>
            </DialogTitle>
            <DialogDescription>
              {createStep === 1 && 'Choose a format, KPI, and duration.'}
              {createStep === 2 && 'Customize scoring rules for your format.'}
              {createStep === 3 && 'Add prizes, buy-ins, and invite teammates.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step progress */}
          <div className="flex gap-1 mb-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= createStep ? 'bg-amber-500' : 'bg-muted'}`} />
            ))}
          </div>

          {/* ── STEP 1: Basics ─────────────────────────────────────────────── */}
          {createStep === 1 && (
            <div className="space-y-5 py-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="comp-name">Competition Name</Label>
                <Input
                  id="comp-name"
                  placeholder='e.g. "June Golf Challenge" or "Closings Showdown"'
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Format */}
              <div className="space-y-2">
                <Label>Competition Format</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_OPTIONS.map(opt => {
                    const selected = form.format === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, format: opt.value }))}
                        className={[
                          'flex items-start gap-2.5 px-3 py-3 rounded-lg border text-sm font-medium transition-all text-left',
                          selected
                            ? `border-primary bg-primary/5 text-primary ring-1 ring-primary/30`
                            : 'border-border hover:border-primary/40 hover:bg-muted/50',
                        ].join(' ')}
                      >
                        <span className="text-xl shrink-0">{opt.emoji}</span>
                        <div>
                          <div className="font-semibold text-sm">{opt.label}</div>
                          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* KPI */}
              <div className="space-y-1.5">
                <Label>KPI to Track</Label>
                <div className="grid grid-cols-2 gap-2">
                  {KPI_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const selected = form.metric === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, metric: opt.value }))}
                        className={[
                          'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left',
                          selected ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40 hover:bg-muted/50',
                        ].join(' ')}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-primary' : opt.color}`} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={form.duration} onValueChange={v => setForm(f => ({ ...f, duration: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.duration === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>
              )}
              {form.duration !== 'custom' && form.startDate && (
                <p className="text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {fmtDate(form.startDate)} – {fmtDate(form.endDate)}
                </p>
              )}

              {createError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">{createError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ── STEP 2: Scoring Rules ───────────────────────────────────────── */}
          {createStep === 2 && (
            <div className="space-y-5 py-2">
              {form.format === 'standard' && (
                <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-2">
                  <div className="text-3xl">🏆</div>
                  <p className="font-semibold">Standard Leaderboard</p>
                  <p className="text-sm text-muted-foreground">
                    The agent with the highest total <strong>{kpiLabel(form.metric)}</strong> during the competition period wins. No custom rules needed.
                  </p>
                </div>
              )}

              {form.format === 'march_madness' && (
                <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/20 border-orange-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🏀</span>
                    <div>
                      <p className="font-semibold">March Madness Bracket</p>
                      <p className="text-xs text-muted-foreground">Head-to-head elimination tournament</p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1.5">
                    <p>• Agents are randomly seeded into a bracket</p>
                    <p>• Each matchup is scored by <strong>{kpiLabel(form.metric)}</strong> over the competition period</p>
                    <p>• The competition creator advances winners round by round</p>
                    <p>• The last agent standing wins the championship</p>
                    <p className="text-orange-600 font-medium">• The bracket will be initialized after you create the competition</p>
                  </div>
                </div>
              )}

              {form.format === 'golf' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⛳</span>
                    <div>
                      <p className="font-semibold">Golf Threshold Rules</p>
                      <p className="text-xs text-muted-foreground">Set daily score thresholds for your KPI</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {form.thresholdRules.map((rule: any, i: number) => (
                      <div key={i} className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr_auto] gap-2 items-center">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Min</Label>
                          <Input
                            type="number"
                            value={rule.min}
                            onChange={e => {
                              const rules = [...form.thresholdRules];
                              rules[i] = { ...rules[i], min: Number(e.target.value) };
                              setForm(f => ({ ...f, thresholdRules: rules }));
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Max</Label>
                          <Input
                            type="number"
                            value={rule.max ?? ''}
                            placeholder="∞"
                            onChange={e => {
                              const rules = [...form.thresholdRules];
                              rules[i] = { ...rules[i], max: e.target.value === '' ? null : Number(e.target.value) };
                              setForm(f => ({ ...f, thresholdRules: rules }));
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Score</Label>
                          <Input
                            type="number"
                            value={rule.score}
                            onChange={e => {
                              const rules = [...form.thresholdRules];
                              rules[i] = { ...rules[i], score: Number(e.target.value) };
                              setForm(f => ({ ...f, thresholdRules: rules }));
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Label</Label>
                          <Input
                            value={rule.label}
                            onChange={e => {
                              const rules = [...form.thresholdRules];
                              rules[i] = { ...rules[i], label: e.target.value };
                              setForm(f => ({ ...f, thresholdRules: rules }));
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Emoji</Label>
                          <Input
                            value={rule.emoji}
                            onChange={e => {
                              const rules = [...form.thresholdRules];
                              rules[i] = { ...rules[i], emoji: e.target.value };
                              setForm(f => ({ ...f, thresholdRules: rules }));
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, thresholdRules: f.thresholdRules.filter((_: any, j: number) => j !== i) }))}
                          className="mt-4 p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setForm(f => ({
                        ...f,
                        thresholdRules: [...f.thresholdRules, { min: 0, max: null, score: 0, label: 'New Rule', emoji: '⭐' }],
                      }))}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Rule
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                    💡 <strong>Tip:</strong> Lower total score wins in Golf. Par = baseline, Birdie/Eagle = better, Bogey = worse.
                  </p>
                </div>
              )}

              {form.format === 'nascar' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏎️</span>
                    <div>
                      <p className="font-semibold">NASCAR Point Values</p>
                      <p className="text-xs text-muted-foreground">Points earned per activity — highest total wins</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'closedDeal', label: 'Closed Deal', emoji: '🏁' },
                      { key: 'pendingDeal', label: 'Pending Deal', emoji: '⏳' },
                      { key: 'engagementPoint', label: 'Engagement', emoji: '💬' },
                      { key: 'appointmentHeldPoint', label: 'Appt Held', emoji: '📅' },
                      { key: 'contractWrittenPoint', label: 'Contract Written', emoji: '📝' },
                    ].map(({ key, label, emoji }) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{emoji} {label}</Label>
                        <Input
                          type="number"
                          value={(form.pointRules as any)[key]}
                          onChange={e => setForm(f => ({
                            ...f,
                            pointRules: { ...f.pointRules, [key]: Number(e.target.value) },
                          }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                    💡 <strong>Tip:</strong> Highest total points wins. Adjust values to weight the activities that matter most.
                  </p>
                </div>
              )}

              {createError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">{createError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ── STEP 3: Prizes + Invite ─────────────────────────────────────── */}
          {createStep === 3 && (
            <div className="space-y-5 py-2">
              {/* Prize description */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-amber-500" />
                  Prize / Award Description
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  placeholder='e.g. "Winner gets $100 cash + dinner at Ruth&apos;s Chris" or "Yeti Cooler for 1st place"'
                  value={form.prizeDescription}
                  onChange={e => setForm(f => ({ ...f, prizeDescription: e.target.value }))}
                  rows={2}
                  className="text-sm resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Visible to all participants. Brokers, team leaders, and vendors can also add prizes after the competition is created.
                </p>
              </div>

              {/* Buy-in */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-green-500" />
                  Per-Person Buy-In
                  <span className="text-muted-foreground font-normal text-xs">(honor system, $0 = free)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.buyInAmount || ''}
                    placeholder="0"
                    onChange={e => setForm(f => ({ ...f, buyInAmount: Number(e.target.value) || 0 }))}
                    className="max-w-[120px] h-9"
                  />
                  {form.buyInAmount > 0 && selectedAgents.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      = {fmtCurrency(form.buyInAmount * (selectedAgents.length + 1))} total pot
                    </span>
                  )}
                </div>
              </div>

              {/* Invite agents */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Invite Teammates
                </Label>
                {agentList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading agents...</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {agentList.map(agent => {
                      const selected = selectedAgents.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleAgent(agent.id)}
                          className={[
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm transition-all text-left',
                            selected ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:border-primary/30 hover:bg-muted/40',
                          ].join(' ')}
                        >
                          <div className={[
                            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          ].join(' ')}>
                            {agent.displayName.charAt(0).toUpperCase()}
                          </div>
                          {agent.displayName}
                          {selected && <Zap className="h-3.5 w-3.5 ml-auto text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedAgents.length > 0 && (
                  <p className="text-xs text-primary font-medium">
                    {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''} invited
                  </p>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Competition Summary</p>
                <div className="flex items-center gap-2">
                  <span>{formatEmoji(form.format)}</span>
                  <span className="font-medium">{form.name || 'Unnamed'}</span>
                  <Badge variant="outline" className="text-xs">{formatLabel(form.format)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {kpiLabel(form.metric)} · {fmtDate(form.startDate)} – {fmtDate(form.endDate)} · {selectedAgents.length + 1} participants
                </p>
                {form.prizeDescription && (
                  <p className="text-xs text-amber-600 font-medium">🏆 {form.prizeDescription}</p>
                )}
                {form.buyInAmount > 0 && (
                  <p className="text-xs text-green-600 font-medium">💰 ${form.buyInAmount}/person buy-in</p>
                )}
              </div>

              {createError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">{createError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {createStep > 1 && (
              <Button variant="outline" onClick={() => { setCreateStep(s => s - 1); setCreateError(null); }} disabled={creating}>
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            {createStep < 3 ? (
              <Button
                onClick={() => {
                  if (createStep === 1) {
                    if (!form.name.trim()) { setCreateError('Please enter a competition name.'); return; }
                    if (!form.metric) { setCreateError('Please select a KPI to track.'); return; }
                  }
                  setCreateError(null);
                  setCreateStep(s => s + 1);
                }}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
              >
                Next →
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
              >
                {creating ? 'Creating...' : form.format === 'march_madness' ? '🏀 Create Bracket' : '🚀 Start Competition'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ─────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Competition?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Office Competition Card ──────────────────────────────────────────────────
function OfficeCompetitionCard({ comp }: { comp: any }) {
  const cfg = comp.config || {};
  const today = new Date().toISOString().slice(0, 10);
  const isLive = cfg.status === 'active' && (cfg.endDate || '') >= today;
  const metricDisplay = cfg.metricLabel || cfg.metric || '';
  const theme = cfg.theme || 'standard';
  const themeEmoji = theme === 'golf' ? '⛳' : theme === 'nascar' ? '🏎️' : theme === 'horse_race' ? '🐎' : '🏆';

  return (
    <Link href={`/competitions/${comp.id}`} className="block group" target="_blank" rel="noopener noreferrer">
      <Card className={[
        'transition-all hover:shadow-md hover:border-amber-300/50 cursor-pointer',
        isLive ? 'border-amber-200 bg-gradient-to-r from-amber-50/40 to-transparent dark:from-amber-950/20' : 'border-border',
      ].join(' ')}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={[
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl',
                isLive ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-muted',
              ].join(' ')}>
                {themeEmoji}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base truncate">{cfg.name || 'Office Competition'}</h3>
                  {officeStatusBadge(cfg.status || 'draft', cfg.endDate || '')}
                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-900/30">
                    <Star className="h-2.5 w-2.5 mr-1" />Office
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {metricDisplay && <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{metricDisplay}</span>}
                  {cfg.startDate && cfg.endDate && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(cfg.startDate)} – {fmtDate(cfg.endDate)}</span>
                  )}
                  {isLive && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium"><Clock className="h-3 w-3" />{daysLeft(cfg.endDate)}</span>
                  )}
                </div>
                {cfg.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{cfg.description}</p>}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Peer Competition Card ────────────────────────────────────────────────────
function PeerCompetitionCard({
  comp, myProfileId, onDelete,
}: {
  comp: any; myProfileId: string; onDelete: () => void;
}) {
  const isCreator = comp.createdBy === myProfileId;
  const participantCount = comp.participantIds?.length || 0;
  const today = new Date().toISOString().slice(0, 10);
  const isLive = (comp.status === 'active') && comp.endDate >= today;
  const isDraft = comp.status === 'draft';
  const format = comp.format || 'standard';
  const formatOpt = FORMAT_OPTIONS.find(f => f.value === format);
  const hasPrize = comp.prizeDescription || comp.buyInAmount > 0;

  return (
    <Link href={`/dashboard/competitions/${comp.id}`} className="block group">
      <Card className={[
        'transition-all hover:shadow-md hover:border-primary/30 cursor-pointer',
        isLive ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/30 to-transparent dark:from-emerald-950/20' : '',
        isDraft ? 'border-orange-200 bg-gradient-to-r from-orange-50/30 to-transparent dark:from-orange-950/20' : '',
      ].join(' ')}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={[
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl',
                isLive ? 'bg-emerald-100 dark:bg-emerald-900/40' : isDraft ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-muted',
              ].join(' ')}>
                {formatOpt?.emoji || '🏆'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base truncate">{comp.name}</h3>
                  {peerStatusBadge(comp.status, comp.endDate)}
                  {format !== 'standard' && (
                    <Badge variant="outline" className="text-[10px]">{formatOpt?.label}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{kpiLabel(comp.metric)}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{participantCount} agent{participantCount !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(comp.startDate)} – {fmtDate(comp.endDate)}</span>
                  {isLive && <span className="flex items-center gap-1 text-amber-600 font-medium"><Clock className="h-3 w-3" />{daysLeft(comp.endDate)}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {isCreator && <span className="text-xs text-primary font-medium">You created this</span>}
                  {hasPrize && (
                    <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      <Gift className="h-3 w-3" />
                      {comp.prizeDescription ? comp.prizeDescription.slice(0, 40) + (comp.prizeDescription.length > 40 ? '…' : '') : `$${comp.buyInAmount}/person buy-in`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isCreator && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete competition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
