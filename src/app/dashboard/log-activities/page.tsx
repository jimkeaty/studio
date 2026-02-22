'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ActivityCalendarView } from '@/components/dashboard/log-activities/ActivityCalendarView';
import { DailyLogPanel } from '@/components/dashboard/log-activities/DailyLogPanel';
import { RunningAppointmentList } from '@/components/dashboard/log-activities/RunningAppointmentList';

export default function LogActivitiesPage() {
    const { user, loading: userLoading } = useUser();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    useEffect(() => {
        // When the page loads, select today's date by default.
        setSelectedDate(new Date());
    }, []);

    const handleDateSelect = (date: Date) => {
        setSelectedDate(date);
    };

    if (userLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!user) {
        return (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>You must be signed in to log activities.</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Log Activities</h1>
                <p className="text-muted-foreground">
                    Select a day on the calendar to log your daily metrics and manage appointments.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Monthly Calendar</CardTitle>
                    <CardDescription>Click a day to log or view your activities.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ActivityCalendarView
                        agentId={user.uid}
                        month={currentMonth}
                        onMonthChange={setCurrentMonth}
                        selectedDate={selectedDate}
                        onDateSelect={handleDateSelect}
                    />
                </CardContent>
            </Card>

            <RunningAppointmentList agentId={user.uid} currentMonth={currentMonth} />

            <DailyLogPanel
                date={selectedDate}
                agentId={user.uid}
                userId={user.uid}
                onOpenChange={(isOpen) => {
                    if (!isOpen) setSelectedDate(null);
                }}
            />
        </div>
    );
}
