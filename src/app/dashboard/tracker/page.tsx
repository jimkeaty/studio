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
import { doc, setDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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

  function onSubmit(data: TrackerFormValues) {
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

    setDoc(logDocRef, dataToSave, { merge: true })
        .then(() => {
            toast({
              title: "Log Saved!",
              description: `Your activity for ${format(data.date, 'PPP')} has been saved.`,
              action: <Check className="h-5 w-5 text-green-500" />,
            });
        })
        .catch((err) => {
             const permissionError = new FirestorePermissionError({
                path: logDocRef.path,
                operation: 'update', // or 'create'
                requestResourceData: dataToSave,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
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
