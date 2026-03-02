"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useUser } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

type DailyActivity = {
  date: string;
  callsCount: number;
  engagementsCount: number;
  appointmentsSetCount: number;
  appointmentsHeldCount: number;
  contractsWrittenCount: number;
};

const emptyFor = (date: string): DailyActivity => ({
  date,
  callsCount: 0,
  engagementsCount: 0,
  appointmentsSetCount: 0,
  appointmentsHeldCount: 0,
  contractsWrittenCount: 0,
});

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);

  const [formData, setFormData] = useState<DailyActivity>(() => emptyFor(dateStr));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // keep state in sync when date changes
  useEffect(() => {
    setFormData(emptyFor(dateStr));
  }, [dateStr]);

  // Load daily activity via server route
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      setLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/daily-activity?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load daily activity");
        }

        const daily: DailyActivity = json.dailyActivity ?? emptyFor(dateStr);

        // harden numbers
        setFormData({
          date: daily.date ?? dateStr,
          callsCount: Number(daily.callsCount ?? 0) || 0,
          engagementsCount: Number(daily.engagementsCount ?? 0) || 0,
          appointmentsSetCount: Number(daily.appointmentsSetCount ?? 0) || 0,
          appointmentsHeldCount: Number(daily.appointmentsHeldCount ?? 0) || 0,
          contractsWrittenCount: Number(daily.contractsWrittenCount ?? 0) || 0,
        });
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load daily activity");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, dateStr]);

  // Save daily activity via server route
  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/daily-activity`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
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
        throw new Error(json?.error || "Failed to save daily activity");
      }

      // optional: refresh with server response
      const daily: DailyActivity = json.dailyActivity ?? formData;
      setFormData({
        date: daily.date ?? dateStr,
        callsCount: Number(daily.callsCount ?? 0) || 0,
        engagementsCount: Number(daily.engagementsCount ?? 0) || 0,
        appointmentsSetCount: Number(daily.appointmentsSetCount ?? 0) || 0,
        appointmentsHeldCount: Number(daily.appointmentsHeldCount ?? 0) || 0,
        contractsWrittenCount: Number(daily.contractsWrittenCount ?? 0) || 0,
        contractsWrittenCount: Number(daily.contractsWrittenCount ?? 0) || 0,
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to save daily activity");
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
          <Input
            type="number"
            placeholder="Calls"
            value={formData.callsCount}
            onChange={(e) => setFormData({ ...formData, callsCount: Number(e.target.value) || 0 })}
          />

          <Input
            type="number"
            placeholder="Engagements"
            value={formData.engagementsCount}
            onChange={(e) => setFormData({ ...formData, engagementsCount: Number(e.target.value) || 0 })}
          />

          <Input
            type="number"
            placeholder="Appointments Set"
            value={formData.appointmentsSetCount}
            onChange={(e) => setFormData({ ...formData, appointmentsSetCount: Number(e.target.value) || 0 })}
          />

          <Input
            type="number"
            placeholder="Appointments Held"
            value={formData.appointmentsHeldCount}
            onChange={(e) => setFormData({ ...formData, appointmentsHeldCount: Number(e.target.value) || 0 })}
          />

          <Input
            type="number"
            placeholder="Contracts Written"
            value={formData.contractsWrittenCount}
            onChange={(e) => setFormData({ ...formData, contractsWrittenCount: Number(e.target.value) || 0 })}
          />

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Daily Log"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}