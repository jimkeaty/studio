
'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Save, Trash2, Loader2, ChevronLeft, ChevronRight, Phone, Users, Calendar, FileText, Flame, Upload } from 'lucide-react';
import { BulkAppointmentImport } from '@/components/dashboard/log-activities/BulkAppointmentImport';
import { BulkTrackerImport } from '@/components/dashboard/log-activities/BulkTrackerImport';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TrackerPageSkeleton } from '@/components/ui/page-skeleton';

type DailyActivity = {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
  notes?: string;
  startTime?: string;
  endTime?: string;
};

type RangeDay = {
  date: string;
  dailyActivity: DailyActivity;
};

type Appointment = {
  id: string;
  date: string;
  time?: string;
  contactName: string;
  notes?: string;
  category: 'buyer' | 'seller';
  status?: 'scheduled' | 'held' | 'canceled' | 'no_show';
  createdAt?: string;
  updatedAt?: string;
};

type DraftAppointment = Omit<Appointment, 'id'> & { id: string; };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseActivity(raw: any): DailyActivity {
  const src = raw || {};
  return {
    callsCount: Number(src.callsCount ?? 0),
    engagementsCount: Number(src.engagementsCount ?? 0),
    appointmentsSetCount: Number(src.appointmentsSetCount ?? 0),
    appointmentsHeldCount: Number(src.appointmentsHeldCount ?? 0),
    contractsWrittenCount: Number(src.contractsWrittenCount ?? 0),
    notes: src.notes ?? '',
    startTime: src.startTime ?? '',
    endTime: src.endTime ?? '',
  };
}

function calcHours(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round(mins / 6) / 10;
}

