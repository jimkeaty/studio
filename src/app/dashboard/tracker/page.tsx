'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useUser } from '@/firebase';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

type DailyActivity = {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
};

const EMPTY: DailyActivity = {
  callsCount: 0,
  engagementsCount: 0,
  appointmentsSetCount: 0,
  appointmentsHeldCount: 0,
  contractsWrittenCount: 0,
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  const [formData, setFormData] = useState<DailyActivity>(EMPTY);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // ---------------------------
  // Load Daily Activity
  // ---------------------------
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      setLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/daily-activity?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || 'Failed to load daily activity');
        }

        // API returns { ok: true, data: <doc> }
        const data = json.data ?? null;

        // If no doc exists yet, default to zeros
        const next: DailyActivity = {
          callsCount: toNumber(data?.callsCount ?? 0),
          engagementsCount: toNumber(data?.engagementsCount ?? 0),
          appointmentsSetCount: toNumber(data?.appointmentsSetCount ?? 0),
          appointmentsHeldCount: toNumber(data?.appointmentsHeldCount ?? 0),
          contractsWrittenCount: toNumber(data?.contractsWrittenCount ?? 0),
        };

        setFormData(next);
      } catch (err: any) {
        console.error('Failed to load daily activity', err);
        setError(err?.message || 'Failed to load daily activity');
        setFormData(EMPTY);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, dateStr]);

  // ---------------------------
  // Save Daily Activity
  // ---------------------------
  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/daily-activity`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: dateStr,
          callsCount: formData.callsCount,
          engagementsCount: formData.engagementsCount,
          appointmentsSetCount: formData.appointmentsSetCount,
          appointmentsHeldCount: formData.appointmentsHeldCount,
          contractsWrittenCount: formData.contractsWrittenCount,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to save daily activity');
      }

      setSaveMessage('Saved.');
    } catch (err: any) {
      console.error('Failed to save daily activity', err);
      setError(err?.message || 'Failed to save daily activity');
    } finally {
      setSaving(false);
    }
  };

  if (userLoading || loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Tracker — {dateStr}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Optional date input (keep if you want, remove if not) */}
          {/* <Input
            type="date"
            value={dateStr}
            onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
          /> */}

          <Input
            type="number"
            placeholder="Calls"
            value={formData.callsCount}
            onChange={(e) => setFormData((p) => ({ ...p, callsCount: toNumber(e.target.value) }))}
          />

          <Input
            type="number"
            placeholder="Engagements"
            value={formData.engagementsCount}
            onChange={(e) => setFormData((p) => ({ ...p, engagementsCount: toNumber(e.target.value) }))}
          />

          <Input
            type="number"
            placeholder="Appointments Set"
            value={formData.appointmentsSetCount}
            onChange={(e) => setFormData((p) => ({ ...p, appointmentsSetCount: toNumber(e.target.value) }))}
          />

          <Input
            type="number"
            placeholder="Appointments Held"
            value={formData.appointmentsHeldCount}
            onChange={(e) => setFormData((p) => ({ ...p, appointmentsHeldCount: toNumber(e.target.value) }))}
          />

          <Input
            type="number"
            placeholder="Contracts Written"
            value={formData.contractsWrittenCount}
            onChange={(e) => setFormData((p) => ({ ...p, contractsWrittenCount: toNumber(e.target.value) }))}
          />

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Daily Log'}
            </Button>
            {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
