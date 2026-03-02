
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Plus, Save, Trash2, Loader2, CalendarPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

type DailyActivity = {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
  notes?: string;
};

type RangeDay = {
  date: string; // YYYY-MM-DD
  dailyActivity: DailyActivity;
};

type Appointment = {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // "HH:mm" optional
  contactName: string;
  notes?: string;
  category: 'buyer' | 'seller';
  status?: 'scheduled' | 'held' | 'canceled' | 'no_show';
  createdAt?: string;
  updatedAt?: string;
};

type DraftAppointment = Omit<Appointment, 'id'> & { id: string; };


function ymd(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
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
  };
}

function isSameMonth(a: string, year: number, monthIndex: number): boolean {
  return a?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}-`);
}

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));
  const [activity, setActivity] = useState<DailyActivity>(() => parseActivity(null));

  const [monthYear, setMonthYear] = useState<{ year: number; monthIndex: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  });
  const [rangeDays, setRangeDays] = useState<RangeDay[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the new appointment entry modal
  const [showApptModal, setShowApptModal] = useState(false);
  const [apptDraftRows, setApptDraftRows] = useState<DraftAppointment[]>([]);
  const [isSavingAppointments, setIsSavingAppointments] = useState(false);


  const monthStartEnd = useMemo(() => {
    const start = new Date(monthYear.year, monthYear.monthIndex, 1);
    const end = new Date(monthYear.year, monthYear.monthIndex + 1, 0);
    return { start: ymd(start), end: ymd(end) };
  }, [monthYear]);

  const completedDaysSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of rangeDays) {
      const a = d.dailyActivity;
      const sum =
        (a.callsCount || 0) +
        (a.engagementsCount || 0) +
        (a.appointmentsSetCount || 0) +
        (a.appointmentsHeldCount || 0) +
        (a.contractsWrittenCount || 0);
      if (sum > 0) s.add(d.date);
    }
    return s;
  }, [rangeDays]);

  async function authedFetch(url: string, init?: RequestInit) {
    if (!user) throw new Error('Not signed in');
    const token = await user.getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  }

  const loadAppts = async () => {
      if (!user) return;
      setApptLoading(true);
      setError(null);
      try {
        const res = await authedFetch(`/api/appointments?year=${monthYear.year}&month=${monthYear.monthIndex + 1}`);
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load appointments (${res.status})`);
        }

        const arr = (json.appointments || []) as any[];
        const normalized: Appointment[] = arr.map((a: any) => ({
          id: String(a.id || ''),
          date: String(a.date || ''),
          time: a.time ? String(a.time) : undefined,
          contactName: String(a.contactName || 'Appointment'),
          notes: a.notes ? String(a.notes) : undefined,
          category: a.category || 'buyer',
          status: a.status ? a.status : undefined,
          createdAt: a.createdAt ? String(a.createdAt) : undefined,
          updatedAt: a.updatedAt ? String(a.updatedAt) : undefined,
        })).filter((a) => a.id);

        normalized.sort((a, b) => {
          const ad = `${a.date} ${a.time || '00:00'}`;
          const bd = `${b.date} ${b.time || '00:00'}`;
          return ad.localeCompare(bd);
        });

        setAppointments(normalized);
      } catch (e: any) {
        setError(e?.message || 'Failed to load appointments');
        setAppointments([]);
      } finally {
        setApptLoading(false);
      }
    };

  // Load a single day (for edit)
  useEffect(() => {
    const loadDay = async () => {
      if (!user) return;
      setError(null);
      try {
        const res = await authedFetch(`/api/daily-activity?date=${selectedDate}`);
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load daily activity (${res.status})`);
        }
        setActivity(parseActivity(json.dailyActivity));
      } catch (e: any) {
        setError(e?.message || 'Failed to load daily activity');
        setActivity(parseActivity(null));
      }
    };

    if (!userLoading && user) loadDay();
  }, [user, userLoading, selectedDate]);

  // Load month range & appointments
  useEffect(() => {
    const loadRange = async () => {
      if (!user) return;
      setRangeLoading(true);
      setError(null);
      try {
        const { start, end } = monthStartEnd;
        const res = await authedFetch(`/api/daily-activity/range?start=${start}&end=${end}`);
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load monthly log (${res.status})`);
        }
        const normalized: RangeDay[] = Object.entries(json.activities || {}).map(([date, activityData]) => ({
            date: date,
            dailyActivity: parseActivity(activityData),
        })).filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));
        
        setRangeDays(normalized);
      } catch (e: any) {
        setError(e?.message || 'Failed to load monthly activity log');
        setRangeDays([]);
      } finally {
        setRangeLoading(false);
      }
    };

    if (!userLoading && user) {
        loadRange();
        loadAppts();
    }
  }, [user, userLoading, monthYear]);

  async function saveDailyActivity() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/daily-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          dailyActivity: activity,
        }),
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
      
      toast({ title: 'Saved!', description: `Activity for ${selectedDate} has been logged.`});

      // refresh month (so completion badges update)
      const { start, end } = monthStartEnd;
      const rangeRes = await authedFetch(`/api/daily-activity/range?start=${start}&end=${end}`);
      const rangeJson = await rangeRes.json();
      const normalized: RangeDay[] = Object.entries(rangeJson.activities || {}).map(([date, activityData]) => ({
            date: date,
            dailyActivity: parseActivity(activityData),
      })).filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));
      setRangeDays(normalized);
      
      // NEW: Check for missing appointments and trigger modal
      const newAppointmentsSetCount = activity.appointmentsSetCount;
      const existingAppointmentsForDate = appointments.filter(a => a.date === selectedDate).length;
      const missingCount = newAppointmentsSetCount - existingAppointmentsForDate;

      if (missingCount > 0) {
        const newDrafts: DraftAppointment[] = Array.from({ length: missingCount }, (_, i) => ({
          id: `draft_${Date.now()}_${i}`,
          date: selectedDate,
          contactName: '',
          category: 'buyer',
          status: 'scheduled',
          time: '',
          notes: '',
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
            date: draft.date,
            contactName: draft.contactName,
            category: draft.category,
            status: draft.status,
            notes: draft.notes || null,
            scheduledAt: draft.time ? new Date(`${draft.date}T${draft.time}`).toISOString() : new Date(`${draft.date}T00:00:00`).toISOString(),
        };
        return authedFetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => res.json().then(json => {
            if (!res.ok) throw new Error(json.error || 'Failed to save');
            return json;
        }));
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
    // This function is kept for adding single appointments from the UI directly
    const draft: Partial<Appointment> = {
      date: selectedDate,
      time: '',
      contactName: '',
      notes: '',
      status: 'scheduled',
    };
    const tempId = `temp-${Date.now()}`;
    setAppointments((prev) => [
      ...prev,
      { id: tempId, date: draft.date!, time: '', contactName: '', notes: '', category: 'buyer', status: 'scheduled' },
    ]);
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
          date: appt.date,
          contactName: appt.contactName,
          category: appt.category,
          status: appt.status || 'scheduled',
          notes: appt.notes || null,
          scheduledAt: appt.time ? new Date(`${appt.date}T${appt.time}`).toISOString() : null,
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
    if (id.startsWith('temp-')) {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      return;
    }
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

  if (userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Not Signed In</AlertTitle>
        <AlertDescription>Please sign in to use the Daily Tracker.</AlertDescription>
      </Alert>
    );
  }

  const monthLabel = new Date(monthYear.year, monthYear.monthIndex, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Tracker</h1>
        <p className="text-muted-foreground">
          Track your daily activities, view month history, and keep a running appointment list.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* APPOINTMENT ENTRY MODAL */}
       <Dialog open={showApptModal} onOpenChange={setShowApptModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log New Appointments</DialogTitle>
            <DialogDescription>
              Your daily log shows you set {apptDraftRows.length} new appointment(s). Add the details below.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-1 space-y-4">
            {apptDraftRows.map((draft, index) => (
                <Card key={draft.id}>
                    <CardContent className="p-4 space-y-3">
                        <Input
                            placeholder="Contact Name / Title"
                            value={draft.contactName}
                            onChange={(e) => handleDraftChange(index, 'contactName', e.target.value)}
                        />
                        <div className="grid grid-cols-3 gap-3">
                             <Select value={draft.category} onValueChange={(val: 'buyer' | 'seller') => handleDraftChange(index, 'category', val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem></SelectContent>
                             </Select>
                            <Input
                                type="date"
                                value={draft.date}
                                onChange={(e) => handleDraftChange(index, 'date', e.target.value)}
                            />
                            <Input
                                type="time"
                                value={draft.time}
                                onChange={(e) => handleDraftChange(index, 'time', e.target.value)}
                            />
                        </div>
                        <Textarea
                            placeholder="Optional notes..."
                            value={draft.notes}
                            onChange={(e) => handleDraftChange(index, 'notes', e.target.value)}
                        />
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


      <Tabs defaultValue="today">
        <TabsList className="grid grid-cols-3 w-full md:w-[520px]">
          <TabsTrigger value="today">
            <ClipboardList className="h-4 w-4 mr-2" />
            Daily Entry
          </TabsTrigger>
          <TabsTrigger value="month">
            <CalendarDays className="h-4 w-4 mr-2" />
            Monthly Log
          </TabsTrigger>
          <TabsTrigger value="appts">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Appointments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
              <CardDescription>Select a day to view or edit your activity log. Completed days are marked.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-[180px]"
                    />
                    {completedDaysSet.has(selectedDate) ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Completed
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not logged</span>
                    )}
                  </div>
                </div>
                <div className="md:ml-auto">
                  <Button onClick={saveDailyActivity} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricField label="Calls" value={activity.callsCount} onChange={(n) => setActivity((a) => ({ ...a, callsCount: n }))} />
                <MetricField label="Engagements" value={activity.engagementsCount} onChange={(n) => setActivity((a) => ({ ...a, engagementsCount: n }))} />
                <MetricField label="Appts Set" value={activity.appointmentsSetCount} onChange={(n) => setActivity((a) => ({ ...a, appointmentsSetCount: n }))} />
                <MetricField label="Appts Held" value={activity.appointmentsHeldCount} onChange={(n) => setActivity((a) => ({ ...a, appointmentsHeldCount: n }))} />
                <MetricField label="Contracts" value={activity.contractsWrittenCount} onChange={(n) => setActivity((a) => ({ ...a, contractsWrittenCount: n }))} />
              </div>
              <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea placeholder="Optional notes for the day..." value={activity.notes || ''} onChange={(e) => setActivity(a => ({...a, notes: e.target.value}))} />
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: You can go back and edit previous days (up to 45 days).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="month" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Activity Log</CardTitle>
              <CardDescription>See what you logged for each day this month, and jump to any day to edit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <div className="font-medium">{monthLabel}</div>
                <div className="flex gap-2 md:ml-auto">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMonthYear((m) => {
                        const prev = new Date(m.year, m.monthIndex - 1, 1);
                        return { year: prev.getFullYear(), monthIndex: prev.getMonth() };
                      })
                    }
                  > Prev </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMonthYear((m) => {
                        const next = new Date(m.year, m.monthIndex + 1, 1);
                        return { year: next.getFullYear(), monthIndex: next.getMonth() };
                      })
                    }
                  > Next </Button>
                </div>
              </div>

              {rangeLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : rangeDays.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No activity logged for this month yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {rangeDays
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((d) => {
                      const a = d.dailyActivity;
                      const total = a.callsCount + a.engagementsCount + a.appointmentsSetCount + a.appointmentsHeldCount + a.contractsWrittenCount;
                      return (
                        <button
                          key={d.date}
                          onClick={() => { setSelectedDate(d.date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-medium w-[110px]">{d.date}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              C:{a.callsCount} · E:{a.engagementsCount} · S:{a.appointmentsSetCount} · H:{a.appointmentsHeldCount} · W:{a.contractsWrittenCount}
                            </div>
                            <div className="ml-auto text-sm font-semibold">
                              Total: {total}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="appts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Running Appointment List</CardTitle>
              <CardDescription>Add appointments you forgot, update past ones, and keep your pipeline clean.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <Button onClick={addAppointment}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Single Appointment
                </Button>
              </div>

              {apptLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : appointments.length === 0 ? (
                <div className="text-sm text-muted-foreground">No appointments yet for this month.</div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="space-y-1">
                          <Label>Date</Label>
                          <Input type="date" value={a.date} onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, date: e.target.value } : x)))} className="w-[180px]"/>
                        </div>
                        <div className="space-y-1">
                          <Label>Time</Label>
                          <Input type="time" value={a.time || ''} onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, time: e.target.value } : x)))} className="w-[140px]"/>
                        </div>
                        <div className="space-y-1 flex-1">
                          <Label>Contact Name</Label>
                          <Input value={a.contactName} placeholder="Buyer consult, listing appointment..." onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, contactName: e.target.value } : x)))}/>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Notes</Label>
                        <Input value={a.notes || ''} placeholder="Optional" onChange={(e) => setAppointments((prev) => prev.map((x) => (x.id === a.id ? { ...x, notes: e.target.value } : x)))}/>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => persistAppointment(a)} disabled={!a.date || !a.contactName}>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => deleteAppointment(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="ml-auto text-xs text-muted-foreground">
                          {a.id.startsWith('temp-') ? 'Not saved yet' : `ID: ${a.id.substring(0,8)}...`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={String(value ?? 0)}
        min={0}
        onChange={(e) => onChange(Number(e.target.value || 0))}
      />
    </div>
  );
}
