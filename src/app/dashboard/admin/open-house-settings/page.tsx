'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Home, Clock, Bell, CheckCircle2, AlertTriangle, Play } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const ampm = i >= 12 ? 'PM' : 'AM';
  const h = i % 12 || 12;
  return { value: i, label: `${h}:00 ${ampm}` };
});

interface OHSettings {
  deadlineText: string;
  reminderDayOfWeek: number;
  reminderHour: number;
  reminderMinute: number;
  staffReminderDayOfWeek: number;
  staffReminderHour: number;
  staffReminderMinute: number;
  reminderEnabled: boolean;
  staffReminderEnabled: boolean;
}

const DEFAULTS: OHSettings = {
  deadlineText: 'Thursday by 4:00 PM',
  reminderDayOfWeek: 4,
  reminderHour: 8,
  reminderMinute: 0,
  staffReminderDayOfWeek: 5,
  staffReminderHour: 9,
  staffReminderMinute: 0,
  reminderEnabled: true,
  staffReminderEnabled: true,
};

export default function OpenHouseSettingsPage() {
  const { user } = useUser();
  const [settings, setSettings] = useState<OHSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState<'deadline' | 'staff_deadline'>('deadline');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const getToken = useCallback(async () => {
    if (!user) return '';
    return await (user as any).getIdToken();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/admin/open-house-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setSettings({ ...DEFAULTS, ...data.settings });
      } catch (err: any) {
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, getToken]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/open-house-settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestReminder() {
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/cron/open-house-reminder?mode=${testMode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        const msg = testMode === 'deadline'
          ? `Sent to ${data.agentsNotified} agents (${data.emailsSent} emails). Weekend has ${data.satItems} Sat + ${data.sunItems} Sun submissions.`
          : `Sent to ${data.staffNotified} staff. ${data.pendingSubmissions} pending submissions.`;
        setTestResult({ ok: true, message: msg });
      } else {
        setTestResult({ ok: false, message: data.error || 'Test failed.' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  }

  function set<K extends keyof OHSettings>(key: K, val: OHSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Home className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Open House Settings</h1>
          <p className="text-sm text-muted-foreground">Configure the weekly reminder and deadline for open house submissions.</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Deadline Text */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4" /> Submission Deadline
          </CardTitle>
          <CardDescription>
            This text appears in the agent reminder email and on the Submit Open House page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="deadlineText">Deadline Description</Label>
            <Input
              id="deadlineText"
              value={settings.deadlineText}
              onChange={e => set('deadlineText', e.target.value)}
              placeholder="e.g. Thursday by 4:00 PM"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown to agents as: "Submit by <strong>{settings.deadlineText}</strong>"
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent Reminder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> Agent Reminder (Thursday Morning)
          </CardTitle>
          <CardDescription>
            Sends an in-app notification and email to all active agents listing open houses already scheduled for the weekend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable agent reminder</Label>
            <Switch
              checked={settings.reminderEnabled}
              onCheckedChange={v => set('reminderEnabled', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Day of week</Label>
              <Select
                value={String(settings.reminderDayOfWeek)}
                onValueChange={v => set('reminderDayOfWeek', Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time</Label>
              <Select
                value={String(settings.reminderHour)}
                onValueChange={v => set('reminderHour', Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Default: <strong>Thursday at 8:00 AM</strong>. Update your cron schedule to match if you change this.
          </p>
        </CardContent>
      </Card>

      {/* Staff Reminder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> Staff Reminder (Friday Morning)
          </CardTitle>
          <CardDescription>
            Sends an in-app notification to all staff reminding them to complete the MLS, Boomtown, and email blast checklist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable staff reminder</Label>
            <Switch
              checked={settings.staffReminderEnabled}
              onCheckedChange={v => set('staffReminderEnabled', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Day of week</Label>
              <Select
                value={String(settings.staffReminderDayOfWeek)}
                onValueChange={v => set('staffReminderDayOfWeek', Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time</Label>
              <Select
                value={String(settings.staffReminderHour)}
                onValueChange={v => set('staffReminderHour', Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Default: <strong>Friday at 9:00 AM</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Test Reminder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="w-4 h-4" /> Test Reminder Now
          </CardTitle>
          <CardDescription>
            Trigger a reminder immediately to verify it works. This will send real notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Select value={testMode} onValueChange={v => setTestMode(v as any)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Agent Reminder (deadline mode)</SelectItem>
                <SelectItem value="staff_deadline">Staff Reminder (staff_deadline mode)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleTestReminder} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Send Test Now
            </Button>
          </div>
          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
