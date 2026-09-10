'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, CalendarPlus, ClipboardList, MessageSquare, Phone, Target } from 'lucide-react';
import { useUser } from '@/firebase';
import { addDays, centralParts, mondayFor } from '@/lib/attendance/rules';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type MetricKey = 'calls' | 'engagements' | 'appointmentsSet' | 'appointmentsHeld';
type ActivityRow = {
  callsCount?: number;
  engagementsCount?: number;
  appointmentsSetCount?: number;
  appointmentsHeldCount?: number;
};

type GoalCard = {
  key: MetricKey;
  label: string;
  period: 'Today' | 'This Week';
  goal: number | null;
  completed: number;
  href: string;
  icon: typeof Phone;
};

const count = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

function targetFor(target: any, cadence: 'daily' | 'weekly') {
  const direct = target?.[cadence];
  if (direct !== null && direct !== undefined && direct !== '' && Number.isFinite(Number(direct))) return Number(direct);
  const otherCadence = cadence === 'daily' ? target?.weekly : target?.daily;
  if (otherCadence !== null && otherCadence !== undefined && otherCadence !== '' && Number.isFinite(Number(otherCadence))) {
    return cadence === 'daily' ? Number(otherCadence) / 5 : Number(otherCadence) * 5;
  }
  return null;
}

function goalState(goal: number | null, completed: number) {
  if (goal === null) return { remaining: null, ahead: 0, met: false };
  const difference = completed - goal;
  return { remaining: Math.max(0, goal - completed), ahead: Math.max(0, difference), met: difference >= 0 };
}

export function TodaysGoals() {
  const { user } = useUser();
  const [cards, setCards] = useState<GoalCard[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const business = centralParts();
    const weekStart = mondayFor(business.date);
    const year = business.date.slice(0, 4);
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };
    const [planResponse, activityResponse] = await Promise.all([
      fetch(`/api/plan?year=${year}`, { headers }),
      fetch(`/api/daily-activity/range?start=${weekStart}&end=${business.date}`, { headers }),
    ]);
    if (!planResponse.ok || !activityResponse.ok) throw new Error('Unable to load today’s goals.');
    const [{ plan }, { activities }] = await Promise.all([planResponse.json(), activityResponse.json()]);
    const activitiesByDate = (activities && typeof activities === 'object' ? activities : {}) as Record<string, ActivityRow>;
    const daily: ActivityRow = activitiesByDate[business.date] || {};
    const weeklyHeld = Object.values(activitiesByDate).reduce((sum, activity) => sum + count(activity.appointmentsHeldCount), 0);
    const targets = plan?.calculatedTargets || {};

    setCards([
      { key: 'calls', label: 'Calls to Make Today', period: 'Today', goal: targetFor(targets.calls, 'daily'), completed: count(daily.callsCount), href: '/dashboard/tracker', icon: Phone },
      { key: 'engagements', label: 'Engagements for Today', period: 'Today', goal: targetFor(targets.engagements, 'daily'), completed: count(daily.engagementsCount), href: '/dashboard/tracker', icon: MessageSquare },
      { key: 'appointmentsSet', label: 'Appointments to Set Today', period: 'Today', goal: targetFor(targets.appointmentsSet, 'daily'), completed: count(daily.appointmentsSetCount), href: '/dashboard/tracker', icon: CalendarPlus },
      { key: 'appointmentsHeld', label: 'Appointments Held This Week', period: 'This Week', goal: targetFor(targets.appointmentsHeld, 'weekly'), completed: weeklyHeld, href: '/dashboard/tracker', icon: CalendarCheck2 },
    ]);
    setUpdatedAt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date()));
  }, [user]);

  useEffect(() => {
    void load().catch(() => setCards([]));
    const refresh = () => void load().catch(() => setCards([]));
    window.addEventListener('daily-activity-saved', refresh);
    return () => window.removeEventListener('daily-activity-saved', refresh);
  }, [load]);

  if (!cards) return <Card><CardContent className="p-4"><Skeleton className="h-36 w-full" /></CardContent></Card>;

  return (
    <section aria-labelledby="todays-goals-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 id="todays-goals-heading" className="flex items-center gap-2 text-xl font-bold text-foreground"><Target className="h-5 w-5 text-primary" />Today’s Goals</h2>
          <p className="text-sm text-muted-foreground">Your saved plan targets and qualifying activity for the current Central business day and week.</p>
        </div>
        {updatedAt && <p className="text-xs text-muted-foreground">Updated {updatedAt} CT</p>}
      </div>
      {cards.length === 0 ? <Card><CardContent className="p-4 text-sm text-muted-foreground">Today’s Goals could not load. Use your Activity Tracker to review and record activity.</CardContent></Card> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => {
            const state = goalState(card.goal, card.completed);
            const Icon = card.icon;
            return (
              <Card key={card.key} className={cn('border-2', state.met ? 'border-emerald-200 bg-emerald-50/40' : 'border-primary/20')}>
                <CardHeader className="space-y-1 px-4 pt-4 pb-2">
                  <div className="flex items-start justify-between gap-2"><CardTitle className="text-sm leading-tight">{card.label}</CardTitle><Icon className="h-4 w-4 shrink-0 text-primary" /></div>
                  <CardDescription className="text-xs font-medium">{card.period}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-4">
                  {card.goal === null ? <p className="text-sm font-semibold text-muted-foreground">Goal Not Set</p> : state.met ? <div><p className="text-xl font-bold text-emerald-700">Goal Met</p>{state.ahead > 0 && <p className="text-xs font-semibold text-emerald-700">Ahead By {state.ahead}</p>}</div> : <div><p className="text-3xl font-bold text-foreground">{state.remaining}</p><p className="text-xs font-semibold text-muted-foreground">remaining</p></div>}
                  <div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs"><div><p className="text-muted-foreground">Goal</p><p className="font-semibold">{card.goal === null ? 'Not Set' : card.goal}</p></div><div><p className="text-muted-foreground">Completed</p><p className="font-semibold">{card.completed}</p></div></div>
                  <Link href={card.href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ClipboardList className="h-3.5 w-3.5" />Track {card.key === 'appointmentsHeld' ? 'appointments' : 'activity'}</Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
