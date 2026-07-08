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
  Link2,
  Link2Off,
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

// ─── Transaction notification prefs ─────────────────────────────────────────
type TxUpdateGranularity = 'all' | 'significant' | 'none';

interface TxNotificationPrefs {
  // Agent: notified when TC/staff updates their transaction
  agentOnTcUpdate: {
    granularity: TxUpdateGranularity;
    in_app: boolean;
    email: boolean;
    sms: boolean;
  };
  // TC: notified when agent edits a transaction they are working
  tcOnAgentEdit: {
    in_app: boolean;
    email: boolean;
    sms: boolean;
  };
}

const DEFAULT_TX_PREFS: TxNotificationPrefs = {
  agentOnTcUpdate: { granularity: 'significant', in_app: true, email: true, sms: false },
  tcOnAgentEdit:   { in_app: true, email: true, sms: false },
};

// ─── TV Board post types ──────────────────────────────────────────────────────
type TvPostType = 'buyerNeeds' | 'comingSoon' | 'openHouseOpps' | 'agentHelp';

interface TvChannelPrefs {
  in_app: boolean;
  email: boolean;
  sms: boolean;
}

interface TvNotificationPrefs {
  buyerNeeds:     TvChannelPrefs;
  comingSoon:     TvChannelPrefs;
  openHouseOpps:  TvChannelPrefs;
  agentHelp:      TvChannelPrefs;
}

const DEFAULT_TV_PREFS: TvNotificationPrefs = {
  buyerNeeds:    { in_app: true, email: false, sms: false },
  comingSoon:    { in_app: true, email: false, sms: false },
  openHouseOpps: { in_app: true, email: false, sms: false },
  agentHelp:     { in_app: true, email: false, sms: false },
};

