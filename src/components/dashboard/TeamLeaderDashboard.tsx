'use client';

/**
 * TeamLeaderDashboard
 *
 * Full team dashboard for a team leader (e.g. Charles Ditch).
 * Mirrors the broker command team view and adds:
 *   - Team Member Report Cards (same as R&D, with goal setting)
 *   - Team Transactions List (admin-ledger style)
 *   - "View as Agent" selector (opens member's personal dashboard)
 *   - Today's Focus with inactive member alerts
 *   - Team Tier Progress
 *   - Team Leader Earnings breakdown
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, TrendingUp, DollarSign, BarChart3, Target, Clock,
  AlertTriangle, Bell, ExternalLink, ChevronDown, ChevronUp,
  Calendar, Home, CheckCircle2, XCircle, Flame, Award,
  ArrowUpRight, ArrowDownRight, UserCheck, Eye,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { TeamCommandDashboard } from '@/components/dashboard/TeamCommandDashboard';
import { TeamTransactionsLedger } from '@/components/dashboard/TeamTransactionsLedger';

// ── Types ────────────────────────────────────────────────────────────────────

interface MemberEarnings {
  agentId: string;
  agentName: string;
  closedCount: number;
  closedVolume: number;
  totalGCI: number;
  memberPaid: number;
  leaderRetained: number;
}

interface TeamLeaderEarnings {
  totalLeaderRetained: number;
  totalMemberPaid: number;
  totalGCI: number;
  memberBreakdown: MemberEarnings[];
}

interface TeamTransaction {
  id: string;
  agentId: string;
  agentName: string;
  address: string;
  status: string;
  dealValue: number;
  agentNetCommission: number;
  grossCommission: number;
  leaderRetained: number;
  closedDate: string | null;
  contractDate: string | null;
  transactionType: string | null;
}

interface InactiveMemberAlert {
  agentId: string;
  agentName: string;
  daysSinceLastActivity: number | null;
  lastClosedDate: string | null;
  closedCountThisYear: number;
}

interface AgentRosterRow {
  agentId: string;
  displayName: string;
  teamName: string | null;
  teamId: string | null;
  teamRole: string | null;
  agentStatus: string | null;
  startDate: string | null;
  isGracePeriod: boolean;
  gracePeriodDaysElapsed: number | null;
  gracePeriodDaysRemaining: number | null;
  gracePeriodMonth: number | null;
  hasFirstDeal: boolean;
  graceStatus: string;
  engagementsActual: number;
  engagementsGoal: number;
  engagementsDelta: number;
  engagementsPerf: number;
  engagementsGrade: string;
  appointmentsHeldActual: number;
  appointmentsHeldGoal: number;
  appointmentsDelta: number;
  appointmentsPerf: number;
  appointmentsGrade: string;
  incomeActual: number;
  incomeGoal: number;
  incomeDelta: number;
  incomePerf: number;
  incomeGrade: string;
  incomePipelineActual: number;
  incomePipelinePerf: number;
  incomePipelineGrade: string;
  closedDeals: number;
  pendingDeals: number;
  closedVolume: number;
  pendingVolume: number;
  annualIncomeGoal: number;
}

interface TeamDashboardData {
  overview: any;
  agentView: {
    view: string;
    viewLabel: string;
    isTeamLeader: boolean;
    availableTeams: { teamId: string; teamName: string }[];
    goalSegment: string;
  };
  teamLeaderEarnings?: TeamLeaderEarnings | null;
  teamTransactions?: TeamTransaction[];
  inactiveMemberAlerts?: InactiveMemberAlert[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

function gradeColor(g: string) {
  if (g === 'A+' || g === 'A') return 'text-emerald-600';
  if (g === 'B') return 'text-blue-600';
  if (g === 'C') return 'text-amber-600';
  return 'text-red-600';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    closed: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-amber-100 text-amber-800',
    under_contract: 'bg-blue-100 text-blue-800',
    active: 'bg-sky-100 text-sky-800',
    canceled: 'bg-red-100 text-red-800',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MM/dd/yy'); } catch { return d; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ title, value, subtitle, icon: Icon, highlight }: {
  title: string; value: string; subtitle: string; icon: React.ElementType; highlight?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-lg border p-4 space-y-1',
      highlight ? 'border-primary/50 bg-primary/5' : 'bg-muted/20',
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold">{title}</span>
      {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
    </div>
  );
}

// ── Today's Focus ─────────────────────────────────────────────────────────────

function TodaysFocusSection({ teamData, inactiveAlerts }: {
  teamData: TeamDashboardData;
  inactiveAlerts: InactiveMemberAlert[];
}) {
  const txList = teamData.teamTransactions ?? [];
  const today = new Date();
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcomingClosings = txList.filter(t => {
    if (t.status !== 'pending' && t.status !== 'under_contract') return false;
    if (!t.closedDate && !t.contractDate) return false;
    const d = new Date(t.closedDate ?? t.contractDate ?? '');
    return d >= today && d <= sevenDaysFromNow;
  });

  const pendingCount = txList.filter(t => t.status === 'pending' || t.status === 'under_contract').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" /> Today's Focus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inactive member alerts */}
        {inactiveAlerts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Members Needing Attention</span>
              <Badge className="bg-amber-200 text-amber-800 text-xs">{inactiveAlerts.length}</Badge>
            </div>
            <div className="space-y-1">
              {inactiveAlerts.map(a => (
                <div key={a.agentId} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-amber-900">{a.agentName}</span>
                  <span className="text-xs text-amber-700">
                    {a.daysSinceLastActivity === null
                      ? 'No activity on record'
                      : `${a.daysSinceLastActivity}d since last activity`}
                    {a.closedCountThisYear === 0 && ' · 0 closings this year'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming closings */}
        {upcomingClosings.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold">Closings in Next 7 Days</span>
              <Badge variant="secondary">{upcomingClosings.length}</Badge>
            </div>
            {upcomingClosings.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm rounded border p-2 bg-muted/20">
                <div>
                  <p className="font-medium">{t.address}</p>
                  <p className="text-xs text-muted-foreground">{t.agentName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium">{fmtDate(t.closedDate ?? t.contractDate)}</p>
                  <p className="text-xs text-muted-foreground">{fmtCompact(t.dealValue)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            No closings scheduled in the next 7 days
          </div>
        )}

        {/* Pending pipeline summary */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{pendingCount} pending / under contract across the team</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Team Transactions List ────────────────────────────────────────────────────

function TeamTransactionsList({ transactions }: { transactions: TeamTransaction[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [showCount, setShowCount] = useState(25);

  const agents = [...new Set(transactions.map(t => t.agentName))].sort();

  const filtered = transactions.filter(t => {
    if (search && !t.address.toLowerCase().includes(search.toLowerCase()) && !t.agentName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (agentFilter !== 'all' && t.agentName !== agentFilter) return false;
    return true;
  });

  const visible = filtered.slice(0, showCount);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search address or agent..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm flex-1 min-w-[180px]"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="under_contract">Under Contract</SelectItem>
            <SelectItem value="active">Active</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs">Agent</TableHead>
                <TableHead className="text-xs">Address</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs text-right">Volume</TableHead>
                <TableHead className="text-xs text-right">GCI</TableHead>
                <TableHead className="text-xs text-right">Agent Net</TableHead>
                <TableHead className="text-xs text-right">Leader Retained</TableHead>
                <TableHead className="text-xs text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : visible.map((t, idx) => (
                <TableRow key={t.id || idx} className={idx % 2 === 0 ? '' : 'bg-muted/10'}>
                  <TableCell className="text-sm font-medium">{t.agentName}</TableCell>
                  <TableCell className="text-sm">{t.address || '—'}</TableCell>
                  <TableCell>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusBadge(t.status))}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{t.transactionType ?? '—'}</TableCell>
                  <TableCell className="text-sm text-right">{fmtCompact(t.dealValue)}</TableCell>
                  <TableCell className="text-sm text-right">{fmtCompact(t.grossCommission)}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmtCompact(t.agentNetCommission)}</TableCell>
                  <TableCell className="text-sm text-right font-medium text-primary">
                    {t.leaderRetained > 0 ? fmtCompact(t.leaderRetained) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {fmtDate(t.closedDate ?? t.contractDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {filtered.length > showCount && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowCount(c => c + 25)}>
            Show more ({filtered.length - showCount} remaining)
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        Showing {Math.min(showCount, filtered.length)} of {filtered.length} transactions
      </p>
    </div>
  );
}

// ── Member Report Cards ───────────────────────────────────────────────────────

function MemberReportCard({ agent, token, onViewAs }: {
  agent: AgentRosterRow;
  token: string;
  onViewAs: (agentId: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [annualGoal, setAnnualGoal] = useState(String(agent.annualIncomeGoal || ''));
  const [saving, setSaving] = useState(false);

  const incomeGrade = agent.incomeGrade;
  const engGrade = agent.engagementsGrade;
  const apptGrade = agent.appointmentsGrade;

  const overallGrade = (() => {
    const grades = [incomeGrade, engGrade, apptGrade].filter(Boolean);
    const order = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
    const worst = grades.reduce((w, g) => order.indexOf(g) > order.indexOf(w) ? g : w, 'A+');
    return worst;
  })();

  const saveGoal = async () => {
    if (!annualGoal || isNaN(Number(annualGoal))) return;
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const monthly = Math.round(Number(annualGoal) / 12);
      // Save each month
      for (let m = 1; m <= 12; m++) {
        await fetch('/api/broker/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            year, month: m,
            segment: `agent_${agent.agentId}`,
            grossMarginGoal: monthly,
          }),
        });
      }
      setEditingGoal(false);
    } catch { /* non-fatal */ }
    setSaving(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 bg-muted/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base truncate">{agent.displayName}</CardTitle>
              {agent.isGracePeriod && (
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Grace Period</Badge>
              )}
              <Badge variant="secondary" className="text-xs capitalize">{agent.agentStatus ?? 'active'}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent.closedDeals} closed · {agent.pendingDeals} pending
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn('text-3xl font-black leading-none', gradeColor(overallGrade))}>{overallGrade}</span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onViewAs(agent.agentId, agent.displayName)}
              title="View agent dashboard"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {/* Income progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Net Income</span>
            <span className={cn('font-semibold', gradeColor(incomeGrade))}>{incomeGrade}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{fmtCompact(agent.incomeActual)}</span>
            <span className="text-muted-foreground text-xs">/ {fmtCompact(agent.incomeGoal)} goal</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', agent.incomePerf >= 100 ? 'bg-emerald-500' : agent.incomePerf >= 70 ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${Math.min(100, agent.incomePerf)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Pipeline: {fmtCompact(agent.incomePipelineActual)} ({agent.incomePipelineGrade})
          </p>
        </div>

        {/* Engagements & Appointments */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border p-2 bg-muted/10 space-y-0.5">
            <p className="text-xs text-muted-foreground">Engagements</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{agent.engagementsActual}</span>
              <span className={cn('text-xs font-bold', gradeColor(engGrade))}>{engGrade}</span>
            </div>
            <p className="text-xs text-muted-foreground">Goal: {agent.engagementsGoal}</p>
          </div>
          <div className="rounded border p-2 bg-muted/10 space-y-0.5">
            <p className="text-xs text-muted-foreground">Appts Held</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{agent.appointmentsHeldActual}</span>
              <span className={cn('text-xs font-bold', gradeColor(apptGrade))}>{apptGrade}</span>
            </div>
            <p className="text-xs text-muted-foreground">Goal: {agent.appointmentsHeldGoal}</p>
          </div>
        </div>

        {/* Volume */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">Closed Volume</span>
          <span className="font-medium">{fmtCompact(agent.closedVolume)}</span>
        </div>

        {/* Goal setting */}
        <div className="border-t pt-2">
          {editingGoal ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={annualGoal}
                onChange={e => setAnnualGoal(e.target.value)}
                placeholder="Annual income goal"
                className="h-7 flex-1 rounded border border-input bg-background px-2 text-sm"
              />
              <Button size="sm" className="h-7 text-xs" onClick={saveGoal} disabled={saving}>
                {saving ? '...' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingGoal(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingGoal(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Target className="h-3 w-3" />
              {agent.annualIncomeGoal > 0 ? `Goal: ${fmtCompact(agent.annualIncomeGoal)} · Edit` : 'Set Annual Goal'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Leader Earnings Panel ─────────────────────────────────────────────────────

function LeaderEarningsPanel({ tle }: { tle: TeamLeaderEarnings }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs text-amber-700 font-medium">Total Leader Retained</p>
          <p className="text-xl font-bold text-amber-900">{fmt(tle.totalLeaderRetained)}</p>
          <p className="text-xs text-amber-600">My earnings from team deals</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground font-medium">Total Team GCI</p>
          <p className="text-xl font-bold">{fmt(tle.totalGCI)}</p>
          <p className="text-xs text-muted-foreground">Gross commission, all members</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground font-medium">Total Member Pay</p>
          <p className="text-xl font-bold">{fmt(tle.totalMemberPaid)}</p>
          <p className="text-xs text-muted-foreground">Paid out to team members</p>
        </div>
      </div>
      {tle.memberBreakdown.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member Earnings Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Agent</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Deals</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Volume</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">GCI</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Member Paid</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-amber-700">Leader Retained</th>
                </tr>
              </thead>
              <tbody>
                {tle.memberBreakdown.map((m, idx) => (
                  <tr key={m.agentId} className={idx % 2 === 0 ? '' : 'bg-muted/10'}>
                    <td className="px-4 py-2 font-medium">{m.agentName}</td>
                    <td className="px-4 py-2 text-right">{m.closedCount}</td>
                    <td className="px-4 py-2 text-right">{fmt(m.closedVolume)}</td>
                    <td className="px-4 py-2 text-right">{fmt(m.totalGCI)}</td>
                    <td className="px-4 py-2 text-right">{fmt(m.memberPaid)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-700">{fmt(m.leaderRetained)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold bg-amber-50/40">
                  <td className="px-4 py-2">Totals</td>
                  <td className="px-4 py-2 text-right">{tle.memberBreakdown.reduce((s, m) => s + m.closedCount, 0)}</td>
                  <td className="px-4 py-2 text-right">{fmt(tle.memberBreakdown.reduce((s, m) => s + m.closedVolume, 0))}</td>
                  <td className="px-4 py-2 text-right">{fmt(tle.totalGCI)}</td>
                  <td className="px-4 py-2 text-right">{fmt(tle.totalMemberPaid)}</td>
                  <td className="px-4 py-2 text-right text-amber-700">{fmt(tle.totalLeaderRetained)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TeamLeaderDashboard({
  teamData,
  teamLoading,
  teamError,
  year,
  setYear,
  viewAs,
}: {
  teamData: TeamDashboardData | null;
  teamLoading: boolean;
  teamError: string | null;
  year: number;
  setYear: (y: number) => void;
  viewAs?: string;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [rosterData, setRosterData] = useState<AgentRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Derive the leader's own teamId from teamData so we can scope the roster
  // fetch and apply a client-side safety filter as a belt-and-suspenders guard.
  const leaderTeamId = teamData?.agentView?.availableTeams?.[0]?.teamId ?? null;

  // Get auth token
  useEffect(() => {
    if (user) {
      user.getIdToken().then(setToken).catch(() => {});
    }
  }, [user]);

  // Fetch member report card data — scoped to this leader's team only
  const fetchRoster = useCallback(async () => {
    if (!token) return;
    setRosterLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (leaderTeamId) params.set('teamId', leaderTeamId);
      const res = await fetch(`/api/broker/agent-roster-metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Belt-and-suspenders: only render agents that belong to this leader's team
        const agents: AgentRosterRow[] = data.agents ?? [];
        const scoped = leaderTeamId
          ? agents.filter(a => a.teamId === leaderTeamId)
          : agents;
        setRosterData(scoped);
      }
    } catch { /* non-fatal */ }
    setRosterLoading(false);
  }, [token, year, leaderTeamId]);

  useEffect(() => {
    if (token) fetchRoster();
  }, [token, year, leaderTeamId, fetchRoster]);

  // View as agent handler — navigates to agent dashboard with viewAs params
  const handleViewAs = useCallback((agentId: string, name: string) => {
    router.push(`/dashboard?viewAs=${agentId}&viewAsName=${encodeURIComponent(name)}`);
  }, [router]);

  if (teamLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (teamError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Team data unavailable</AlertTitle>
        <AlertDescription>{teamError}</AlertDescription>
      </Alert>
    );
  }

  if (!teamData?.overview) return null;

  const { overview, agentView, teamLeaderEarnings, teamTransactions = [], inactiveMemberAlerts = [] } = teamData;
  const { totals } = overview;
  const teamName = agentView.viewLabel || 'My Team';

  const avgSalePrice = totals.closedCount > 0 ? totals.closedVolume / totals.closedCount : 0;
  const avgNetPerDeal = totals.closedCount > 0 ? totals.netIncome / totals.closedCount : 0;

  return (
    <div className="space-y-6">
      {/* ── Full Team Command Dashboard (charts, KPIs, goals, multi-year) ── */}
      <TeamCommandDashboard
        teamId={leaderTeamId ?? ''}
        teamName={teamName}
        rosterData={rosterData}
        useBrokerEndpoint={false}
        viewAs={viewAs}
      />

      {/* ── Today's Focus ── */}
      <TodaysFocusSection teamData={teamData} inactiveAlerts={inactiveMemberAlerts} />

      {/* ── Member Report Cards ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" /> Team Member Report Cards
            {rosterData.length > 0 && <Badge variant="secondary">{rosterData.length} members</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rosterLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}
            </div>
          ) : rosterData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No team member data available</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rosterData.map(agent => (
                <MemberReportCard
                  key={agent.agentId}
                  agent={agent}
                  token={token}
                  onViewAs={handleViewAs}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Team Transactions Ledger ── */}
      <TeamTransactionsLedger
        teamId={leaderTeamId ?? undefined}
        teamName={teamName}
        viewAs={viewAs}
      />
    </div>
  );
}
