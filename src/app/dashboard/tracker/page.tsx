'use client';

import { useState } from 'react';
import { useUser } from '@/firebase';
import { addMonths, subMonths, format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { ActivityCalendarView } from '@/components/dashboard/log-activities/ActivityCalendarView';
import { DailyLogPanel } from '@/components/dashboard/log-activities/DailyLogPanel';
import { RunningAppointmentList } from '@/components/dashboard/log-activities/RunningAppointmentList';

export default function DailyTrackerPage() {
  const { user, loading: userLoading } = useUser();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            You must be signed in to use the daily tracker.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Activity Tracker</h1>
        <p className="text-muted-foreground">Log your daily activities and manage appointment records.</p>
      </div>
      
      <Card>
        <CardHeader>
            <CardTitle>Activity Calendar</CardTitle>
            <CardDescription>Select a day to view or edit your activity log. Completed days are marked.</CardDescription>
        </CardHeader>
        <CardContent>
            <ActivityCalendarView
                agentId={user.uid}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
            />
        </CardContent>
      </Card>
      
      <RunningAppointmentList
        agentId={user.uid}
        currentMonth={currentMonth}
      />

      <DailyLogPanel
        date={selectedDate}
        agentId={user.uid}
        userId={user.uid}
        onOpenChange={(isOpen) => !isOpen && setSelectedDate(null)}
      />
    </div>
  );
}
