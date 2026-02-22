'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { listDailyActivitiesForMonth } from '@/lib/activityService';
import type { DailyActivity } from '@/lib/types';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivityCalendarView({
  agentId,
  month,
  onMonthChange,
  selectedDate,
  onDateSelect,
}: {
  agentId: string;
  month: Date;
  onMonthChange: (date: Date) => void;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}) {
  const db = useFirestore();
  const [activities, setActivities] = useState<Map<string, DailyActivity>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    
    listDailyActivitiesForMonth(db, agentId, year, monthIndex)
      .then(data => {
        const map = new Map<string, DailyActivity>();
        data.forEach(activity => {
          map.set(activity.date, activity);
        });
        setActivities(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [db, agentId, month]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startingDayIndex = getDay(monthStart);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{format(month, 'MMMM yyyy')}</h3>
        <div className="space-x-2">
          <Button variant="outline" size="icon" onClick={() => onMonthChange(subMonths(month, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_DAYS.map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {Array.from({ length: startingDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map(day => {
          const dateString = format(day, 'yyyy-MM-dd');
          const activity = activities.get(dateString);
          const isSelected = selectedDate && isSameDay(day, selectedDate);

          return (
            <div
              key={dateString}
              onClick={() => onDateSelect(day)}
              className={cn(
                'border rounded-md p-2 h-28 flex flex-col cursor-pointer transition-colors',
                isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-accent',
                !isSameMonth(day, month) && 'text-muted-foreground'
              )}
            >
              <span className={cn('font-semibold', isToday(day) && 'text-primary')}>{format(day, 'd')}</span>
              {loading ? (
                <div className="mt-2 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                </div>
              ) : activity ? (
                <div className="mt-1 text-xs space-y-0.5 overflow-hidden">
                    <Badge variant="secondary" className="mb-1">Tracked</Badge>
                    <p>C: {activity.callsCount}</p>
                    <p>E: {activity.engagementsCount}</p>
                    <p>A: {activity.appointmentsSetCount}/{activity.appointmentsHeldCount}</p>
                </div>
              ) : (
                <div className="mt-1">
                    <Badge variant="outline">Missing</Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
