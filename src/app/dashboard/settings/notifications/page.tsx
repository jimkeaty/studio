'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Phone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | 'tc_new_intake'
  | 'tc_approved'
  | 'tc_rejected'
  | 'staff_queue_new'
  | 'staff_queue_resolved'
  | 'staff_queue_attention'
  | 'tx_status_change'
  | 'tx_new_agent'
  | 'system';

type ChannelKey = 'in_app' | 'push' | 'email' | 'sms';

interface EventPrefs {
  in_app?: boolean;
  push?: boolean;
  email?: boolean;
  sms?: boolean;
}

interface NotificationPrefs {
  in_app: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  events: Partial<Record<NotificationType, EventPrefs>>;
}

const DEFAULT_PREFS: NotificationPrefs = {
  in_app: true,
  push: true,
  email: true,
  sms: false,
  events: {},
};

// ─── Event metadata ───────────────────────────────────────────────────────────

interface EventMeta {
  type: NotificationType;
  label: string;
  description: string;
}

const EVENT_GROUPS: { label: string; description: string; events: EventMeta[] }[] = [
  {
    label: 'Transaction Coordinator',
    description: 'Notifications related to TC queue activity',
    events: [
      {
        type: 'tc_new_intake',
        label: 'New TC Intake',
        description: 'When a new transaction is submitted to the TC queue',
      },
      {
        type: 'tc_approved',
        label: 'TC Intake Approved',
        description: 'When your TC intake is approved and a transaction is created',
      },
      {
        type: 'tc_rejected',
        label: 'TC Intake Rejected',
        description: 'When your TC intake is rejected with feedback',
      },
    ],
  },
  {
    label: 'Staff Queue',
    description: 'Notifications related to staff queue items',
    events: [
      {
        type: 'staff_queue_new',
        label: 'New Staff Queue Item',
        description: 'When a new item is added to the staff queue',
      },
      {
        type: 'staff_queue_resolved',
        label: 'Staff Queue Resolved',
        description: 'When a staff queue item assigned to you is resolved',
      },
      {
        type: 'staff_queue_attention',
        label: 'Action Required',
        description: 'When a staff queue item needs your attention',
      },
    ],
  },
  {
    label: 'Transactions',
    description: 'Notifications related to your transactions',
    events: [
      {
        type: 'tx_status_change',
        label: 'Transaction Status Change',
        description: 'When a transaction status is updated',
      },
      {
        type: 'tx_new_agent',
        label: 'New Agent Transaction',
        description: 'When an agent submits a new transaction (TC/staff)',
      },
    ],
  },
  {
    label: 'System',
    description: 'General system and platform notifications',
    events: [
      {
        type: 'system',
        label: 'System Notifications',
        description: 'Platform updates, maintenance notices, and announcements',
      },
    ],
  },
];

// ─── Channel display config ───────────────────────────────────────────────────

const CHANNELS: { key: ChannelKey; label: string; icon: React.ElementType; description: string }[] = [
  {
    key: 'in_app',
    label: 'In-App',
    icon: Monitor,
    description: 'Notifications shown inside the dashboard',
  },
  {
    key: 'push',
    label: 'Push',
    icon: Smartphone,
    description: 'Browser push notifications (requires permission)',
  },
  {
    key: 'email',
    label: 'Email',
    icon: Mail,
    description: 'Email notifications sent to your account email',
  },
  {
    key: 'sms',
    label: 'SMS',
    icon: MessageSquare,
    description: 'Text message notifications to your mobile number',
  },
];

