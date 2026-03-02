
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics } from '@/lib/types';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { YtdValueMetricsCard } from '@/components/dashboard/YtdValueMetricsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, DollarSign, Target, TrendingUp } from 'lucide-react';
import { RecruitingIncentiveTracker } from '@/components/dashboard/agent/RecruitingIncentiveTracker';
import TopAgents2025 from './TopAgents2025';

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
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

export default function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<{
    dashboard: AgentDashboardData | null;
    plan: BusinessPlan | null;
    ytdMetrics: YtdValueMetrics | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per requirements, the dashboard is locked to 2025 for now.
  const year = 2025;

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

        if (!res.ok) {
          const errorData = await res.json();
          // Check for specific allowedYears error from API
          if (res.status === 400 && errorData.allowedYears) {
             throw new Error(`Data for year ${year} is not available. Allowed years: ${errorData.allowedYears.join(', ')}`);
          }
          throw new Error(errorData.error || 'Failed to load dashboard data');
        }

        const responseData = await res.json();
        if (!responseData.ok) {
          throw new Error(responseData.error || 'API returned an error');
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
      // If not logged in, the root page will handle the redirect.
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

  if (!data || !data.dashboard) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data Available</AlertTitle>
        <AlertDescription>
          Dashboard data for {year} could not be found for your account. Please check your business plan setup or contact support.
        </AlertDescription>
      </Alert>
    );
  }

  const { dashboard, ytdMetrics } = data;
  const kpis = Object.entries(dashboard.kpis || {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Net Earned (YTD)"
          value={dashboard.netEarned.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
          icon={DollarSign}
          description="Total commission earned"
        />
        <StatCard
          title="Net Pending"
          value={dashboard.netPending.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
          icon={TrendingUp}
          description="Commission in pipeline"
        />
        <StatCard
          title="YTD Income Goal"
          value={dashboard.expectedYTDIncomeGoal.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
          icon={Target}
          description="Workday-paced goal"
        />
        <StatCard
          title="YTD Total Potential"
          value={dashboard.ytdTotalPotential.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
          icon={DollarSign}
          description="Earned + Pending"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map(([key, kpi]) => (
          <KpiCard
            key={key}
            title={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
            actual={kpi.actual}
            target={kpi.target}
            performance={kpi.performance}
            grade={kpi.grade}
            isGracePeriod={dashboard.isLeadIndicatorGracePeriod}
          />
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <YtdValueMetricsCard metrics={ytdMetrics} loading={false} error={null} />
        <RecruitingIncentiveTracker />
      </div>

      <TopAgents2025 year={year} />

    </div>
  );
}
