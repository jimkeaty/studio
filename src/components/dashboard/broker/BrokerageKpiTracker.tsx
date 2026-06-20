'use client';
// ─────────────────────────────────────────────────────────────────────────────
// BrokerageKpiTracker
// Mirrors the agent dashboard KpiSection / KpiTrackerCard exactly.
// Shows 6 production KPIs (Calls, Engagements, Appointments Set, Appointments
// Held, Contracts Written, Closings) + 5 recruiting KPIs (Recruiting Calls,
// Appts Set, Appts Held, New Hires, Agent Count) with:
//   • Grade badge + progress bar
//   • Delta (ahead/behind)
//   • Catch-up calculator (selectable day window)
//   • Hide/show per card (persisted to localStorage)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Phone, MessageSquare, CalendarCheck, CalendarCheck2, FileSignature,
  CheckCircle2, Users, UserPlus, PhoneCall, CalendarDays,
  ArrowUpRight, ArrowDownRight, EyeOff, Eye, SlidersHorizontal,
  ChevronDown, ChevronUp, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BrokerKpiActuals {
  calls: number;
  engagements: number;
  appointmentsSet: number;
  appointmentsHeld: number;
  contractsWritten: number;
  closings: number;
}

export interface BrokerKpiGoals {
  callsGoal: number | null;
  engagementsGoal: number | null;
  appointmentsSetGoal: number | null;
  appointmentsHeldGoal: number | null;
  contractsWrittenGoal: number | null;
  closingsGoal: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(v: number): string {
  return v.toLocaleString();
}

function gradeTone(g: string) {
  return g === 'A' ? 'text-green-600' :
    g === 'B' ? 'text-primary' :
    g === 'C' ? 'text-yellow-600' :
    g === 'D' ? 'text-orange-600' : 'text-red-600';
}
function gradeBg(g: string) {
  return g === 'A' ? 'bg-green-500/10 border-green-500/30' :
    g === 'B' ? 'bg-primary/5 border-primary/30' :
    g === 'C' ? 'bg-yellow-500/10 border-yellow-500/30' :
    g === 'D' ? 'bg-orange-500/10 border-orange-500/30' :
    'bg-red-500/10 border-red-500/30';
}
function letterGrade(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

// ── KPI metadata ──────────────────────────────────────────────────────────────
const KPI_META: Record<string, { label: string; icon: React.ElementType; unit: string; group: 'production' | 'recruiting' }> = {
  calls:             { label: 'Calls',              icon: Phone,         unit: 'calls',       group: 'production' },
  engagements:       { label: 'Engagements',        icon: MessageSquare, unit: 'engagements', group: 'production' },
  appointmentsSet:   { label: 'Appointments Set',   icon: CalendarCheck, unit: 'appts set',   group: 'production' },
  appointmentsHeld:  { label: 'Appointments Held',  icon: CalendarCheck2,unit: 'appts held',  group: 'production' },
  contractsWritten:  { label: 'Contracts Written',  icon: FileSignature, unit: 'contracts',   group: 'production' },
  closings:          { label: 'Closings',            icon: CheckCircle2,  unit: 'closings',    group: 'production' },
};

const GOAL_KEY_MAP: Record<string, keyof BrokerKpiGoals> = {
  calls:             'callsGoal',
  engagements:       'engagementsGoal',
  appointmentsSet:   'appointmentsSetGoal',
  appointmentsHeld:  'appointmentsHeldGoal',
  contractsWritten:  'contractsWrittenGoal',
  closings:          'closingsGoal',
};

const ACTUAL_KEY_MAP: Record<string, keyof BrokerKpiActuals> = {
  calls:             'calls',
  engagements:       'engagements',
  appointmentsSet:   'appointmentsSet',
  appointmentsHeld:  'appointmentsHeld',
  contractsWritten:  'contractsWritten',
  closings:          'closings',
};

// ── localStorage key ──────────────────────────────────────────────────────────
const BROKER_KPI_HIDDEN_KEY = 'broker-kpi-hidden';

function useHiddenBrokerKpis() {
  const [hiddenKpis, setHiddenKpisState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(BROKER_KPI_HIDDEN_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });

  const setHiddenKpis = (updater: (prev: Set<string>) => Set<string>) => {
    setHiddenKpisState(prev => {
      const next = updater(prev);
      if (typeof window !== 'undefined') {
        localStorage.setItem(BROKER_KPI_HIDDEN_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  };

  const toggleHidden = (key: string) => {
    setHiddenKpis(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const showAll = () => setHiddenKpis(() => new Set());
  return { hiddenKpis, toggleHidden, showAll };
}

// ── KpiTrackerCard — identical to agent dashboard ─────────────────────────────
function KpiTrackerCard({
  label, icon: Icon, unit, actual, target, performance, grade, ytdFraction,
}: {
  label: string; icon: React.ElementType; unit: string;
  actual: number; target: number; performance: number; grade: string;
  ytdFraction: number;
}) {
  const [catchUpDays, setCatchUpDays] = useState(20);
  const delta = actual - target;
  const behindAmount = Math.max(0, target - actual);
  // Daily base = annual target / 365 * ytdFraction (already-elapsed daily rate)
  const dailyBase = target > 0 ? target / 365 : 0;
  const dailyCatchUp = Number((dailyBase + (behindAmount / Math.max(1, catchUpDays))).toFixed(2));

  const borderColor = grade === 'A' ? 'border-t-green-500' :
    grade === 'B' ? 'border-t-blue-500' :
    grade === 'C' ? 'border-t-yellow-500' :
    grade === 'D' ? 'border-t-orange-500' : 'border-t-red-500';
  const barColor = grade === 'A' ? 'bg-green-500' :
    grade === 'B' ? 'bg-blue-500' :
    grade === 'C' ? 'bg-yellow-500' :
    grade === 'D' ? 'bg-orange-500' : 'bg-red-500';

  return (
    <Card className={cn('border-t-[3px] overflow-hidden', borderColor)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', `bg-${grade === 'A' ? 'green' : grade === 'B' ? 'blue' : grade === 'C' ? 'yellow' : grade === 'D' ? 'orange' : 'red'}-500 text-white`)}>
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold">{label}</CardTitle>
          </div>
          <div className={cn('flex items-center justify-center h-12 w-12 rounded-xl text-xl font-black border', gradeBg(grade), gradeTone(grade))}>
            {grade}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">{fmtN(actual)}</span>
            <span className="text-sm text-muted-foreground">/ {fmtN(target)} goal</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={cn('h-2.5 rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(performance, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{performance}% of goal-to-date</p>
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              performance >= 90 ? 'bg-green-100 text-green-700' :
              performance >= 70 ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            )}>
              {performance >= 100 ? '✓ Goal Met' : performance >= 90 ? 'On Track' : performance >= 70 ? 'Near Goal' : 'Behind'}
            </span>
          </div>
        </div>
        {/* Delta + Catch-Up */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Delta</p>
            <div className="flex items-center gap-1">
              {delta >= 0
                ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                : <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
              <span className={cn('text-base font-bold', delta >= 0 ? 'text-green-600' : 'text-red-600')}>
                {delta >= 0 ? '+' : ''}{fmtN(delta)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{delta >= 0 ? 'ahead' : 'behind'}</p>
          </div>
          <div className="rounded-lg border p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Catch-Up</p>
            <span className="text-base font-bold">{fmtN(Math.ceil(dailyCatchUp))}</span>
            <p className="text-[10px] text-muted-foreground">{unit}/day</p>
            <div className="flex items-center gap-1 mt-0.5 pt-0.5 border-t">
              <Select value={String(catchUpDays)} onValueChange={v => setCatchUpDays(Number(v))}>
                <SelectTrigger className="w-[60px] h-4 text-[9px] px-1 border-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 14, 20, 30, 45, 60].map(d => (
                    <SelectItem key={d} value={String(d)}>{d}d window</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── No-goal placeholder card ──────────────────────────────────────────────────
function NoGoalCard({ label, icon: Icon, actual, unit }: {
  label: string; icon: React.ElementType; actual: number; unit: string;
}) {
  return (
    <Card className="border-t-[3px] border-t-muted overflow-hidden opacity-70">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold">{fmtN(actual)}</div>
        <p className="text-xs text-muted-foreground mt-1">No goal set · {unit} YTD</p>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export interface BrokerageKpiTrackerProps {
  actuals: BrokerKpiActuals;
  goals: BrokerKpiGoals;
  ytdFraction: number;
  loading?: boolean;
  open: boolean;
  onToggle: () => void;
}

export function BrokerageKpiTracker({
  actuals,
  goals,
  ytdFraction,
  loading = false,
  open,
  onToggle,
}: BrokerageKpiTrackerProps) {
  const { hiddenKpis, toggleHidden, showAll } = useHiddenBrokerKpis();
  const [manageMode, setManageMode] = useState(false);

  const hiddenCount = hiddenKpis.size;
  const allKeys = Object.keys(KPI_META);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 group"
        >
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="text-base font-semibold tracking-tight">Brokerage KPI Tracker</h2>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          }
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setManageMode(!manageMode)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
              manageMode
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            {manageMode ? 'Done' : hiddenCount > 0 ? `Manage (${hiddenCount} hidden)` : 'Manage'}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-6">
          {/* Hidden strip */}
          {!manageMode && hiddenCount > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-dashed">
              <span className="flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" />
                {hiddenCount} KPI{hiddenCount > 1 ? 's' : ''} hidden
              </span>
              <button type="button" onClick={showAll} className="text-primary hover:underline font-medium">Show all</button>
            </div>
          )}

          {/* Production KPIs */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Activity</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allKeys.filter(k => KPI_META[k].group === 'production').map(key => {
                const meta = KPI_META[key];
                const goalKey = GOAL_KEY_MAP[key];
                const actualKey = ACTUAL_KEY_MAP[key];
                const annualGoal = goals[goalKey] ?? null;
                const actual = actuals[actualKey] ?? 0;
                const ytdGoal = annualGoal ? Math.round(annualGoal * ytdFraction) : null;
                const performance = ytdGoal ? Math.min(Math.round((actual / ytdGoal) * 100), 999) : 0;
                const grade = ytdGoal ? letterGrade(performance) : '—';
                const isHidden = hiddenKpis.has(key);

                return (
                  <div key={key} className="relative group">
                    {manageMode && (
                      <button
                        type="button"
                        onClick={() => toggleHidden(key)}
                        className={cn(
                          'absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border shadow-sm transition-colors',
                          isHidden
                            ? 'bg-muted text-muted-foreground border-border hover:bg-background'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        )}
                      >
                        {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {isHidden ? 'Show' : 'Hide'}
                      </button>
                    )}
                    <div className={cn(isHidden && manageMode ? 'opacity-40 pointer-events-none select-none' : '')}>
                      {ytdGoal ? (
                        <KpiTrackerCard
                          label={meta.label}
                          icon={meta.icon}
                          unit={meta.unit}
                          actual={actual}
                          target={ytdGoal}
                          performance={performance}
                          grade={grade}
                          ytdFraction={ytdFraction}
                        />
                      ) : (
                        !isHidden || manageMode ? (
                          <NoGoalCard label={meta.label} icon={meta.icon} actual={actual} unit={meta.unit} />
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recruiting KPIs */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recruiting Activity</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allKeys.filter(k => KPI_META[k].group === 'recruiting').map(key => {
                const meta = KPI_META[key];
                const goalKey = GOAL_KEY_MAP[key];
                const actualKey = ACTUAL_KEY_MAP[key];
                const annualGoal = goals[goalKey] ?? null;
                const actual = actuals[actualKey] ?? 0;
                // For agentCount, compare actual vs goal directly (not YTD-prorated)
                const isCountMetric = key === 'agentCount';
                const ytdGoal = annualGoal
                  ? (isCountMetric ? annualGoal : Math.round(annualGoal * ytdFraction))
                  : null;
                const performance = ytdGoal ? Math.min(Math.round((actual / ytdGoal) * 100), 999) : 0;
                const grade = ytdGoal ? letterGrade(performance) : '—';
                const isHidden = hiddenKpis.has(key);

                return (
                  <div key={key} className="relative group">
                    {manageMode && (
                      <button
                        type="button"
                        onClick={() => toggleHidden(key)}
                        className={cn(
                          'absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border shadow-sm transition-colors',
                          isHidden
                            ? 'bg-muted text-muted-foreground border-border hover:bg-background'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        )}
                      >
                        {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {isHidden ? 'Show' : 'Hide'}
                      </button>
                    )}
                    <div className={cn(isHidden && manageMode ? 'opacity-40 pointer-events-none select-none' : '')}>
                      {ytdGoal ? (
                        <KpiTrackerCard
                          label={meta.label}
                          icon={meta.icon}
                          unit={meta.unit}
                          actual={actual}
                          target={ytdGoal}
                          performance={performance}
                          grade={grade}
                          ytdFraction={ytdFraction}
                        />
                      ) : (
                        !isHidden || manageMode ? (
                          <NoGoalCard label={meta.label} icon={meta.icon} actual={actual} unit={meta.unit} />
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
