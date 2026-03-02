'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Plus, Save, Trash2 } from 'lucide-react';

type DailyActivity = {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
};

type RangeDay = {
  date: string; // YYYY-MM-DD
  dailyActivity: DailyActivity;
};

type Appointment = {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // "HH:mm" optional
  title: string;
  notes?: string;
  status?: 'scheduled' | 'held' | 'canceled' | 'no_show';
  createdAt?: string;
  updatedAt?: string;
};

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
  };
}

function isSameMonth(a: string, year: number, monthIndex: number): boolean {
  // monthIndex is 0-based
  return a?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}-`);
}

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();

  // Selected day for edit
  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));
  const [activity, setActivity] = useState<DailyActivity>(() =>
    parseActivity({
      callsCount: 0,
      engagementsCount: 0,
      appointmentsSetCount: 0,
      appointmentsHeldCount: 0,
      contractsWrittenCount: 0,
    })
  );

  // Month range log
  const [monthYear, setMonthYear] = useState<{ year: number; monthIndex: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  });
  const [rangeDays, setRangeDays] = useState<RangeDay[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        // required shape: json.dailyActivity always present; still guard
        setActivity(parseActivity(json.dailyActivity));
      } catch (e: any) {
        setError(e?.message || 'Failed to load daily activity');
        setActivity(parseActivity(null));
      }
    };

    if (!userLoading && user) loadDay();
  }, [user, userLoading, selectedDate]);

  // Load month range
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

        // Support common shapes:
        // { ok:true, days:[{date, dailyActivity}] } OR { ok:true, entries:[...] } OR { ok:true, range:[...] }
        const arr = (json.days || json.entries || json.range || []) as any[];
        const normalized: RangeDay[] = arr
          .map((x) => ({
            date: String(x.date || x.day || ''),
            dailyActivity: parseActivity(x.dailyActivity || x.activity || x),
          }))
          .filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));

        setRangeDays(normalized);
      } catch (e: any) {
        setError(e?.message || 'Failed to load monthly activity log');
        setRangeDays([]);
      } finally {
        setRangeLoading(false);
      }
    };

    if (!userLoading && user) loadRange();
  }, [user, userLoading, monthStartEnd, monthYear]);

  // Load appointments
  useEffect(() => {
    const loadAppts = async () => {
      if (!user) return;
      setApptLoading(true);
      setError(null);
      try {
        const res = await authedFetch(`/api/appointments`);
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load appointments (${res.status})`);
        }

        const arr = (json.appointments || json.items || []) as any[];
        const normalized: Appointment[] = arr.map((a) => ({
          id: String(a.id || a._id || ''),
          date: String(a.date || ''),
          time: a.time ? String(a.time) : undefined,
          title: String(a.title || a.name || 'Appointment'),
          notes: a.notes ? String(a.notes) : undefined,
          status: a.status ? a.status : undefined,
          createdAt: a.createdAt ? String(a.createdAt) : undefined,
          updatedAt: a.updatedAt ? String(a.updatedAt) : undefined,
        })).filter((a) => a.id);

        // Sort by date/time
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

    if (!userLoading && user) loadAppts();
  }, [user, userLoading]);

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
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Save failed (${res.status})`);

      // refresh month (so completion badges update)
      const { start, end } = monthStartEnd;
      const rangeRes = await authedFetch(`/api/daily-activity/range?start=${start}&end=${end}`);
      const rangeJson = await rangeRes.json();
      const arr = (rangeJson.days || rangeJson.entries || rangeJson.range || []) as any[];
      const normalized: RangeDay[] = arr
        .map((x) => ({
          date: String(x.date || x.day || ''),
          dailyActivity: parseActivity(x.dailyActivity || x.activity || x),
        }))
        .filter((x) => x.date && isSameMonth(x.date, monthYear.year, monthYear.monthIndex));
      setRangeDays(normalized);
    } catch (e: any) {
      setError(e?.message || 'Failed to save daily activity');
    } finally {
      setSaving(false);
    }
  }

  async function addAppointment() {
    const draft: Partial<Appointment> = {
      date: selectedDate,
      time: '',
      title: '',
      notes: '',
      status: 'scheduled',
    };

    // Optimistic local row (temporary id)
    const tempId = `temp-${Date.now()}`;
    setAppointments((prev) => [
      ...prev,
      { id: tempId, date: draft.date!, time: '', title: '', notes: '', status: 'scheduled' },
    ]);
  }

  async function persistAppointment(appt: Appointment) {
    if (!user) return;
    setError(null);

    const isTemp = appt.id.startsWith('temp-');

    try {
      const res = await authedFetch(`/api/appointments${isTemp ? '' : `/${appt.id}`}`, {
        method: isTemp ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: appt.date,
          time: appt.time || null,
          title: appt.title,
          notes: appt.notes || null,
          status: appt.status || 'scheduled',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Appointment save failed (${res.status})`);

      // Expect server returns created/updated appointment with id
      const saved = json.appointment || json.item || null;

      if (saved?.id) {
        setAppointments((prev) =>
          prev
            .map((x) =>
              x.id === appt.id
                ? {
                    id: String(saved.id),
                    date: String(saved.date || appt.date),
                    time: saved.time ? String(saved.time) : appt.time,
                    title: String(saved.title || appt.title),
                    notes: saved.notes ? String(saved.notes) : appt.notes,
                    status: saved.status || appt.status,
                    createdAt: saved.createdAt ? String(saved.createdAt) : x.createdAt,
                    updatedAt: saved.updatedAt ? String(saved.updatedAt) : x.updatedAt,
                  }
                : x
            )
            .sort((a, b) => (`${a.date} ${a.time || '00:00'}`).localeCompare(`${b.date} ${b.time || '00:00'}`))
        );
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save appointment');
    }
  }

  async function deleteAppointment(id: string) {
    if (!user) return;
    setError(null);

    // If temp row, just remove locally
    if (id.startsWith('temp-')) {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      return;
    }

    try {
      const res = await authedFetch(`/api/appointments/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Delete failed (${res.status})`);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Failed to delete appointment');
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

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

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

        {/* DAILY ENTRY */}
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

              <p className="text-xs text-muted-foreground">
                Tip: You can go back and edit previous days anytime (your backend can enforce a window if you want).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONTHLY LOG */}
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
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMonthYear((m) => {
                        const next = new Date(m.year, m.monthIndex + 1, 1);
                        return { year: next.getFullYear(), monthIndex: next.getMonth() };
                      })
                    }
                  >
                    Next
                  </Button>
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
                      const total =
                        a.callsCount +
                        a.engagementsCount +
                        a.appointmentsSetCount +
                        a.appointmentsHeldCount +
                        a.contractsWrittenCount;

                      return (
                        <button
                          key={d.date}
                          onClick={() => {
                            setSelectedDate(d.date);
                            // also auto switch tab in user’s mind: daily entry stays available
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-medium w-[110px]">{d.date}</div>
                            <div className="text-sm text-muted-foreground">
                              Calls {a.callsCount} · Eng {a.engagementsCount} · Set {a.appointmentsSetCount} · Held {a.appointmentsHeldCount} · Contracts {a.contractsWrittenCount}
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

        {/* APPOINTMENTS */}
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
                  Add Appointment
                </Button>
              </div>

              {apptLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : appointments.length === 0 ? (
                <div className="text-sm text-muted-foreground">No appointments yet.</div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="space-y-1">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={a.date}
                            onChange={(e) =>
                              setAppointments((prev) =>
                                prev.map((x) => (x.id === a.id ? { ...x, date: e.target.value } : x))
                              )
                            }
                            className="w-[180px]"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label>Time</Label>
                          <Input
                            type="time"
                            value={a.time || ''}
                            onChange={(e) =>
                              setAppointments((prev) =>
                                prev.map((x) => (x.id === a.id ? { ...x, time: e.target.value } : x))
                              )
                            }
                            className="w-[140px]"
                          />
                        </div>

                        <div className="space-y-1 flex-1">
                          <Label>Title</Label>
                          <Input
                            value={a.title}
                            placeholder="Buyer consult, listing appointment, showing..."
                            onChange={(e) =>
                              setAppointments((prev) =>
                                prev.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Notes</Label>
                        <Input
                          value={a.notes || ''}
                          placeholder="Optional"
                          onChange={(e) =>
                            setAppointments((prev) =>
                              prev.map((x) => (x.id === a.id ? { ...x, notes: e.target.value } : x))
                            )
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => persistAppointment(a)}
                          disabled={!a.date || !a.title}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>

                        <Button variant="destructive" onClick={() => deleteAppointment(a.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>

                        <div className="ml-auto text-xs text-muted-foreground">
                          {a.id.startsWith('temp-') ? 'Not saved yet' : `ID: ${a.id}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                This list is designed so an agent can go back and add/update appointments from past days too.
              </p>
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