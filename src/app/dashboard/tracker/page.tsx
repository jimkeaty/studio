'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface DailyActivity {
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
}

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [formData, setFormData] = useState<DailyActivity>({
    callsCount: 0,
    engagementsCount: 0,
    appointmentsSetCount: 0,
    appointmentsHeldCount: 0,
    contractsWrittenCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // ---------------------------
  // Load Daily Activity
  // ---------------------------
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/daily-activity?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Failed to load daily activity');
        }

        setFormData({
          callsCount: json.dailyActivity.callsCount ?? 0,
          engagementsCount: json.dailyActivity.engagementsCount ?? 0,
          appointmentsSetCount: json.dailyActivity.appointmentsSetCount ?? 0,
          appointmentsHeldCount: json.dailyActivity.appointmentsHeldCount ?? 0,
          contractsWrittenCount: json.dailyActivity.contractsWrittenCount ?? 0,
        });

        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load daily activity');
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
          calls: formData.callsCount,
          engagements: formData.engagementsCount,
          appointmentsSet: formData.appointmentsSetCount,
          appointmentsHeld: formData.appointmentsHeldCount,
          contractsWritten: formData.contractsWrittenCount,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to save daily activity');
      }

      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save daily activity');
    }
  };

  if (userLoading || loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Tracker — {dateStr}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <Input
            type="number"
            placeholder="Calls"
            value={formData.callsCount}
            onChange={(e) =>
              setFormData({ ...formData, callsCount: Number(e.target.value) })
            }
          />

          <Input
            type="number"
            placeholder="Engagements"
            value={formData.engagementsCount}
            onChange={(e) =>
              setFormData({ ...formData, engagementsCount: Number(e.target.value) })
            }
          />

          <Input
            type="number"
            placeholder="Appointments Set"
            value={formData.appointmentsSetCount}
            onChange={(e) =>
              setFormData({ ...formData, appointmentsSetCount: Number(e.target.value) })
            }
          />

          <Input
            type="number"
            placeholder="Appointments Held"
            value={formData.appointmentsHeldCount}
            onChange={(e) =>
              setFormData({ ...formData, appointmentsHeldCount: Number(e.target.value) })
            }
          />

          <Input
            type="number"
            placeholder="Contracts Written"
            value={formData.contractsWrittenCount}
            onChange={(e) =>
              setFormData({ ...formData, contractsWrittenCount: Number(e.target.value) })
            }
          />

          <Button onClick={handleSave}>Save Daily Log</Button>
        </CardContent>
      </Card>
    </div>
  );
}