// ─── Main page component ──────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const { user, loading: userLoading } = useUser();
  const { permission, requestPermission, isRegistering } = usePushNotifications();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Phone number state
  const [phone, setPhone] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaveStatus, setPhoneSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // ── Load preferences + phone ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/notifications/preferences', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setPrefs({ ...DEFAULT_PREFS, ...data.prefs, events: data.prefs.events ?? {} });
          const savedPhone = data.phone || '';
          setPhone(savedPhone);
          setPhoneInput(savedPhone);
        }
      } catch {
        // silently fall back to defaults
      } finally {
        if (!cancelled) setLoadingPrefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Save preferences ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prefs }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setErrorMsg(data.error || 'Failed to save preferences');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMsg(err.message || 'Network error');
    } finally {
      setSaving(false);
    }
  }, [user, prefs]);

  // ── Save phone number ───────────────────────────────────────────────────────
  const handleSavePhone = useCallback(async () => {
    if (!user) return;
    setSavingPhone(true);
    setPhoneSaveStatus('idle');
    try {
      const token = await user.getIdToken();
      // Normalize: strip non-digits then format as E.164 +1XXXXXXXXXX
      const digits = phoneInput.replace(/\D/g, '');
      const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : phoneInput.trim();
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prefs, phone: normalized }),
      });
      const data = await res.json();
      if (data.ok) {
        setPhone(normalized);
        setPhoneInput(normalized);
        setPhoneSaveStatus('success');
        setTimeout(() => setPhoneSaveStatus('idle'), 3000);
      } else {
        setPhoneSaveStatus('error');
      }
    } catch {
      setPhoneSaveStatus('error');
    } finally {
      setSavingPhone(false);
    }
  }, [user, phoneInput, prefs]);

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  const toggleGlobalChannel = (channel: ChannelKey) => {
    setPrefs((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  const getEventChannelValue = (type: NotificationType, channel: ChannelKey): boolean => {
    const override = prefs.events[type];
    if (override && typeof override[channel] === 'boolean') return override[channel] as boolean;
    return prefs[channel];
  };

  const toggleEventChannel = (type: NotificationType, channel: ChannelKey) => {
    const currentValue = getEventChannelValue(type, channel);
    setPrefs((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [type]: {
          ...(prev.events[type] ?? {}),
          [channel]: !currentValue,
        },
      },
    }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (userLoading || loadingPrefs) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose how and when you receive notifications across all channels.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Save status feedback */}
      {saveStatus === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Preferences saved successfully.
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg || 'Failed to save preferences. Please try again.'}
        </div>
      )}

      {/* ── SMS Phone Number card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            SMS Phone Number
          </CardTitle>
          <CardDescription>
            Enter your mobile number to receive SMS notifications. Standard messaging rates may apply.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="(555) 867-5309"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSavePhone}
              disabled={savingPhone || phoneInput === phone}
              className="shrink-0"
            >
              {savingPhone ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save Number
            </Button>
          </div>
          {phoneSaveStatus === 'success' && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Phone number saved. SMS is ready to use.
            </p>
          )}
          {phoneSaveStatus === 'error' && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Failed to save phone number. Please try again.
            </p>
          )}
          {phone && phoneSaveStatus === 'idle' && (
            <p className="text-xs text-muted-foreground">
              Current number: <span className="font-medium text-foreground">{phone}</span>
            </p>
          )}
          {!phone && phoneSaveStatus === 'idle' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> No phone number saved — SMS notifications will not be delivered until you add one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Push notification permission card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            Browser Push Notifications
          </CardTitle>
          <CardDescription>
            Push notifications require browser permission to display alerts even when the app is in the background.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permission === 'granted' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Bell className="h-4 w-4" />
              <span>Push notifications are enabled for this browser.</span>
              <Badge variant="outline" className="ml-auto border-emerald-300 text-emerald-600 text-xs">Active</Badge>
            </div>
          )}
          {permission === 'denied' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BellOff className="h-4 w-4" />
              <span>Push notifications are blocked. Please update your browser site settings to allow notifications.</span>
            </div>
          )}
          {permission === 'default' && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                You have not yet granted permission for push notifications.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={requestPermission}
                disabled={isRegistering}
                className="shrink-0"
              >
                {isRegistering ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isRegistering ? 'Enabling…' : 'Enable Push'}
              </Button>
            </div>
          )}
          {permission === 'unsupported' && (
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported in this browser.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Global channel toggles ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Global Channel Settings</CardTitle>
          <CardDescription>
            Enable or disable entire notification channels. Per-event settings below can further refine delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CHANNELS.map((ch) => (
            <div key={ch.key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <ch.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <Label htmlFor={`global-${ch.key}`} className="font-medium cursor-pointer">
                    {ch.label}
                    {ch.key === 'sms' && !phone && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0 border-amber-300 text-amber-600">No number saved</Badge>
                    )}
                    {ch.key === 'sms' && phone && (
                      <Badge variant="secondary" className="ml-2 text-[10px] py-0">Opt-in</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {ch.key === 'sms' && phone ? `Sending to ${phone}` : ch.description}
                  </p>
                </div>
              </div>
              <Switch
                id={`global-${ch.key}`}
                checked={prefs[ch.key]}
                onCheckedChange={() => toggleGlobalChannel(ch.key)}
                disabled={ch.key === 'sms' && !phone}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Per-event toggles ── */}
      {EVENT_GROUPS.map((group) => (
        <Card key={group.label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.label}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {group.events.map((event, idx) => (
              <div key={event.type} className={`py-4 ${idx === 0 ? 'pt-0' : ''}`}>
                <div className="mb-3">
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {CHANNELS.map((ch) => (
                    <div key={ch.key} className="flex items-center gap-2">
                      <Switch
                        id={`${event.type}-${ch.key}`}
                        checked={getEventChannelValue(event.type, ch.key)}
                        onCheckedChange={() => toggleEventChannel(event.type, ch.key)}
                        disabled={!prefs[ch.key] || (ch.key === 'sms' && !phone)}
                      />
                      <Label
                        htmlFor={`${event.type}-${ch.key}`}
                        className={`text-xs cursor-pointer ${(!prefs[ch.key] || (ch.key === 'sms' && !phone)) ? 'text-muted-foreground/50' : ''}`}
                      >
                        <ch.icon className="h-3 w-3 inline mr-1" />
                        {ch.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Bottom save button */}
      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