function isSameMonth(a: string, year: number, monthIndex: number): boolean {
  return a?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}-`);
}

function activityScore(a: DailyActivity): number {
  return (a.callsCount || 0) + (a.engagementsCount || 0) + (a.appointmentsSetCount || 0) + (a.appointmentsHeldCount || 0) + (a.contractsWrittenCount || 0);
}

function heatColor(score: number): string {
  if (score === 0) return 'bg-muted/40 text-muted-foreground';
  if (score <= 3) return 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';
  if (score <= 8) return 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300';
  if (score <= 15) return 'bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200';
  return 'bg-emerald-400 dark:bg-emerald-700 text-white font-bold';
}

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();
  const { effectiveUid, isImpersonating } = useEffectiveUser();
  const { toast } = useToast();

  const today = ymd(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activity, setActivity] = useState<DailyActivity>(() => parseActivity(null));
  const [monthYear, setMonthYear] = useState<{ year: number; monthIndex: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  });
  const [rangeDays, setRangeDays] = useState<RangeDay[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);

  // Map of date string -> appointment count for calendar dots
  const apptCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of appointments) {
      if (a.date) m[a.date] = (m[a.date] ?? 0) + 1;
    }
    return m;
  }, [appointments]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApptModal, setShowApptModal] = useState(false);
  const [apptDraftRows, setApptDraftRows] = useState<DraftAppointment[]>([]);
  const [isSavingAppointments, setIsSavingAppointments] = useState(false);

  const monthStartEnd = useMemo(() => {
    const start = new Date(monthYear.year, monthYear.monthIndex, 1);
    const end = new Date(monthYear.year, monthYear.monthIndex + 1, 0);
    return { start: ymd(start), end: ymd(end) };
  }, [monthYear]);

  const activityMap = useMemo(() => {
    const m: Record<string, DailyActivity> = {};
    for (const d of rangeDays) m[d.date] = d.dailyActivity;
    return m;
  }, [rangeDays]);

  async function authedFetch(url: string, init?: RequestInit) {
    if (!user) throw new Error('Not signed in');
    const token = await user.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` }, cache: 'no-store' });
  }

  const loadAppts = async () => {
    if (!user) return;
    setApptLoading(true);
    try {
      const viewAsParam = isImpersonating && effectiveUid ? `&viewAs=${effectiveUid}` : '';
      const res = await authedFetch(`/api/appointments?year=${monthYear.year}&month=${monthYear.monthIndex + 1}${viewAsParam}`);
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to load appointments (${res.status})`);
      const arr = (json.appointments || []) as any[];
      const normalized: Appointment[] = arr.map((a: any) => ({
        id: String(a.id || ''), date: String(a.date || ''), time: a.time ? String(a.time) : undefined,
        contactName: String(a.contactName || 'Appointment'), notes: a.notes ? String(a.notes) : undefined,
        category: a.category || 'buyer', status: a.status ? a.status : undefined,
        createdAt: a.createdAt ? String(a.createdAt) : undefined, updatedAt: a.updatedAt ? String(a.updatedAt) : undefined,
      })).filter((a) => a.id);
      normalized.sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`));
      setAppointments(normalized);
    } catch (e: any) {
      setError(e?.message || 'Failed to load appointments');
      setAppointments([]);
    } finally {
      setApptLoading(false);
    }
  };

  useEffect(() => {
    const loadDay = async () => {
      if (!user) return;
      setError(null);
      try {
        const viewAsParam = isImpersonating && effectiveUid ? `&viewAs=${effectiveUid}` : '';
        const res = await authedFetch(`/api/daily-activity?date=${selectedDate}${viewAsParam}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to load daily activity (${res.status})`);
        setActivity(parseActivity(json.dailyActivity));
      } catch (e: any) {
        setError(e?.message || 'Failed to load daily activity');
        setActivity(parseActivity(null));
      }
    };
    if (!userLoading && user) loadDay();
  }, [user, userLoading, selectedDate]);

  useEffect(() => {
    const loadRange = async () => {
      if (!user) return;
      setRangeLoading(true);
      setError(null);
      try {
        const { start, end } = monthStartEnd;
        const viewAsParam = isImpersonating && effectiveUid ? `&viewAs=${effectiveUid}` : '';
        const res = await authedFetch(`/api/daily-activity/range?start=${start}&end=${end}${viewAsParam}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to load monthly log (${res.status})`);
        const normalized: RangeDay[] = Object.entries(json.activities || {}).map(([date, activityData]) => ({
          date, dailyActivity: parseActivity(activityData),
        })).filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));
        setRangeDays(normalized);
      } catch (e: any) {
        setError(e?.message || 'Failed to load monthly activity log');
        setRangeDays([]);
      } finally {
        setRangeLoading(false);
      }
    };
    if (!userLoading && user) { loadRange(); loadAppts(); }
  }, [user, userLoading, monthYear]);

  async function saveDailyActivity() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/daily-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, dailyActivity: activity, ...(isImpersonating && effectiveUid ? { viewAs: effectiveUid } : {}) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403 && json.code === 'edit_window_expired') {
          toast({ variant: 'destructive', title: 'Edit Locked', description: 'Edits are locked after 45 days.' });
        } else {
          throw new Error(json?.error || `Save failed (${res.status})`);
        }
        return;
      }
      toast({ title: 'Saved! ✓', description: `Activity for ${selectedDate} has been logged.` });
      // Refresh range
      const { start, end } = monthStartEnd;
      const viewAsParam2 = isImpersonating && effectiveUid ? `&viewAs=${effectiveUid}` : '';
      const rangeRes = await authedFetch(`/api/daily-activity/range?start=${start}&end=${end}${viewAsParam2}`);
      const rangeJson = await rangeRes.json();
      const normalized: RangeDay[] = Object.entries(rangeJson.activities || {}).map(([date, activityData]) => ({
        date, dailyActivity: parseActivity(activityData),
      })).filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));
      setRangeDays(normalized);
      // Prompt for appointment entry if new appointments were set
      const prevApptCount = activityMap[selectedDate]?.appointmentsSetCount ?? 0;
      const newApptCount = activity.appointmentsSetCount;
      if (newApptCount > prevApptCount) {
        const diff = newApptCount - prevApptCount;
        const newDrafts: DraftAppointment[] = Array.from({ length: diff }, (_, i) => ({
          id: `draft_${Date.now()}_${i}`, date: selectedDate, contactName: '', category: 'buyer', status: 'scheduled', time: '', notes: '',
        }));
        setApptDraftRows(newDrafts);
        setShowApptModal(true);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save daily activity');
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSaving(false);
    }
  }

  const handleDraftChange = (index: number, field: keyof DraftAppointment, value: string) => {
    setApptDraftRows(currentDrafts => {
      const newDrafts = [...currentDrafts];
      const draftToUpdate = { ...newDrafts[index] };
      (draftToUpdate as any)[field] = value;
      newDrafts[index] = draftToUpdate;
      return newDrafts;
    });
  };

  async function handleSaveAppointments() {
    if (!user || apptDraftRows.length === 0) return;
    const validDrafts = apptDraftRows.filter(draft => draft.contactName.trim() !== '');
    if (validDrafts.length !== apptDraftRows.length) {
      toast({ variant: 'destructive', title: 'Missing Name', description: 'Please provide a name/title for each appointment.' });
      return;
    }
    setIsSavingAppointments(true);
    setError(null);
    const savePromises = validDrafts.map(draft => {
      const payload = {
        date: draft.date, contactName: draft.contactName, category: draft.category, status: draft.status,
        notes: draft.notes || null,
        scheduledAt: draft.time ? new Date(`${draft.date}T${draft.time}`).toISOString() : new Date(`${draft.date}T00:00:00`).toISOString(),
        ...(isImpersonating && effectiveUid ? { viewAs: effectiveUid } : {}),
      };
      return authedFetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(res => res.json().then(json => { if (!res.ok) throw new Error(json.error || 'Failed to save'); return json; }));
    });
    try {
      await Promise.all(savePromises);
      toast({ title: 'Appointments Saved!', description: `${validDrafts.length} new appointments were successfully logged.` });
      setShowApptModal(false);
      setApptDraftRows([]);
      loadAppts();
    } catch (err: any) {
      setError(err.message || 'One or more appointments failed to save.');
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message || 'Could not save all appointments.' });
    } finally {
      setIsSavingAppointments(false);
    }
  }

  async function addAppointment() {
    const tempId = `temp-${Date.now()}`;
    setAppointments((prev) => [...prev, { id: tempId, date: selectedDate, time: '', contactName: '', notes: '', category: 'buyer', status: 'scheduled' }]);
  }

  async function persistAppointment(appt: Appointment) {
    if (!user) return;
    setError(null);
    const isTemp = appt.id.startsWith('temp-');
    try {
      const res = await authedFetch(`/api/appointments${isTemp ? '' : `/${appt.id}`}`, {
        method: isTemp ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: appt.date, contactName: appt.contactName, category: appt.category, status: appt.status || 'scheduled',
          notes: appt.notes || null, scheduledAt: appt.time ? new Date(`${appt.date}T${appt.time}`).toISOString() : null,
          ...(isImpersonating && effectiveUid ? { viewAs: effectiveUid } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Appointment save failed (${res.status})`);
      loadAppts();
    } catch (e: any) {
      setError(e?.message || 'Failed to save appointment');
      toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
    }
  }

  async function deleteAppointment(id: string) {
    if (!user) return;
    setError(null);
    if (id.startsWith('temp-')) { setAppointments((prev) => prev.filter((a) => a.id !== id)); return; }
    try {
      const res = await authedFetch(`/api/appointments/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Delete failed (${res.status})`);
      toast({ title: 'Deleted', description: 'Appointment log removed.' });
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete appointment');
      toast({ variant: 'destructive', title: 'Delete Failed', description: e.message });
    }
  }

  if (userLoading) return <TrackerPageSkeleton />;

  if (!user) return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Not Signed In</AlertTitle>
      <AlertDescription>Please sign in to use the Daily Tracker.</AlertDescription>
    </Alert>
  );

  const monthLabel = new Date(monthYear.year, monthYear.monthIndex, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const firstDay = new Date(monthYear.year, monthYear.monthIndex, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(monthYear.year, monthYear.monthIndex + 1, 0).getDate();
  const calendarCells: (string | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${monthYear.year}-${String(monthYear.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  // Monthly totals
  const monthTotals = rangeDays.reduce((acc, d) => {
    const a = d.dailyActivity;
    acc.calls += a.callsCount || 0;
    acc.engagements += a.engagementsCount || 0;
    acc.apptSet += a.appointmentsSetCount || 0;
    acc.apptHeld += a.appointmentsHeldCount || 0;
    acc.contracts += a.contractsWrittenCount || 0;
    acc.daysLogged++;
    return acc;
  }, { calls: 0, engagements: 0, apptSet: 0, apptHeld: 0, contracts: 0, daysLogged: 0 });

  const selectedActivity = activityMap[selectedDate] || activity;
  const selectedScore = activityScore(selectedActivity);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Tracker</h1>
          <p className="text-muted-foreground">Track calls, appointments, and daily activity. Click any day to view or edit.</p>
        </div>
        <Button onClick={() => { setSelectedDate(today); setMonthYear({ year: new Date().getFullYear(), monthIndex: new Date().getMonth() }); }}>
          Today
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Appointment Entry Modal */}
      <Dialog open={showApptModal} onOpenChange={setShowApptModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log New Appointments</DialogTitle>
            <DialogDescription>Your daily log shows you set {apptDraftRows.length} new appointment(s). Add the details below.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-1 space-y-4">
            {apptDraftRows.map((draft, index) => (
              <Card key={draft.id}>
                <CardContent className="p-4 space-y-3">
                  <Input placeholder="Contact Name / Title" value={draft.contactName} onChange={(e) => handleDraftChange(index, 'contactName', e.target.value)} />
                  <div className="grid grid-cols-3 gap-3">
                    <Select value={draft.category} onValueChange={(val: 'buyer' | 'seller') => handleDraftChange(index, 'category', val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem></SelectContent>
                    </Select>
                    <Input type="date" value={draft.date} onChange={(e) => handleDraftChange(index, 'date', e.target.value)} />
                    <Input type="time" value={draft.time} onChange={(e) => handleDraftChange(index, 'time', e.target.value)} />
                  </div>
                  <Textarea placeholder="Optional notes..." value={draft.notes} onChange={(e) => handleDraftChange(index, 'notes', e.target.value)} />
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApptModal(false)}>Skip for Now</Button>
            <Button onClick={handleSaveAppointments} disabled={isSavingAppointments}>
              {isSavingAppointments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Appointments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="calendar">
        <TabsList className="grid grid-cols-4 w-full md:w-[680px]">
          <TabsTrigger value="calendar"><CalendarLeft className="h-4 w-4 mr-2" />Calendar</TabsTrigger>
          <TabsTrigger value="today"><ClipboardList className="h-4 w-4 mr-2" />Daily Entry</TabsTrigger>
          <TabsTrigger value="appts"><CheckCircle2 className="h-4 w-4 mr-2" />Appointments</TabsTrigger>
          <TabsTrigger value="bulk"><Upload className="h-4 w-4 mr-2" />Bulk Import</TabsTrigger>
        </TabsList>

        {/* ── CALENDAR HEAT-MAP TAB ─────────────────────────────────────────── */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{monthLabel}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="outline" size="icon" onClick={() => setMonthYear(m => { const p = new Date(m.year, m.monthIndex - 1, 1); return { year: p.getFullYear(), monthIndex: p.getMonth() }; })}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setMonthYear(m => { const n = new Date(m.year, m.monthIndex + 1, 1); return { year: n.getFullYear(), monthIndex: n.getMonth() }; })}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                      <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  {/* Calendar cells */}
                  {rangeLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {calendarCells.map((dateStr, i) => {
                        if (!dateStr) return <div key={`empty-${i}`} />;
                        const a = activityMap[dateStr];
                        const score = a ? activityScore(a) : 0;
                        const isSelected = dateStr === selectedDate;
                        const isToday = dateStr === today;
                        const dayNum = parseInt(dateStr.split('-')[2], 10);
                        const apptCount = apptCountMap[dateStr] ?? 0;
                        return (
                          <button
                            key={dateStr}
                            onClick={() => setSelectedDate(dateStr)}
                            className={`
                              relative aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all
                              ${heatColor(score)}
                              ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
                              ${isToday ? 'font-black underline' : ''}
                              hover:opacity-80 hover:scale-105
                            `}
                          >
                            <span className="text-xs font-semibold">{dayNum}</span>
                            {score > 0 && <span className="text-[10px] leading-none opacity-80">{score}</span>}
                            {a?.contractsWrittenCount ? (
                              <span className="absolute top-0.5 right-0.5 text-[8px]">🏠</span>
                            ) : null}
                            {apptCount > 0 && (
                              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                                {Array.from({ length: Math.min(apptCount, 3) }).map((_, di) => (
                                  <span key={di} className="w-1 h-1 rounded-full bg-primary/70 inline-block" />
                                ))}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
                    <span>Activity:</span>
                    <span className="px-2 py-0.5 rounded bg-muted/40">0</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700">1–3</span>
                    <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-950/60 text-green-700">4–8</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800">9–15</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-400 dark:bg-emerald-700 text-white">16+</span>
                    <span className="ml-2">🏠 = Contract</span>
                    <span className="ml-2 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary/70 inline-block" /> = Appointment</span>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Summary Bar */}
              <Card className="mt-4">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    <Flame className="inline h-3 w-3 mr-1 text-orange-500" />
                    {monthLabel} Totals — {monthTotals.daysLogged} days logged
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'Calls', value: monthTotals.calls, icon: Phone, color: 'text-blue-600' },
                      { label: 'Engagements', value: monthTotals.engagements, icon: Users, color: 'text-purple-600' },
                      { label: 'Appts Set', value: monthTotals.apptSet, icon: Calendar, color: 'text-amber-600' },
                      { label: 'Appts Held', value: monthTotals.apptHeld, icon: CheckCircle2, color: 'text-green-600' },
                      { label: 'Contracts', value: monthTotals.contracts, icon: FileText, color: 'text-emerald-600' },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="text-center">
                        <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
                        <p className="text-xl font-black text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side Panel — Selected Day Editor */}
            <div>
              <Card className="lg:sticky lg:top-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </CardTitle>
                    {selectedScore > 0 ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> {selectedScore} activities
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Not logged</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Time tracking */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Start</Label>
                      <Input type="time" value={activity.startTime || ''} onChange={(e) => setActivity(a => ({ ...a, startTime: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End</Label>
                      <Input type="time" value={activity.endTime || ''} onChange={(e) => setActivity(a => ({ ...a, endTime: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>
                  {calcHours(activity.startTime || '', activity.endTime || '') !== null && (
                    <p className="text-xs text-center text-muted-foreground">
                      {calcHours(activity.startTime || '', activity.endTime || '')} hours worked
                    </p>
                  )}
                  {/* Activity counters */}
                  <div className="space-y-2">
                    {[
                      { label: 'Calls', key: 'callsCount' as const, icon: Phone },
                      { label: 'Engagements', key: 'engagementsCount' as const, icon: Users },
                      { label: 'Appts Set', key: 'appointmentsSetCount' as const, icon: Calendar },
                      { label: 'Appts Held', key: 'appointmentsHeldCount' as const, icon: CheckCircle2 },
                      { label: 'Contracts', key: 'contractsWrittenCount' as const, icon: FileText },
                    ].map(({ label, key, icon: Icon }) => (
                      <div key={key} className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Label className="text-xs flex-1">{label}</Label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActivity(a => ({ ...a, [key]: Math.max(0, (a[key] || 0) - 1) }))}
                            className="w-6 h-6 rounded border text-sm font-bold hover:bg-muted flex items-center justify-center"
                          >−</button>
                          <span className="w-8 text-center text-sm font-bold">{activity[key] || 0}</span>
                          <button
                            type="button"
                            onClick={() => setActivity(a => ({ ...a, [key]: (a[key] || 0) + 1 }))}
                            className="w-6 h-6 rounded border text-sm font-bold hover:bg-muted flex items-center justify-center"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea placeholder="Optional notes..." value={activity.notes || ''} onChange={(e) => setActivity(a => ({ ...a, notes: e.target.value }))} className="text-sm h-16 resize-none" />
                  </div>
                  <Button onClick={saveDailyActivity} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? 'Saving…' : 'Save Day'}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">Edits locked after 45 days</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── DAILY ENTRY TAB (kept for backward compat) ───────────────────── */}
        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity Entry</CardTitle>
              <CardDescription>Select a day and log your activity. Completed days are marked on the calendar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full sm:w-[180px]" />
                </div>
                <div className="md:ml-auto">
                  <Button onClick={saveDailyActivity} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1"><Label>Start Time</Label><Input type="time" value={activity.startTime || ''} onChange={(e) => setActivity(a => ({ ...a, startTime: e.target.value }))} /></div>
                <div className="space-y-1"><Label>End Time</Label><Input type="time" value={activity.endTime || ''} onChange={(e) => setActivity(a => ({ ...a, endTime: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Daily Hours</Label><div className="h-9 flex items-center px-3 rounded-md border bg-muted/50 text-sm font-medium">{(() => { const h = calcHours(activity.startTime || '', activity.endTime || ''); return h !== null ? `${h} hrs` : '—'; })()}</div></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricField label="Calls" value={activity.callsCount} onChange={(n) => setActivity((a) => ({ ...a, callsCount: n }))} />
                <MetricField label="Engagements" value={activity.engagementsCount} onChange={(n) => setActivity((a) => ({ ...a, engagementsCount: n }))} />
                <MetricField label="Appts Set" value={activity.appointmentsSetCount} onChange={(n) => setActivity((a) => ({ ...a, appointmentsSetCount: n }))} />
                <MetricField label="Appts Held" value={activity.appointmentsHeldCount} onChange={(n) => setActivity((a) => ({ ...a, appointmentsHeldCount: n }))} />
                <MetricField label="Contracts" value={activity.contractsWrittenCount} onChange={(n) => setActivity((a) => ({ ...a, contractsWrittenCount: n }))} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea placeholder="Optional notes for the day..." value={activity.notes || ''} onChange={(e) => setActivity(a => ({ ...a, notes: e.target.value }))} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── APPOINTMENTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="appts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Running Appointment List</CardTitle>
              <CardDescription>Add appointments, update past ones, and keep your pipeline clean.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMonthYear(m => { const p = new Date(m.year, m.monthIndex - 1, 1); return { year: p.getFullYear(), monthIndex: p.getMonth() }; })}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium py-1">{monthLabel}</span>
                  <Button variant="outline" size="sm" onClick={() => setMonthYear(m => { const n = new Date(m.year, m.monthIndex + 1, 1); return { year: n.getFullYear(), monthIndex: n.getMonth() }; })}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button onClick={addAppointment}><Plus className="h-4 w-4 mr-2" />Add Appointment</Button>
              </div>
              {apptLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : appointments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No appointments yet for {monthLabel}</p>
                  <p className="text-sm mt-1">Click "Add Appointment" to log one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="space-y-1"><Label>Date</Label><Input type="date" value={a.date} onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, date: e.target.value } : x)))} className="w-full sm:w-[180px]" /></div>
                        <div className="space-y-1"><Label>Time</Label><Input type="time" value={a.time || ''} onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, time: e.target.value } : x)))} className="w-full sm:w-[140px]" /></div>
                        <div className="space-y-1 flex-1"><Label>Contact Name</Label><Input value={a.contactName} placeholder="Buyer consult, listing appointment..." onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, contactName: e.target.value } : x)))} /></div>
                      </div>
                      <div className="space-y-1"><Label>Notes</Label><Input value={a.notes || ''} placeholder="Optional" onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, notes: e.target.value } : x)))} /></div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => persistAppointment(a)} disabled={!a.date || !a.contactName}><Save className="h-4 w-4 mr-2" />Save</Button>
                        <Button variant="destructive" size="icon" onClick={() => deleteAppointment(a.id)}><Trash2 className="h-4 w-4" /></Button>
                        <div className="ml-auto text-xs text-muted-foreground">{a.id.startsWith('temp-') ? 'Not saved yet' : `ID: ${a.id.substring(0, 8)}...`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BULK IMPORT TAB ───────────────────────────────────────────────── */}
        <TabsContent value="bulk" className="space-y-6">
          {/* Tracking sheet data — populates calendar + KPI dashboard */}
          <BulkTrackerImport
            onImportComplete={(count) => {
              // Refresh the calendar range data so dots + heat-map update immediately
              setMonthYear(m => ({ ...m }));
            }}
            viewAs={isImpersonating && effectiveUid ? effectiveUid : undefined}
          />
          {/* Appointment records — populates appointment dots on calendar */}
          <BulkAppointmentImport
            onImportComplete={() => { loadAppts(); }}
            viewAs={isImpersonating && effectiveUid ? effectiveUid : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Placeholder icon for calendar tab
function CalendarLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}

function MetricField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" value={String(value ?? 0)} min={0} onChange={(e) => onChange(Number(e.target.value || 0))} />
    </div>
  );
}