const TV_POST_TYPES: { key: TvPostType; label: string; emoji: string; description: string }[] = [
  { key: 'buyerNeeds',    label: 'Buyer Needs',              emoji: '🔍', description: 'When an agent posts a new buyer need on the office board' },
  { key: 'comingSoon',   label: 'Coming Soon Listings',      emoji: '⏰', description: 'When an agent posts a new coming soon listing' },
  { key: 'openHouseOpps', label: 'Open House Opportunities', emoji: '🏠', description: 'When an agent posts a new open house opportunity' },
  { key: 'agentHelp',    label: 'Agent Help Requests',       emoji: '🤝', description: 'When an agent needs help with a showing, inspection, or closing' },
];

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
  const [tvPrefs, setTvPrefs] = useState<TvNotificationPrefs>(DEFAULT_TV_PREFS);
  const [txPrefs, setTxPrefs] = useState<TxNotificationPrefs>(DEFAULT_TX_PREFS);
  const [savingTx, setSavingTx] = useState(false);
  const [txSaveStatus, setTxSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [savingTv, setSavingTv] = useState(false);
  const [tvSaveStatus, setTvSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
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
          if (data.tvNotificationPrefs) {
            setTvPrefs({ ...DEFAULT_TV_PREFS, ...data.tvNotificationPrefs });
          }
          if (data.txNotificationPrefs) {
            setTxPrefs({
              agentOnTcUpdate: { ...DEFAULT_TX_PREFS.agentOnTcUpdate, ...data.txNotificationPrefs.agentOnTcUpdate },
              tcOnAgentEdit:   { ...DEFAULT_TX_PREFS.tcOnAgentEdit,   ...data.txNotificationPrefs.tcOnAgentEdit },
            });
          }
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

  // ── Save transaction notification preferences ─────────────────────────────
  const handleSaveTxPrefs = useCallback(async () => {
    if (!user) return;
    setSavingTx(true);
    setTxSaveStatus('idle');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prefs, txNotificationPrefs: txPrefs }),
      });
      const data = await res.json();
      if (data.ok) {
        setTxSaveStatus('success');
        setTimeout(() => setTxSaveStatus('idle'), 3000);
      } else {
        setTxSaveStatus('error');
      }
    } catch {
      setTxSaveStatus('error');
    } finally {
      setSavingTx(false);
    }
  }, [user, prefs, txPrefs]);

  // ── Save TV board preferences ───────────────────────────────────────────────
  const handleSaveTvPrefs = useCallback(async () => {
    if (!user) return;
    setSavingTv(true);
    setTvSaveStatus('idle');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prefs, tvNotificationPrefs: tvPrefs }),
      });
      const data = await res.json();
      if (data.ok) {
        setTvSaveStatus('success');
        setTimeout(() => setTvSaveStatus('idle'), 3000);
      } else {
        setTvSaveStatus('error');
      }
    } catch {
      setTvSaveStatus('error');
    } finally {
      setSavingTv(false);
    }
  }, [user, prefs, tvPrefs]);

  const toggleTvPref = (postType: TvPostType, channel: keyof TvChannelPrefs) => {
    setTvPrefs(prev => ({
      ...prev,
      [postType]: { ...prev[postType], [channel]: !prev[postType][channel] },
    }));
  };

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

      {/* ── Transaction Notifications ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Transaction Update Notifications
          </CardTitle>
          <CardDescription>
            Control how you are notified when transactions are updated by TC/staff or by agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Agent: notified when TC/staff updates */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">When TC or Staff updates my transaction</p>
              <p className="text-xs text-muted-foreground mt-0.5">Receive a notification whenever a TC or staff member makes changes to one of your transactions.</p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-xs text-muted-foreground w-20">Frequency:</span>
              {(['all', 'significant', 'none'] as TxUpdateGranularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setTxPrefs(p => ({ ...p, agentOnTcUpdate: { ...p.agentOnTcUpdate, granularity: g } }))}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    txPrefs.agentOnTcUpdate.granularity === g
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {g === 'all' ? 'Every change' : g === 'significant' ? 'Status changes only' : 'None'}
                </button>
              ))}
            </div>
            {txPrefs.agentOnTcUpdate.granularity !== 'none' && (
              <div className="flex flex-wrap gap-4">
                {(['in_app', 'email', 'sms'] as const).map((ch) => {
                  const icons = { in_app: Monitor, email: Mail, sms: MessageSquare };
                  const labels = { in_app: 'In-App', email: 'Email', sms: 'SMS' };
                  const Icon = icons[ch];
                  const disabled = ch === 'sms' && !phone;
                  return (
                    <div key={ch} className="flex items-center gap-2">
                      <Switch
                        id={`tx-agent-${ch}`}
                        checked={txPrefs.agentOnTcUpdate[ch]}
                        onCheckedChange={() => setTxPrefs(p => ({ ...p, agentOnTcUpdate: { ...p.agentOnTcUpdate, [ch]: !p.agentOnTcUpdate[ch] } }))}
                        disabled={disabled}
                      />
                      <Label htmlFor={`tx-agent-${ch}`} className={`text-xs cursor-pointer ${disabled ? 'text-muted-foreground/50' : ''}`}>
                        <Icon className="h-3 w-3 inline mr-1" />{labels[ch]}
                        {ch === 'sms' && !phone && <span className="ml-1 text-amber-500">(no number)</span>}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* TC: notified when agent edits */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">When an agent edits a transaction I am working</p>
              <p className="text-xs text-muted-foreground mt-0.5">As a TC, receive a notification whenever an agent makes changes to a transaction assigned to you.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {(['in_app', 'email', 'sms'] as const).map((ch) => {
                const icons = { in_app: Monitor, email: Mail, sms: MessageSquare };
                const labels = { in_app: 'In-App', email: 'Email', sms: 'SMS' };
                const Icon = icons[ch];
                const disabled = ch === 'sms' && !phone;
                return (
                  <div key={ch} className="flex items-center gap-2">
                    <Switch
                      id={`tx-tc-${ch}`}
                      checked={txPrefs.tcOnAgentEdit[ch]}
                      onCheckedChange={() => setTxPrefs(p => ({ ...p, tcOnAgentEdit: { ...p.tcOnAgentEdit, [ch]: !p.tcOnAgentEdit[ch] } }))}
                      disabled={disabled}
                    />
                    <Label htmlFor={`tx-tc-${ch}`} className={`text-xs cursor-pointer ${disabled ? 'text-muted-foreground/50' : ''}`}>
                      <Icon className="h-3 w-3 inline mr-1" />{labels[ch]}
                      {ch === 'sms' && !phone && <span className="ml-1 text-amber-500">(no number)</span>}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
        <div className="px-6 pb-4">
          {txSaveStatus === 'success' && (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Transaction notification preferences saved.
            </p>
          )}
          {txSaveStatus === 'error' && (
            <p className="text-xs text-red-600 flex items-center gap-1 mb-2">
              <AlertCircle className="h-3.5 w-3.5" /> Failed to save. Please try again.
            </p>
          )}
          <Button size="sm" onClick={handleSaveTxPrefs} disabled={savingTx}>
            {savingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save Transaction Preferences
          </Button>
        </div>
      </Card>

      {/* ── TV Board Notifications ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            Office Board (TV Mode) Notifications
          </CardTitle>
          <CardDescription>
            Choose which office board post types you want to be notified about when agents post new items.
            In-app is always on by default. Enable email or SMS to receive notifications outside the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y">
          {TV_POST_TYPES.map((pt, idx) => (
            <div key={pt.key} className={`py-4 ${idx === 0 ? 'pt-0' : ''}`}>
              <div className="mb-3">
                <p className="text-sm font-medium">{pt.emoji} {pt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pt.description}</p>
              </div>
              <div className="flex flex-wrap gap-4">
                {(['in_app', 'email', 'sms'] as const).map((ch) => {
                  const icons = { in_app: Monitor, email: Mail, sms: MessageSquare };
                  const labels = { in_app: 'In-App', email: 'Email', sms: 'SMS' };
                  const Icon = icons[ch];
                  const disabled = ch === 'sms' && !phone;
                  return (
                    <div key={ch} className="flex items-center gap-2">
                      <Switch
                        id={`tv-${pt.key}-${ch}`}
                        checked={tvPrefs[pt.key][ch]}
                        onCheckedChange={() => toggleTvPref(pt.key, ch)}
                        disabled={disabled}
                      />
                      <Label
                        htmlFor={`tv-${pt.key}-${ch}`}
                        className={`text-xs cursor-pointer ${disabled ? 'text-muted-foreground/50' : ''}`}
                      >
                        <Icon className="h-3 w-3 inline mr-1" />
                        {labels[ch]}
                        {ch === 'sms' && !phone && (
                          <span className="ml-1 text-amber-500">(no number)</span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
        <div className="px-6 pb-4">
          {tvSaveStatus === 'success' && (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> TV board preferences saved.
            </p>
          )}
          {tvSaveStatus === 'error' && (
            <p className="text-xs text-red-600 flex items-center gap-1 mb-2">
              <AlertCircle className="h-3.5 w-3.5" /> Failed to save. Please try again.
            </p>
          )}
          <Button size="sm" onClick={handleSaveTvPrefs} disabled={savingTv}>
            {savingTv ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save Board Preferences
          </Button>
        </div>
      </Card>

      {/* ── Facebook Group Integration ── */}
      <FacebookConnectCard />

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

// ─── Facebook Connect Card ────────────────────────────────────────────────────
function FacebookConnectCard() {
  const { user } = useUser();
  const [status, setStatus] = useState<'loading' | 'connected' | 'expired' | 'disconnected'>('loading');
  const [fbName, setFbName] = useState<string | null>(null);
  const [fbExpiresAt, setFbExpiresAt] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for ?fb= query param on page load (redirect from OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fb = params.get('fb');
    const name = params.get('name');
    const reason = params.get('reason');
    if (fb === 'connected' && name) {
      setFbName(decodeURIComponent(name));
      setStatus('connected');
      const url = new URL(window.location.href);
      url.searchParams.delete('fb');
      url.searchParams.delete('name');
      window.history.replaceState({}, '', url.toString());
    } else if (fb === 'denied' || fb === 'error') {
      setError(reason ? decodeURIComponent(reason) : 'Facebook connection failed. Please try again.');
      setStatus('disconnected');
      const url = new URL(window.location.href);
      url.searchParams.delete('fb');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Fetch current Facebook connection status
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/facebook/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.connected) {
          setStatus('connected');
          setFbName(data.facebookName || null);
          setFbExpiresAt(data.expiresAt || null);
        } else if (data.expired) {
          setStatus('expired');
          setFbName(data.facebookName || null);
        } else {
          setStatus('disconnected');
        }
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function handleConnect() {
    if (!user) return;
    setConnecting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/facebook/connect', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start Facebook connection');
        setConnecting(false);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to connect');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!user) return;
    setDisconnecting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await fetch('/api/facebook/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus('disconnected');
      setFbName(null);
      setFbExpiresAt(null);
    } catch (e: any) {
      setError(e.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Facebook Group Integration
        </CardTitle>
        <CardDescription>
          Connect your personal Facebook account to post Coming Soon listings, Buyer Needs, Open Houses,
          and Agent Help requests directly to the <strong>KRE Agents</strong> Facebook group.
          Each agent connects their own account — posts appear as coming from you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking connection status...
          </div>
        )}

        {status === 'connected' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Connected{fbName ? ` as ${fbName}` : ''}
                </p>
                {fbExpiresAt && (
                  <p className="text-xs text-muted-foreground">
                    Token valid until {new Date(fbExpiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your Facebook account is linked. When you post to the community board, you'll see an option
              to also share to the KRE Agents Facebook group.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2Off className="h-3.5 w-3.5 mr-1.5" />}
              Disconnect Facebook
            </Button>
          </div>
        )}

        {status === 'expired' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <p className="text-sm font-medium text-amber-700">
                Facebook token expired{fbName ? ` (was: ${fbName})` : ''} — please reconnect
              </p>
            </div>
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
              Reconnect Facebook
            </Button>
          </div>
        )}

        {status === 'disconnected' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not connected. Click below to authorize Smart Broker USA to post to the KRE Agents group on your behalf.
              You'll be redirected to Facebook to grant permission.
            </p>
            <Button size="sm" onClick={handleConnect} disabled={connecting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : (
                <svg className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              )}
              Connect Facebook Account
            </Button>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">How it works:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>You authorize once — your token is stored securely</li>
            <li>Posts appear as coming from <strong>your</strong> Facebook account</li>
            <li>Tokens expire after ~60 days — you'll be prompted to reconnect</li>
            <li>The app only posts when <strong>you</strong> check "Share to KRE Agents Group"</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
