'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import type { AgentDashboardData, BusinessPlan, YtdValueMetrics, Transaction, Opportunity } from '@/lib/types';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { YtdValueMetricsCard } from '@/components/dashboard/YtdValueMetricsCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  MapPin,
  FileCheck2,
  Clock,
} from 'lucide-react';
import { RecruitingIncentiveTracker } from '@/components/dashboard/agent/RecruitingIncentiveTracker';
import { AgentIncomeByMonthCard } from '@/components/dashboard/agent/AgentIncomeByMonthCard';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { differenceInDays, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';

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

const formatCurrencyLocal = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const getTimelineBucket = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  try {
    const days = differenceInDays(parseISO(dateStr), new Date());
    if (days < 0) return 'Past';
    if (days < 30) return 'Under 30 days';
    if (days < 60) return '30–60 days';
    if (days < 90) return '60–90 days';
    return '90+ days';
  } catch { return '—'; }
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
};

const txTypeLabel: Record<string, string> = {
  residential_sale: 'Residential',
  rental: 'Rental',
  commercial_lease: 'Commercial Lease',
  commercial_sale: 'Commercial Sale',
};

export default function AgentDashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<{
    dashboard: AgentDashboardData | null;
    plan: BusinessPlan | null;
    ytdMetrics: YtdValueMetrics | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

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

  // Load pipeline data (pending/closed transactions + opportunities)
  useEffect(() => {
    const loadPipeline = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/agent/pipeline?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setTransactions(data.transactions ?? []);
          setOpportunities(data.opportunities ?? []);
        }
      } catch (err) {
        console.error('[pipeline]', err);
      }
    };
    if (!userLoading && user) loadPipeline();
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

  const effectiveStartLabel = !dashboard.effectiveStartDate
    ? 'Jan 1'
    : (() => {
        const d = new Date(`${dashboard.effectiveStartDate}T00:00:00`);
        if (Number.isNaN(d.getTime())) return dashboard.effectiveStartDate;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      })();

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

      <AgentIncomeByMonthCard year={year} dashboard={dashboard} plan={plan} />

      <YtdValueMetricsCard metrics={ytdMetrics} loading={false} error={null} />

      {/* SECTION 5 — APPOINTMENTS & ACTIVE OPPORTUNITIES */}
      {(() => {
        const activeOpps = opportunities
          .filter(o => o.isActive)
          .sort((a, b) => (a.appointmentDate ?? '') < (b.appointmentDate ?? '') ? -1 : 1);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Appointments &amp; Active Opportunities</CardTitle>
              <CardDescription>Your current pipeline — sorted by appointment date.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeOpps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No active opportunities. They will appear here once added.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Appt Date</TableHead>
                      <TableHead>Price Range</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Timeline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeOpps.map((opp) => (
                      <TableRow key={opp.id}>
                        <TableCell className="font-medium">{opp.contactName}</TableCell>
                        <TableCell>{formatDate(opp.appointmentDate)}</TableCell>
                        <TableCell>
                          {opp.priceRangeLow && opp.priceRangeHigh
                            ? `${formatCurrencyLocal(opp.priceRangeLow)} – ${formatCurrencyLocal(opp.priceRangeHigh)}`
                            : opp.priceRangeLow ? `${formatCurrencyLocal(opp.priceRangeLow)}+` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            opp.stage === 'Hot' && 'bg-red-500/80 text-white',
                            opp.stage === 'Nurture' && 'bg-yellow-500/80 text-white',
                            opp.stage === 'Watch' && 'bg-blue-500/80 text-white',
                          )}>{opp.stage}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />{getTimelineBucket(opp.appointmentDate)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* SECTION 6 — PENDING / UNDER CONTRACT */}
      {(() => {
        const pending = transactions.filter(t => t.status === 'pending' || t.status === 'under_contract');
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Pending / Under Contract</CardTitle>
              <CardDescription>Deals in progress — not yet closed.</CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No pending transactions. Deals under contract will appear here.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Contract Date</TableHead>
                      <TableHead>Est. Close</TableHead>
                      <TableHead className="text-right">Deal Value</TableHead>
                      <TableHead className="text-right">Proj. Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((t) => {
                      const projNet = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.address}</TableCell>
                          <TableCell>{t.clientName ?? '—'}</TableCell>
                          <TableCell>{formatDate(t.contractDate)}</TableCell>
                          <TableCell>
                            <span className="text-sm">{formatDate(t.closedDate ?? t.closingDate)}</span>
                            {(t.closedDate || t.closingDate) && (
                              <span className="block text-xs text-muted-foreground">{getTimelineBucket(t.closedDate ?? t.closingDate)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{projNet ? formatCurrencyLocal(projNet) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* SECTION 7 — CLOSED TRANSACTIONS THIS YEAR */}
      {(() => {
        const closed = transactions
          .filter(t => t.status === 'closed' && (t.year === year || (t.closedDate ?? t.closingDate ?? '').startsWith(String(year))))
          .sort((a, b) => ((b.closedDate ?? b.closingDate ?? '') > (a.closedDate ?? a.closingDate ?? '') ? 1 : -1));
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Closed Transactions — {year}</CardTitle>
              <CardDescription>All transactions you closed this calendar year.</CardDescription>
            </CardHeader>
            <CardContent>
              {closed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No closed transactions for {year}.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Closed Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Deal Value</TableHead>
                      <TableHead className="text-right">Gross Comm.</TableHead>
                      <TableHead className="text-right">Net to Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closed.map((t) => {
                      const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                      const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.address}</TableCell>
                          <TableCell>{formatDate(t.closedDate ?? t.closingDate)}</TableCell>
                          <TableCell>
                            {t.transactionType ? (
                              <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{t.dealValue ? formatCurrencyLocal(t.dealValue) : '—'}</TableCell>
                          <TableCell className="text-right">{gross ? formatCurrencyLocal(gross) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{net ? formatCurrencyLocal(net) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* SECTION 8 — RECRUITING INCENTIVE TRACKER (moved to bottom per spec) */}
      <RecruitingIncentiveTracker />
    </div>
  );
}
