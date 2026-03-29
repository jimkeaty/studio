'use client';
// src/components/dashboard/agent/ActivityHistoryCard.tsx
// Agent activity history card — shows imported daily activity data
// with daily / weekly / monthly rollup options.

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Phone, Users, Calendar, FileSignature } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ActivityRollupBucket, ActivityRollupPeriod } from '@/lib/types/activityTracking';

// ─────────────────────────────────────────────────────────────────────────────
interface HistoryApiResponse {
  ok: boolean;
  agentId: string;
  year: number;
  period: ActivityRollupPeriod;
  buckets: ActivityRollupBucket[];
  totals: Omit<ActivityRollupBucket, 'label' | 'date'>;
  recordCount: number;
  availableYears: number[];
  error?: string;
}

interface ActivityHistoryCardProps {
  /** Override the logged-in user's agentId (admin view-as) */
  agentId?: string;
}

type MetricGroup = 'prospecting' | 'appointments' | 'contracts';

const COLORS = {
  calls: '#3b82f6',
  spokeTo: '#8b5cf6',
  listingApptsSet: '#f59e0b',
  listingApptsHeld: '#d97706',
  listingContractsSigned: '#10b981',
  buyerApptsSet: '#06b6d4',
  buyerApptsHeld: '#0891b2',
  buyerContractsSigned: '#0d9488',
};

// ─────────────────────────────────────────────────────────────────────────────
export function ActivityHistoryCard({ agentId }: ActivityHistoryCardProps) {
  const { user } = useUser();

  const [period, setPeriod] = useState<ActivityRollupPeriod>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [group, setGroup] = useState<MetricGroup>('prospecting');
  const [data, setData] = useState<HistoryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        period,
        year: String(year),
        ...(agentId ? { agentId } : {}),
      });
      const res = await fetch(`/api/agent/activity-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: HistoryApiResponse = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Could not load activity history');
    } finally {
      setLoading(false);
    }
  }, [user, period, year, agentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-500">{error}</CardContent>
      </Card>
    );
  }

  if (!data || data.recordCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
          <CardDescription>No imported activity data found for {year}.</CardDescription>
        </CardHeader>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Activity data can be imported by an admin via the{' '}
          <strong>Bulk Activity Import</strong> tool.
        </CardContent>
      </Card>
    );
  }

  const { buckets, totals, availableYears } = data;

  // Build chart data per metric group
  const chartBars: { key: keyof typeof COLORS; name: string }[][] = [
    // prospecting
    [
      { key: 'calls', name: 'Calls' },
      { key: 'spokeTo', name: 'Spoke To' },
    ],
    // appointments
    [
      { key: 'listingApptsSet', name: 'Listing Set' },
      { key: 'listingApptsHeld', name: 'Listing Held' },
      { key: 'buyerApptsSet', name: 'Buyer Set' },
      { key: 'buyerApptsHeld', name: 'Buyer Held' },
    ],
    // contracts
    [
      { key: 'listingContractsSigned', name: 'Listing Contracts' },
      { key: 'buyerContractsSigned', name: 'Buyer Contracts' },
    ],
  ];

  const groupIndex: Record<MetricGroup, number> = {
    prospecting: 0,
    appointments: 1,
    contracts: 2,
  };

  const activeBars = chartBars[groupIndex[group]];

  // KPI stat tiles
  const stats = [
    {
      icon: Phone,
      label: 'Total Calls',
      value: totals.calls,
      sub: `${totals.spokeTo} spoke to`,
    },
    {
      icon: Calendar,
      label: 'Listing Appts',
      value: totals.listingApptsSet,
      sub: `${totals.listingApptsHeld} held`,
    },
    {
      icon: Calendar,
      label: 'Buyer Appts',
      value: totals.buyerApptsSet,
      sub: `${totals.buyerApptsHeld} held`,
    },
    {
      icon: FileSignature,
      label: 'Contracts Signed',
      value: totals.listingContractsSigned + totals.buyerContractsSigned,
      sub: `${totals.listingContractsSigned}L + ${totals.buyerContractsSigned}B`,
    },
  ];

  // Available years for the selector (always include current year)
  const yearOptions = [...new Set([year, ...availableYears])].sort((a, b) => b - a);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Activity History</CardTitle>
            <CardDescription>Imported activity tracking data</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Year selector */}
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period selector */}
            <Select value={period} onValueChange={v => setPeriod(v as ActivityRollupPeriod)}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <s.icon className="h-3 w-3" />
                {s.label}
              </div>
              <div className="text-2xl font-bold">{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Metric group selector */}
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { id: 'prospecting', label: 'Prospecting', icon: Phone },
              { id: 'appointments', label: 'Appointments', icon: Users },
              { id: 'contracts', label: 'Contracts', icon: FileSignature },
            ] as { id: MetricGroup; label: string; icon: React.ElementType }[]
          ).map(g => (
            <Button
              key={g.id}
              size="sm"
              variant={group === g.id ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setGroup(g.id)}
            >
              <g.icon className="mr-1.5 h-3 w-3" />
              {g.label}
            </Button>
          ))}
          <Badge variant="outline" className="ml-auto self-center text-xs font-normal">
            {data.recordCount} record{data.recordCount !== 1 ? 's' : ''} · {period}
          </Badge>
        </div>

        {/* Bar chart */}
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={period === 'daily' && buckets.length > 30 ? Math.floor(buckets.length / 15) : 0}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {activeBars.map(bar => (
              <Bar
                key={bar.key}
                dataKey={bar.key}
                name={bar.name}
                fill={COLORS[bar.key]}
                radius={[2, 2, 0, 0]}
                maxBarSize={40}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
