'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics } from '@/lib/types';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { YtdValueMetricsCard } from '@/components/dashboard/YtdValueMetricsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  Target,
  TrendingUp,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { RecruitingIncentiveTracker } from '@/components/dashboard/agent/RecruitingIncentiveTracker';
import { AgentIncomeByMonthCard } from '@/components/dashboard/agent/AgentIncomeByMonthCard';
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

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function gradeTone(grade: string) {
  switch (grade) {
    case 'A':
      return 'text-green-600';
    case 'B':
      return 'text-primary';
    case 'C':
      return 'text-yellow-600';
    case 'D':
      return 'text-orange-600';
    default:
      return 'text-red-600';
  }
}

const StatCard = ({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  description?: string;
}) => (
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

const SummaryCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accentClassName,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  accentClassName?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className={`text-3xl font-bold ${accentClassName ?? ''}`}>{value}</div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
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

  const year = new Date().getFullYear();

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

  const { dashboard, plan, ytdMetrics } = data;
  const kpis = Object.entries(dashboard.kpis || {});

  const effectiveStartLabel = useMemo(() => {
    if (!dashboard.effectiveStartDate) return 'Jan 1';
    const d = new Date(`${dashboard.effectiveStartDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dashboard.effectiveStartDate;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [dashboard.effectiveStartDate]);

  const incomeDelta = dashboard.incomeDeltaToGoal ?? 0;
  const engagementDelta = dashboard.engagementDelta ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground">Your performance summary for {year}.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <SummaryCard
          title="Income Grade"
          value={dashboard.incomeGrade}
          subtitle="Based on earned income vs pace goal"
          icon={DollarSign}
          accentClassName={gradeTone(dashboard.incomeGrade)}
        />

        <SummaryCard
          title="Pipeline Projection"
          value={dashboard.pipelineAdjustedIncome.grade}
          subtitle="If pending transactions close"
          icon={TrendingUp}
          accentClassName={gradeTone(dashboard.pipelineAdjustedIncome.grade)}
        />

        <SummaryCard
          title="Lead Indicators"
          value={dashboard.leadIndicatorGrade}
          subtitle={`${dashboard.leadIndicatorPerformance}% of engagement goal`}
          icon={Target}
          accentClassName={gradeTone(dashboard.leadIndicatorGrade)}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Income Grade vs Goal"
          value={dashboard.incomeGrade}
          subtitle={`${formatCurrency(dashboard.netEarned)} earned against ${formatCurrency(dashboard.expectedYTDIncomeGoal)} pace goal`}
          icon={Gauge}
          accentClassName={gradeTone(dashboard.incomeGrade)}
        />
        <SummaryCard
          title="Projected Grade with Pending"
          value={dashboard.pipelineAdjustedIncome.grade}
          subtitle={`${formatCurrency(dashboard.ytdTotalPotential)} total potential if pending closes`}
          icon={TrendingUp}
          accentClassName={gradeTone(dashboard.pipelineAdjustedIncome.grade)}
        />
        <SummaryCard
          title="Effective Start Date"
          value={effectiveStartLabel}
          subtitle="Prorated pacing begins from this date through Dec 31"
          icon={CalendarDays}
        />
        <SummaryCard
          title="Engagements YTD vs Goal"
          value={`${formatNumber(dashboard.kpis.engagements.actual)} / ${formatNumber(dashboard.engagementGoalToDate ?? dashboard.kpis.engagements.target)}`}
          subtitle={`${dashboard.leadIndicatorPerformance}% of goal-to-date`}
          icon={Target}
          accentClassName={gradeTone(dashboard.leadIndicatorGrade)}
        />
        <SummaryCard
          title="Engagement Delta"
          value={engagementDelta >= 0 ? `+${formatNumber(engagementDelta)}` : formatNumber(engagementDelta)}
          subtitle={engagementDelta >= 0 ? 'Ahead of engagement goal-to-date' : 'Behind engagement goal-to-date'}
          icon={engagementDelta >= 0 ? ArrowUpRight : ArrowDownRight}
          accentClassName={engagementDelta >= 0 ? 'text-green-600' : 'text-red-600'}
        />
        <SummaryCard
          title="Catch-Up Daily Target"
          value={formatNumber(dashboard.catchUpDailyRequired ?? 0)}
          subtitle={`Based on a ${dashboard.catchUpWindowDays ?? 20}-workday catch-up window`}
          icon={Target}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Net Earned (YTD)"
          value={formatCurrency(dashboard.netEarned)}
          icon={DollarSign}
          description={incomeDelta >= 0 ? `Ahead of pace by ${formatCurrency(incomeDelta)}` : `Behind pace by ${formatCurrency(Math.abs(incomeDelta))}`}
        />
        <StatCard
          title="Net Pending"
          value={formatCurrency(dashboard.netPending)}
          icon={TrendingUp}
          description="Expected net commission in pipeline"
        />
        <StatCard
          title="YTD Income Goal"
          value={formatCurrency(dashboard.expectedYTDIncomeGoal)}
          icon={Target}
          description="Prorated workday-paced goal"
        />
        <StatCard
          title="YTD Total Potential"
          value={formatCurrency(dashboard.ytdTotalPotential)}
          icon={DollarSign}
          description="Closed + pending net commission"
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
        <AgentIncomeByMonthCard year={year} dashboard={dashboard} plan={plan} />
        <RecruitingIncentiveTracker />
      </div>

      <YtdValueMetricsCard metrics={ytdMetrics} loading={false} error={null} />

      <TopAgents2025 year={year} />
    </div>
  );
}
