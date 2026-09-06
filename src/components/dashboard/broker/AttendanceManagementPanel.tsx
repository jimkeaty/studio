'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { CalendarCheck2, Clock3, MapPin, Printer, QrCode, Settings2, Users } from 'lucide-react';

type Agent = { agentId: string; name: string; startDate?: string };

const QR_EVENTS = [
  { type: 'huddle', label: 'Team Huddle', schedule: 'Tuesday & Thursday · 8:30 AM', detail: 'Agents scan the code while attending the huddle.' },
  { type: 'role_play_ids', label: 'Role Play / New Agent IDS', schedule: 'Wednesday · 10:00 AM', detail: 'Agents scan the code while attending role play or New Agent IDS.' },
] as const;

export function AttendanceManagementPanel({ year }: { year: number }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [officeLocationConfigured, setOfficeLocationConfigured] = useState(false);
  const [recentAttendance, setRecentAttendance] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [training, setTraining] = useState({ date: new Date().toISOString().slice(0, 10), topic: '', durationMinutes: '60', notes: '', participantIds: [] as string[], directorLed: true });
  const [radiusMeters, setRadiusMeters] = useState('250');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const directorResponse = await fetch(`/api/broker/dad-report-card?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
      const director = await directorResponse.json();
      if (!directorResponse.ok) throw new Error(director.error || 'Unable to load active agents');
      const roster = Array.isArray(director.eligibleAgents?.active) ? director.eligibleAgents.active : [];
      setAgents(roster);
      if (roster[0]?.agentId) {
        const attendanceResponse = await fetch(`/api/agent/attendance?scope=all&year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
        const attendance = await attendanceResponse.json();
        if (attendanceResponse.ok) {
          setOfficeLocationConfigured(Boolean(attendance.officeLocationConfigured));
          setRecentAttendance(Array.isArray(attendance.records) ? attendance.records.slice(0, 20) : []);
        }
      }
    } catch (error: any) {
      toast({ title: 'Unable to load attendance management', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user, year]);

  useEffect(() => { load(); }, [load]);

  const qrUrl = (eventType: string) => typeof window === 'undefined' ? '' : `${window.location.origin}/dashboard/attendance?event=${eventType}`;

  const setOfficeLocation = async () => {
    if (!user) return;
    if (!navigator.geolocation) {
      toast({ title: 'Location is unavailable', description: 'Use a location-enabled device while standing at the office.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/agent/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'setOfficeLocation', location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }, radiusMeters: Number(radiusMeters) || 250 }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save office location');
        setOfficeLocationConfigured(true);
        setLocationOpen(false);
        toast({ title: 'Office location saved', description: `Floor-time check-ins now require an on-site location verification within ${result.radiusMeters} meters.` });
      } catch (error: any) {
        toast({ title: 'Office location was not saved', description: error.message, variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    }, (error) => {
      setSaving(false);
      toast({ title: 'Location access is required', description: error.code === error.PERMISSION_DENIED ? 'Allow location access while standing at the office, then try again.' : 'Unable to confirm this device location. Please try again.', variant: 'destructive' });
    }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
  };

  const saveTraining = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/agent/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'recordTrainingSession', ...training, durationMinutes: Number(training.durationMinutes) || 0 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to record training');
      toast({ title: 'Training attendance recorded', description: `${result.participantCount} agent${result.participantCount === 1 ? '' : 's'} added to the training roster.` });
      setTrainingOpen(false);
      setTraining({ date: new Date().toISOString().slice(0, 10), topic: '', durationMinutes: '60', notes: '', participantIds: [], directorLed: true });
    } catch (error: any) {
      toast({ title: 'Training was not recorded', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (agentId: string) => setTraining(form => ({ ...form, participantIds: form.participantIds.includes(agentId) ? form.participantIds.filter(id => id !== agentId) : [...form.participantIds, agentId] }));
  const selectedCount = useMemo(() => training.participantIds.length, [training.participantIds]);
  const recordLabel = (record: Record<string, any>) => record.eventLabel || (record.type === 'huddle' ? 'Team Huddle' : record.type === 'role_play_ids' ? 'Role Play / New Agent IDS' : record.type === 'floor_time' ? 'Floor Time' : record.type === 'training' ? record.topic || 'Training' : String(record.type || '').replace(/_/g, ' '));
  const formatTime = (value?: string) => value ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const formatDuration = (minutes?: number) => minutes ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60 ? `${minutes % 60}m` : ''}`.trim() : '—';

  return <>
    <Card className="border-2 border-violet-200 bg-gradient-to-b from-violet-50/70 to-background">
      <CardHeader className="border-b border-violet-100 pb-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><CardTitle className="flex items-center gap-2 text-xl"><QrCode className="h-5 w-5 text-violet-700" />Attendance & Office Coverage</CardTitle><CardDescription className="mt-1">Post the QR codes at recurring sessions, record training rosters, and configure secure location verification for office floor-time shifts.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setLocationOpen(true)}><Settings2 className="mr-1.5 h-3.5 w-3.5" />{officeLocationConfigured ? 'Office Location Set' : 'Set Office Location'}</Button><Button size="sm" onClick={() => setTrainingOpen(true)}><Users className="mr-1.5 h-3.5 w-3.5" />Record Training</Button></div></div></CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Floor-time standard:</strong> each agent must complete two location-verified shifts of at least three hours every week and one location-verified weekend shift of at least four hours every month. A QR code records scheduled session attendance; floor time requires check-in and check-out from the agent’s signed-in SmartBroker account.</div>
        <div className="grid gap-4 xl:grid-cols-2">{QR_EVENTS.map(event => <div key={event.type} className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"><div className="rounded-lg bg-white p-2 ring-1 ring-border"><QRCodeSVG value={qrUrl(event.type) || `https://smartbroker.local/dashboard/attendance?event=${event.type}`} size={144} level="M" includeMargin /></div><div className="flex-1"><p className="font-semibold">{event.label}</p><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{event.schedule}</p><p className="mt-2 text-xs text-muted-foreground">{event.detail}</p><Button className="mt-4" variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-3.5 w-3.5" />Print QR Code</Button></div></div>)}</div>
        <p className="text-xs text-muted-foreground">{loading ? 'Loading active roster…' : `${agents.length} active agent${agents.length === 1 ? '' : 's'} available for training attendance.`} {officeLocationConfigured ? 'Secure office verification is configured.' : 'Set the office location while standing at the office before agents begin floor-time check-ins.'}</p>
        <div className="overflow-x-auto rounded-lg border"><div className="border-b bg-muted/40 px-4 py-3"><p className="text-sm font-semibold">Recent Agent Attendance & Floor Time</p><p className="mt-0.5 text-xs text-muted-foreground">Use this list to confirm participation, on-site shift coverage, arrival, departure, and qualifying hours.</p></div><Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Activity</TableHead><TableHead>Date</TableHead><TableHead>Arrived</TableHead><TableHead>Left</TableHead><TableHead>Duration</TableHead><TableHead>Verification</TableHead></TableRow></TableHeader><TableBody>{recentAttendance.length ? recentAttendance.map(record => <TableRow key={record.id}><TableCell className="font-medium">{record.agentDisplayName || '—'}</TableCell><TableCell>{recordLabel(record)}</TableCell><TableCell>{record.date || '—'}</TableCell><TableCell>{formatTime(record.checkInAt)}</TableCell><TableCell>{formatTime(record.checkOutAt)}</TableCell><TableCell>{formatDuration(Number(record.durationMinutes || 0))}</TableCell><TableCell>{record.type === 'floor_time' ? <span className={record.locationVerified && record.checkOutLocationVerified ? 'text-emerald-700' : 'text-amber-700'}>{record.locationVerified && record.checkOutLocationVerified ? 'Arrival + departure verified' : record.checkOutAt ? 'Review needed' : 'Shift open'}</span> : 'QR attendance'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No attendance or floor-time records have been logged yet.</TableCell></TableRow>}</TableBody></Table></div>
      </CardContent>
    </Card>

    <Dialog open={locationOpen} onOpenChange={setLocationOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-violet-700" />Set Secure Office Location</DialogTitle><DialogDescription>While physically at the office, save this device location. Floor-time agents will need to check in and out within the selected radius.</DialogDescription></DialogHeader><div className="space-y-2 py-2"><Label>Allowed radius (meters)</Label><Input type="number" min="25" max="1000" value={radiusMeters} onChange={event => setRadiusMeters(event.target.value)} /><p className="text-xs text-muted-foreground">250 meters is a practical starting radius. A tighter radius better verifies office presence but may fail indoors or on devices with weaker GPS.</p></div><DialogFooter><Button variant="outline" onClick={() => setLocationOpen(false)}>Cancel</Button><Button onClick={setOfficeLocation} disabled={saving}>{saving ? 'Saving…' : 'Save This Office Location'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={trainingOpen} onOpenChange={setTrainingOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Record Training Attendance</DialogTitle><DialogDescription>Log the training topic, length, and each participating agent. Each participant receives an attendance record on their own dashboard and in Ethan’s reporting.</DialogDescription></DialogHeader><div className="grid gap-3 py-2 sm:grid-cols-2"><div className="space-y-1.5"><Label>Date</Label><Input type="date" value={training.date} onChange={event => setTraining(form => ({ ...form, date: event.target.value }))} /></div><div className="space-y-1.5"><Label>Duration (minutes)</Label><Input type="number" min="0" value={training.durationMinutes} onChange={event => setTraining(form => ({ ...form, durationMinutes: event.target.value }))} /></div><div className="space-y-1.5 sm:col-span-2"><Label>Training Topic *</Label><Input placeholder="Example: Buyer consultation role play" value={training.topic} onChange={event => setTraining(form => ({ ...form, topic: event.target.value }))} /></div><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={training.directorLed} onChange={event => setTraining(form => ({ ...form, directorLed: event.target.checked }))} />Credit this session to Ethan’s Director scorecard.</label><div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={3} placeholder="Key topics, materials, or follow-up" value={training.notes} onChange={event => setTraining(form => ({ ...form, notes: event.target.value }))} /></div></div><div className="rounded-lg border"><div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2"><p className="text-sm font-semibold">Participants ({selectedCount})</p><Button variant="ghost" size="sm" onClick={() => setTraining(form => ({ ...form, participantIds: form.participantIds.length === agents.length ? [] : agents.map(agent => agent.agentId) }))}>{training.participantIds.length === agents.length ? 'Clear all' : 'Select all'}</Button></div><div className="grid max-h-64 gap-1 overflow-y-auto p-3 sm:grid-cols-2">{agents.map(agent => <label key={agent.agentId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><input type="checkbox" checked={training.participantIds.includes(agent.agentId)} onChange={() => toggleAgent(agent.agentId)} />{agent.name}</label>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setTrainingOpen(false)}>Cancel</Button><Button onClick={saveTraining} disabled={saving || !training.topic.trim() || !selectedCount}>{saving ? 'Saving…' : 'Save Training Attendance'}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
