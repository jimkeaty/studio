'use client';

import { CalendarDays, Phone, UserMinus, UserPlus, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type RecruitingOperationsListViewProps = {
  year: number;
  activeAgents: number;
  newHires: number;
  departures: number;
  pipelineCount: number;
  metricMonths: any[];
  activeAgentMonths: any[];
};

function displayNumber(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : '—';
}

function varianceLabel(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

function SummaryItem({ label, value, detail, icon: Icon }: {
  label: string;
  value: number;
  detail: string;
  icon: React.ElementType;
}) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 last:pr-0 sm:border-r sm:last:border-r-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums">{displayNumber(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * A chart-free operational view for admins and staff who prefer a concise list
 * of recruiting and active-agent data over graphical reports.
 */
export function RecruitingOperationsListView({
  year,
  activeAgents,
  newHires,
  departures,
  pipelineCount,
  metricMonths,
  activeAgentMonths,
}: RecruitingOperationsListViewProps) {
  const metricsByMonth = new Map(
    metricMonths.map((month: any, index: number) => [
      month.ym ?? `${year}-${String(month.month ?? index + 1).padStart(2, '0')}`,
      month,
    ])
  );

  const rows = (activeAgentMonths.length ? activeAgentMonths : metricMonths).map((activeMonth: any, index: number) => {
    const monthKey = activeMonth.ym ?? `${year}-${String(activeMonth.month ?? index + 1).padStart(2, '0')}`;
    const metrics = metricsByMonth.get(monthKey) ?? metricMonths[index] ?? {};
    const actual = Number(activeMonth.totalActive ?? activeMonth.activeAgents ?? metrics.activeAgents ?? 0);
    const goalValue = activeMonth.goal ?? activeMonth.activeAgentsGoal ?? null;
    const goal = goalValue === null || goalValue === undefined ? null : Number(goalValue);

    return {
      key: monthKey,
      label: activeMonth.label ?? metrics.label ?? monthKey,
      actual,
      goal,
      variance: goal === null || !Number.isFinite(goal) ? null : actual - goal,
      newHires: Number(metrics.newHires ?? 0),
      departures: Number(metrics.autoDepartures ?? metrics.departures ?? 0),
      calls: Number(metrics.prospectCalls ?? 0),
      interviewsSet: Number(metrics.interviewsSet ?? 0),
      interviewsHeld: Number(metrics.interviewsHeld ?? 0),
      isFuture: Boolean(activeMonth.isFuture ?? metrics.isFuture),
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarDays className="h-5 w-5 text-primary" />
            Staff &amp; Admin List View
          </CardTitle>
          <CardDescription>
            A cleaner operational summary for reviewing current recruiting and agent-count data without charts, chats, or progress rings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 pt-3 sm:grid-cols-4 sm:divide-x">
          <SummaryItem label="Active agents" value={activeAgents} detail="Current active roster" icon={Users} />
          <SummaryItem label="New hires" value={newHires} detail={`Year to date · ${year}`} icon={UserPlus} />
          <SummaryItem label="Departures" value={departures} detail={`Year to date · ${year}`} icon={UserMinus} />
          <SummaryItem label="Open pipeline" value={pipelineCount} detail="Scheduled and in-process recruits" icon={Phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Monthly Agent &amp; Recruiting Summary</CardTitle>
          <CardDescription>
            A month-by-month operating list. Active-agent counts exclude profiles marked Inactive.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Goal</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Hires</TableHead>
                  <TableHead className="text-right">Departures</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Interviews Set</TableHead>
                  <TableHead className="text-right">Interviews Held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.key} className={row.isFuture ? 'text-muted-foreground bg-muted/20' : ''}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{displayNumber(row.actual)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.goal === null ? '—' : displayNumber(row.goal)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${row.variance !== null && row.variance < 0 ? 'text-red-600' : row.variance !== null && row.variance > 0 ? 'text-green-600' : ''}`}>
                      {varianceLabel(row.variance)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{displayNumber(row.newHires)}</TableCell>
                    <TableCell className="text-right tabular-nums">{displayNumber(row.departures)}</TableCell>
                    <TableCell className="text-right tabular-nums">{displayNumber(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{displayNumber(row.interviewsSet)}</TableCell>
                    <TableCell className="text-right tabular-nums">{displayNumber(row.interviewsHeld)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
