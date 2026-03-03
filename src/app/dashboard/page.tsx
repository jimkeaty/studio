
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import type { AgentYearRollup } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, DollarSign, Home, TrendingUp, Link as LinkIcon } from 'lucide-react';
import TopAgents2025 from './TopAgents2025';

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
    <Skeleton className="h-96" />
  </div>
);

const StatCard = ({ title, value, icon: Icon, description }: { title: string; value: string; icon: React.ElementType; description?: string }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </CardContent>
  </Card>
);

interface ApiResponse {
  ok: boolean;
  needsLink?: boolean;
  year?: number;
  agentId?: string;
  rollupDocId?: string;
  rollup?: AgentYearRollup | null;
  error?: string;
}

export default function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per requirements, the dashboard is locked to 2026 for now.
  const year = 2026;

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/dashboard?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const responseData: ApiResponse = await res.json();
        
        if (!res.ok || !responseData.ok) {
          throw new Error(responseData.error || 'Failed to load dashboard data');
        }

        setData(responseData);
      } catch (err: any) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (!userLoading && user) {
      loadDashboard();
    } else if (!userLoading && !user) {
      setLoading(false);
    }
  }, [user, userLoading, year]);

  if (loading || userLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (data?.needsLink) {
    return (
       <Card className="max-w-2xl mx-auto mt-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-6 w-6 text-primary" />
            Account Linking Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your user account is not yet linked to an agent data profile.</p>
          <p className="mt-2 text-muted-foreground">Please contact your brokerage administrator to complete this setup. They will need your email address ({user?.email}).</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.rollup) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data Available for {year}</AlertTitle>
        <AlertDescription>
          A rollup document for your agent ID could not be found for {year}. Please contact support if you believe this is an error.
          {data?.rollupDocId && <code className="block mt-2 text-xs bg-muted p-2 rounded-md">Expected Doc ID: {data.rollupDocId}</code>}
        </AlertDescription>
      </Alert>
    );
  }

  const { rollup } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Closed Units (YTD)"
          value={(rollup.closed || 0).toLocaleString()}
          icon={Home}
        />
        <StatCard
          title="Pending Units"
          value={(rollup.pending || 0).toLocaleString()}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Transactions"
          value={(rollup.totals?.transactions || 0).toLocaleString()}
          icon={DollarSign}
          description="Closed + Pending"
        />
      </div>

       <div className="fixed bottom-2 left-2 z-50 rounded-md border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow">
          Data Source: {data.rollupDocId}
       </div>
      
      {/* For now, we will show the 2025 leaderboard on the 2026 page as there is no 2026 data */}
      <TopAgents2025 year={2025} />

    </div>
  );
}
