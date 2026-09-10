'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { CalendarCheck2, Clock3, MapPin, QrCode, ShieldCheck, Users } from 'lucide-react';

type AttendanceRecord = {
  id?: string;
  type: string;
  date: string;
  eventLabel?: string;
  scheduledStart?: string;
  topic?: string | null;
  durationMinutes?: number | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
};

type AttendanceData = {
  ok: boolean;
  today: string;
  schedules: Record<string, { label: string; days: string[]; startLabel: string; endLabel: string; required: boolean }>;
  officeLocationConfigured: boolean;
  floorTimeQrEnabled?: boolean;
  records: AttendanceRecord[];
  summary: {
    huddlesThisMonth: number;
    rolePlayThisMonth: number;
    trainingThisMonth: number;
    salesMeetingsThisMonth: number;
    qualifyingWeeklyShifts: number;
    weeklyShiftGoal: number;
    weeklyShiftMinutes: number;
    qualifyingWeekendShifts: number;
    weekendShiftGoal: number;
    weekendShiftMinutes: number;
    openShift: AttendanceRecord | null;
  };
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMinutes(value?: number | null) {
  const minutes = Number(value || 0);
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours ? `${hours}h ` : ''}${remaining ? `${remaining}m` : ''}`.trim();
}

function eventLabel(type: string) {
  if (type === 'huddle') return 'Team Huddle';
  if (type === 'role_play_ids') return 'Role Play / New Agent IDS';
  if (type === 'sales_meeting') return 'Sales Meeting';
  if (type === 'floor_time') return 'Floor Time';
  if (type === 'training') return 'Training';
  return type.replace(/_/g, ' ');
}

const TRACKED_SESSION_TYPES = ['huddle', 'training', 'sales_meeting', 'role_play_ids'] as const;
type TrackedSessionType = typeof TRACKED_SESSION_TYPES[number];

export function AttendanceAndFloorTimePanel({ compact = false }: { compact?: boolean }) {
  const { user, effectiveUid, isImpersonating, impersonationReady } = useEffectiveUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const requestedEvent = searchParams.get('event');
  const highlightedEvent = TRACKED_SESSION_TYPES.includes(requestedEvent as TrackedSessionType) ? requestedEvent as TrackedSessionType : null;
  const requestedFloorTimeQr = searchParams.get('floorTimeQr');

  const load = useCallback(async () => {
    if (!user || !impersonationReady) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = isImpersonating && effectiveUid ? `?agentId=${encodeURIComponent(effectiveUid)}` : '';
      const response = await fetch(`/api/agent/attendance${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load attendance');
      setData(result);
    } catch (error: any) {
      toast({ title: 'Unable to load attendance', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [effectiveUid, impersonationReady, isImpersonating, toast, user]);

  useEffect(() => { load(); }, [load]);

  const getLocation = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device does not support location sharing. Use a location-enabled phone or contact an administrator.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      reject(new Error(error.code === error.PERMISSION_DENIED ? 'Location access is required to verify office floor time.' : 'Unable to confirm your office location. Please try again.'));
    }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
  });

  const post = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!user) return;
    if (isImpersonating) {
      toast({ title: 'Attendance is view-only', description: 'Exit View as Agent before recording attendance or floor time.', variant: 'destructive' });
      return null;
    }
    setSubmitting(action);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/agent/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save attendance');
      return result;
    } catch (error: any) {
      toast({ title: 'Check-in not completed', description: error.message, variant: 'destructive' });
      return null;
    } finally {
      setSubmitting(null);
    }
  };

  const checkInEvent = async (eventType: TrackedSessionType) => {
    const result = await post('checkInEvent', { eventType });
    if (result) {
      toast({ title: `${eventLabel(eventType)} attendance recorded`, description: 'Your attendance is now on your dashboard and Ethan’s attendance report.' });
      load();
    }
  };

  const checkInFloorTimeQr = async () => {
    if (!requestedFloorTimeQr) return;
    const result = await post('checkInFloorTimeQr', { qrCodeId: requestedFloorTimeQr });
    if (result) {
      toast({
        title: 'Floor Time QR check-in recorded',
        description: result.notification?.state === 'failed'
          ? 'Your presence was recorded. The Director notification needs attention in Attendance Management.'
          : 'Your presence was recorded and the Director notification was queued.',
      });
      load();
    }
  };

  const floorAction = async (action: 'floorCheckIn' | 'floorCheckOut') => {
    try {
      const position = await getLocation();
      const result = await post(action, {
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      });
      if (result) {
        toast({
          title: action === 'floorCheckIn' ? 'Floor time started' : 'Floor time completed',
          description: action === 'floorCheckOut' ? `${formatMinutes(result.durationMinutes)} recorded.` : 'Your office arrival time and location were verified.',
        });
        load();
      }
    } catch (error: any) {
      toast({ title: 'Office verification required', description: error.message, variant: 'destructive' });
    }
  };

  const recentRecords = useMemo(() => data?.records.slice(0, compact ? 3 : 8) || [], [compact, data]);
  const viewOnly = isImpersonating;

  if (loading) return <Skeleton className={compact ? 'h-48 w-full' : 'h-[560px] w-full'} />;
  if (!data) return null;
  const summary = data.summary;
  const openShift = summary.openShift;

  return (
    <Card className={compact ? 'border-primary/20' : 'border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-background'}>
      <CardHeader className={compact ? 'pb-3' : 'border-b border-primary/10 pb-4'}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" />Attendance & Floor Time</CardTitle>
            <CardDescription className="mt-1">Track required huddles and role play, plus optional training and sales meetings. Floor time requires a signed-in, location-verified check-in and check-out.</CardDescription>
          </div>
          <Badge variant={data.officeLocationConfigured ? 'default' : 'secondary'} className="w-fit gap-1"><ShieldCheck className="h-3.5 w-3.5" />{data.officeLocationConfigured ? 'Office verification active' : 'Office location awaiting setup'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {viewOnly && <Alert className="border-amber-300 bg-amber-50 text-amber-950"><AlertTitle>Viewing attendance history only</AlertTitle><AlertDescription>Exit View as Agent before recording attendance or starting a floor-time shift. This prevents staff from creating attendance records on an agent’s behalf.</AlertDescription></Alert>}
        {highlightedEvent && (
          <Alert className="border-primary/30 bg-primary/5"><QrCode className="h-4 w-4 text-primary" /><AlertTitle>{eventLabel(highlightedEvent)} check-in</AlertTitle><AlertDescription>Use the button below while you are attending the scheduled session. Your signed-in account is recorded once per session.</AlertDescription></Alert>
        )}
        {requestedFloorTimeQr && (
          <Alert className="border-violet-300 bg-violet-50 text-violet-950"><QrCode className="h-4 w-4 text-violet-700" /><AlertTitle>Floor Time QR check-in</AlertTitle><AlertDescription>This identity-verified QR check-in records your Floor Time presence and asks the Director to verify or activate your floor-time leads. It does not activate leads automatically or replace secure shift check-in and check-out for shift-duration credit.</AlertDescription></Alert>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Scheduled Team Attendance</h3></div>
          <div className="grid gap-3 md:grid-cols-2">
            {TRACKED_SESSION_TYPES.map(type => {
              const schedule = data.schedules[type];
              if (!schedule) return null;
              const isHighlighted = highlightedEvent === type;
              return <div key={type} className={`rounded-lg border p-4 ${isHighlighted ? 'border-primary bg-primary/5' : 'bg-background'}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{schedule.label}</p><Badge variant={schedule.required ? 'default' : 'secondary'}>{schedule.required ? 'Required' : 'Optional · tracking only'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{schedule.days.join(' & ')} · {schedule.startLabel}–{schedule.endLabel}</p></div><CalendarCheck2 className="h-5 w-5 text-primary" /></div>
                <Button className="mt-4 w-full" variant={isHighlighted ? 'default' : 'outline'} onClick={() => checkInEvent(type)} disabled={submitting !== null || viewOnly}>{submitting === 'checkInEvent' && isHighlighted ? 'Recording...' : 'Record Attendance'}</Button>
              </div>;
            })}
          </div>
        </section>

        {requestedFloorTimeQr && <section aria-label="Floor Time QR check-in"><div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-violet-950">Record Floor Time presence</p><p className="mt-1 text-sm text-violet-800">Only active signed-in agents may use an enabled current Floor Time QR code. Duplicate scans are blocked for 15 minutes.</p></div><Button onClick={checkInFloorTimeQr} disabled={submitting !== null || viewOnly || !data.floorTimeQrEnabled}>{submitting === 'checkInFloorTimeQr' ? 'Recording…' : data.floorTimeQrEnabled ? 'Record Floor Time QR Check-In' : 'Floor Time QR Is Disabled'}</Button></div>{!data.floorTimeQrEnabled && <p className="mt-2 text-xs text-amber-700">Ask an authorized administrator to enable the current Floor Time QR code.</p>}</div></section>}

        <section>
          <div className="mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Secure Office Floor Time</h3></div>
          <div className="grid gap-3 lg:grid-cols-[1.3fr_.7fr_.7fr]">
            <div className="rounded-lg border bg-background p-4"><p className="font-semibold">{openShift ? 'Floor-time shift in progress' : 'Start your floor-time shift'}</p><p className="mt-1 text-sm text-muted-foreground">{openShift ? `Checked in at ${formatTime(openShift.checkInAt)}. Check out when you leave the office.` : 'Your phone will confirm you are at the office. Both arrival and departure are time-stamped.'}</p><Button className="mt-4" onClick={() => floorAction(openShift ? 'floorCheckOut' : 'floorCheckIn')} disabled={submitting !== null || !data.officeLocationConfigured || viewOnly}>{submitting?.startsWith('floor') ? 'Verifying...' : openShift ? 'Check Out of Floor Time' : 'Check In to Floor Time'}</Button>{!data.officeLocationConfigured && <p className="mt-2 text-xs text-amber-700">An administrator must set the office location before secure floor-time check-ins can begin.</p>}</div>
            <div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Week</p><p className="mt-2 text-2xl font-bold">{summary.qualifyingWeeklyShifts} / {summary.weeklyShiftGoal}</p><p className="mt-1 text-xs text-muted-foreground">qualifying {summary.weeklyShiftMinutes / 60}-hour shifts</p></div>
            <div className="rounded-lg border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Month</p><p className="mt-2 text-2xl font-bold">{summary.qualifyingWeekendShifts} / {summary.weekendShiftGoal}</p><p className="mt-1 text-xs text-muted-foreground">qualifying {summary.weekendShiftMinutes / 60}-hour weekend shifts</p></div>
          </div>
        </section>

        {!compact && <section><div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Recent Attendance & Coverage</h3></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Check-in</th><th className="px-3 py-2">Check-out</th><th className="px-3 py-2">Duration</th></tr></thead><tbody>{recentRecords.length ? recentRecords.map((record, index) => <tr key={`${record.id || record.date}-${index}`} className="border-t"><td className="px-3 py-2">{record.date}</td><td className="px-3 py-2 font-medium">{record.eventLabel || eventLabel(record.type)}</td><td className="px-3 py-2">{formatTime(record.checkInAt)}</td><td className="px-3 py-2">{formatTime(record.checkOutAt)}</td><td className="px-3 py-2">{formatMinutes(record.durationMinutes)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No attendance or floor-time records have been logged yet.</td></tr>}</tbody></table></div></section>}
      </CardContent>
    </Card>
  );
}
