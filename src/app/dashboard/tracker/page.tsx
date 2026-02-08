'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon, Check, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { mockAgentDashboardData } from '@/lib/mock-data';
import type { AgentDashboardData, BusinessPlan } from '@/lib/types';

const trackerFormSchema = z.object({
  date: z.date({
    required_error: 'A date is required.',
  }),
  calls: z.coerce.number().min(0, 'Cannot be negative.'),
  engagements: z.coerce.number().min(0, 'Cannot be negative.'),
  appointmentsSet: z.coerce.number().min(0, 'Cannot be negative.'),
  appointmentsHeld: z.coerce.number().min(0, 'Cannot be negative.'),
  contractsWritten: z.coerce.number().min(0, 'Cannot be negative.'),
});

type TrackerFormValues = z.infer<typeof trackerFormSchema>;

export default function DailyTrackerPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  
  const form = useForm<TrackerFormValues>({
    resolver: zodResolver(trackerFormSchema),
    defaultValues: {
      date: new Date(),
      calls: 0,
      engagements: 0,
      appointmentsSet: 0,
      appointmentsHeld: 0,
      contractsWritten: 0,
    },
  });

  async function onSubmit(data: TrackerFormValues) {
    if (!user || !db) {
        toast({
            variant: "destructive",
            title: "Not Signed In",
            description: "You must be signed in to log your daily activity.",
        });
        return;
    }

    const dateStr = format(data.date, 'yyyy-MM-dd');
    const logDocRef = doc(db, 'users', user.uid, 'dailyLogs', dateStr);

    const { date, ...logData } = data;
    const dataToSave = {
        ...logData,
        userId: user.uid,
        date: dateStr,
        updatedAt: new Date().toISOString(),
    };

    // Save the daily log first
    try {
      await setDoc(logDocRef, dataToSave, { merge: true });
    } catch (err) {
      const permissionError = new FirestorePermissionError({
          path: logDocRef.path,
          operation: 'update',
          requestResourceData: dataToSave,
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: "destructive",
        title: "Log Save Failed",
        description: "Could not save your daily log due to a permission error."
      });
      return; // Stop if the primary save fails
    }
    
    // This part simulates a backend function for immediate feedback during testing.
    // It creates/updates the main dashboard document when a log is saved.
    try {
        const yearStr = format(data.date, 'yyyy');
        const dashboardDocRef = doc(db, 'dashboards', user.uid, 'agent', yearStr);
        
        // 1. Fetch the business plan for the year to get the goal, regardless of whether the dashboard exists.
        const planDocRef = doc(db, 'users', user.uid, 'plans', yearStr);
        const planSnap = await getDoc(planDocRef);
        let monthlyGoal = mockAgentDashboardData.monthlyIncome[0].goal; // Default goal
        if (planSnap.exists()) {
            const planData = planSnap.data() as BusinessPlan;
            if (planData.calculatedTargets?.monthlyNetIncome) {
                monthlyGoal = planData.calculatedTargets.monthlyNetIncome;
            }
        }

        // 2. Now handle the dashboard data
        const dashboardSnap = await getDoc(dashboardDocRef);
        let dashboardData: AgentDashboardData;

        if (dashboardSnap.exists()) {
            // If dashboard data already exists, update it
            const existingData = dashboardSnap.data() as AgentDashboardData;
            dashboardData = {
                ...existingData,
                kpis: {
                    ...existingData.kpis,
                    calls: { ...existingData.kpis.calls, actual: (existingData.kpis.calls.actual || 0) + data.calls },
                    engagements: { ...existingData.kpis.engagements, actual: (existingData.kpis.engagements.actual || 0) + data.engagements },
                    appointmentsSet: { ...existingData.kpis.appointmentsSet, actual: (existingData.kpis.appointmentsSet.actual || 0) + data.appointmentsSet },
                    appointmentsHeld: { ...existingData.kpis.appointmentsHeld, actual: (existingData.kpis.appointmentsHeld.actual || 0) + data.appointmentsHeld },
                    contractsWritten: { ...existingData.kpis.contractsWritten, actual: (existingData.kpis.contractsWritten.actual || 0) + data.contractsWritten },
                },
                // Re-map the monthly income to ensure the goal is set correctly
                monthlyIncome: (existingData.monthlyIncome || mockAgentDashboardData.monthlyIncome).map(m => ({
                    month: m.month,
                    closed: m.closed || 0,
                    pending: m.pending || 0,
                    goal: monthlyGoal, // Always set/update the goal from the plan
                })),
            };
        } else {
            // If no dashboard exists for this year, create a new one.
            dashboardData = {
                ...mockAgentDashboardData,
                userId: user.uid,
                kpis: {
                    ...mockAgentDashboardData.kpis,
                    calls: { ...mockAgentDashboardData.kpis.calls, actual: data.calls },
                    engagements: { ...mockAgentDashboardData.kpis.engagements, actual: data.engagements },
                    appointmentsSet: { ...mockAgentDashboardData.kpis.appointmentsSet, actual: data.appointmentsSet },
                    appointmentsHeld: { ...mockAgentDashboardData.kpis.appointmentsHeld, actual: data.appointmentsHeld },
                    contractsWritten: { ...mockAgentDashboardData.kpis.contractsWritten, actual: data.contractsWritten },
                    closings: { ...mockAgentDashboardData.kpis.closings, actual: 0 } // Start with 0 closings
                },
                // Reset key figures for a fresh dashboard
                netEarned: 0,
                netPending: 0,
                ytdTotalPotential: 0,
                totalClosedIncomeForYear: 0,
                totalPendingIncomeForYear: 0,
                totalIncomeWithPipelineForYear: 0,
                // Use the retrieved goal for all months
                monthlyIncome: mockAgentDashboardData.monthlyIncome.map(m => ({
                    ...m,
                    closed: 0, 
                    pending: 0, 
                    goal: monthlyGoal 
                })),
            };
        }
        
        await setDoc(dashboardDocRef, dashboardData, { merge: true });
        
        toast({
            title: "Log Saved & Dashboard Updated!",
            description: `Your dashboard for ${yearStr} now reflects this activity. Go check it out!`,
            action: <Check className="h-5 w-5 text-green-500" />,
        });
    } catch (err) {
        console.error("Error updating dashboard document for testing:", err);
        const permissionError = new FirestorePermissionError({
            path: `dashboards/${user.uid}/agent/${format(data.date, 'yyyy')}`,
            operation: 'update',
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
          variant: "destructive",
          title: "Dashboard Update Failed",
          description: "Your log was saved, but the dashboard could not be updated for testing due to a permission error."
        });
    }
  }
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Daily Tracker</h1>
        <p className="text-muted-foreground">Log your daily metrics. You can edit entries up to 7 days back.</p>
      </div>

      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Edit className="text-primary"/>Log Your Activity</CardTitle>
          <CardDescription>Select a date and enter your numbers for the day.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < sevenDaysAgo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="calls"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Calls</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="engagements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engagements (Spoke to)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="appointmentsSet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointments Set</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="appointmentsHeld"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointments Held</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contractsWritten"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contracts Written</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full">Save Log</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
