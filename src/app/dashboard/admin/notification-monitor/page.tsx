'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BellRing, CheckCircle2, CircleAlert, Clock3, Mail, MessageSquareText, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';

type NotificationEvent = {
  id: string;
  recipient: string;
  type: string;
  title: string;
  body: string;
  createdAt: string | null;
  read: boolean;
};

type StaffRow = {
  email: string;
  firebaseUid: string | null;
  usersDocExists: boolean;
  notificationPrefs: Record<string, unknown> | null;
  recentNotifCount: number;
  unreadNotifCount: number;
  lastNotifAt: string | null;
  issues: string[];
};

type MonitoringSnapshot = {
  generatedAt: string;
  staffCount: number;
  healthyStaffCount: number;
  staffWithIssues: number;
  unreadTotal: number;
  eventsLast24h: number;
  eventsByType: Record<string, number>;
  recentEvents: NotificationEvent[];
};

function displayTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function eventLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'System';
}

export default function NotificationMonitorPage() {
  const { user } = useUser();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/notification-debug', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load notification telemetry.');
      setRows(data.rows || []);
      setSnapshot(data.monitoring || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notification telemetry.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const metricCards = [
    { label: 'Monitored Staff & TC', value: snapshot?.staffCount ?? '—', hint: 'Accounts checked', icon: ShieldCheck, tone: 'text-sky-600' },
    { label: 'Bell-Ready Accounts', value: snapshot?.healthyStaffCount ?? '—', hint: 'No Firebase profile issue found', icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Unread In-App', value: snapshot?.unreadTotal ?? '—', hint: 'Stored Firestore bell records', icon: BellRing, tone: 'text-violet-600' },
    { label: 'Events Last 24 Hours', value: snapshot?.eventsLast24h ?? '—', hint: 'In-app records written', icon: Clock3, tone: 'text-amber-600' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-7 w-7 text-violet-600" />
            <h1 className="text-2xl font-bold tracking-tight">Notification Monitor</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Live operational view of in-app notification records written to Firebase for staff and TC users. Refreshes every minute while enabled.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh((value) => !value)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="flex flex-col gap-3 pt-5 text-sm text-violet-950 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
            <p><strong>What this proves:</strong> an in-app record was written to Firebase and is available to the bell. Email and SMS provider acceptance or inbox delivery are not currently stored as a delivery receipt, so they should be confirmed through the recipient’s channel or provider dashboard.</p>
          </div>
          <span className="shrink-0 text-xs text-violet-700">Snapshot: {displayTime(snapshot?.generatedAt || null)}</span>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2 pt-5 text-sm text-red-800"><CircleAlert className="h-4 w-4" />{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-center justify-between pt-5">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
                </div>
                <Icon className={`h-8 w-8 ${metric.tone}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent In-App Event Stream</CardTitle>
            <CardDescription>Newest Firebase notification records across monitored staff and TC accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
              {(snapshot?.recentEvents || []).length === 0 && !loading && <p className="py-8 text-center text-sm text-muted-foreground">No recent in-app events were found for monitored staff and TC users.</p>}
              {(snapshot?.recentEvents || []).map((event) => (
                <div key={event.id} className="flex gap-3 border-b pb-3 last:border-0">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${event.read ? 'bg-slate-300' : 'bg-violet-600'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium leading-tight">{event.title || 'Untitled notification'}</p>
                      <Badge variant="secondary" className="text-[10px]">{eventLabel(event.type)}</Badge>
                      {!event.read && <Badge className="bg-violet-100 text-[10px] text-violet-800 hover:bg-violet-100">Unread</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{event.body || 'No notification body recorded.'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{event.recipient} · {displayTime(event.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Event Mix — Last 24 Hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(snapshot?.eventsByType || {}).sort(([, a], [, b]) => b - a).slice(0, 8).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{eventLabel(type)}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(snapshot?.eventsByType || {}).length === 0 && <p className="text-sm text-muted-foreground">No last-24-hour events are available in the current snapshot.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Channel Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3"><BellRing className="h-4 w-4 text-violet-600" /><span><strong>In-app:</strong> verified by a Firebase record in this monitor.</span></div>
              <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-sky-600" /><span><strong>Email:</strong> send attempt follows preferences; inbox/provider confirmation remains separate.</span></div>
              <div className="flex items-center gap-3"><Smartphone className="h-4 w-4 text-emerald-600" /><span><strong>SMS:</strong> send attempt follows preferences and a valid phone; delivery receipt is separate.</span></div>
              <div className="flex items-center gap-3"><MessageSquareText className="h-4 w-4 text-amber-600" /><span><strong>Action:</strong> investigate any account shown with a red health status below.</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recipient Bell Health</CardTitle>
          <CardDescription>Firebase identity, in-app preference, and stored bell-record health for each staff or TC account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Recipient</th>
                  <th className="pb-3 pr-4 font-medium">Bell Health</th>
                  <th className="pb-3 pr-4 font-medium">Unread</th>
                  <th className="pb-3 pr-4 font-medium">Stored</th>
                  <th className="pb-3 pr-4 font-medium">Last In-App Record</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const healthy = row.issues.length === 0;
                  return (
                    <tr key={row.email || row.firebaseUid || Math.random()} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{row.email || 'Unlabeled staff account'}</td>
                      <td className="py-3 pr-4"><Badge className={healthy ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-red-100 text-red-800 hover:bg-red-100'}>{healthy ? 'Ready' : 'Needs attention'}</Badge></td>
                      <td className="py-3 pr-4">{row.unreadNotifCount}</td>
                      <td className="py-3 pr-4">{row.recentNotifCount}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{displayTime(row.lastNotifAt)}</td>
                      <td className="py-3 text-xs text-muted-foreground">{healthy ? 'No configuration issue found.' : row.issues.join(' ')}</td>
                    </tr>
                  );
                })}
                {!loading && rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No staff or TC telemetry is available yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
