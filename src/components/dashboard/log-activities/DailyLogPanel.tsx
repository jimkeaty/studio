'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useFirestore } from '@/firebase';
import { getDailyActivity, upsertDailyActivity } from '@/lib/activityService';
import type { DailyActivity } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, AlertCircle } from 'lucide-react';
import { AppointmentLogger } from './AppointmentLogger';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const dailyLogSchema = z.object({
  callsCount: z.coerce.number().min(0).default(0),
  engagementsCount: z.coerce.number().min(0).default(0),
  appointmentsSetCount: z.coerce.number().min(0).default(0),
  appointmentsHeldCount: z.coerce.number().min(0).default(0),
  contractsWrittenCount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});
type DailyLogFormValues = z.infer<typeof dailyLogSchema>;

export function DailyLogPanel({ date, agentId, userId, onOpenChange }: { date: Date | null, agentId: string, userId: string, onOpenChange: (isOpen: boolean) => void }) {
  const db = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const form = useForm<DailyLogFormValues>({
    resolver: zodResolver(dailyLogSchema),
    defaultValues: {
      callsCount: 0,
      engagementsCount: 0,
      appointmentsSetCount: 0,
      appointmentsHeldCount: 0,
      contractsWrittenCount: 0,
      notes: '',
    },
  });

  const dateString = useMemo(() => date ? format(date, 'yyyy-MM-dd') : null, [date]);

  useEffect(() => {
    if (dateString && db) {
      setLoading(true);
      setError(null);
      getDailyActivity(db, agentId, dateString)
        .then(data => {
          if (data) {
            form.reset(data);
            if (data.updatedAt?.toDate) setLastSaved(data.updatedAt.toDate());
          } else {
            form.reset({
              callsCount: 0,
              engagementsCount: 0,
              appointmentsSetCount: 0,
              appointmentsHeldCount: 0,
              contractsWrittenCount: 0,
              notes: '',
            });
            setLastSaved(null);
          }
        })
        .catch(err => {
          console.error(err);
          setError("Failed to load daily log. You may not have permission to view this data.");
        })
        .finally(() => setLoading(false));
    }
  }, [dateString, db, agentId, form]);

  const onSubmit = async (values: DailyLogFormValues) => {
    if (!dateString) return;
    try {
      await upsertDailyActivity(db, agentId, userId, dateString, values);
      toast({ title: 'Success', description: `Activities for ${format(date!, 'PPP')} saved.` });
      setLastSaved(new Date());
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message || 'Could not save daily log.' });
    }
  };

  return (
    <Sheet open={!!date} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log for {date ? format(date, 'PPP') : ''}</SheetTitle>
          <SheetDescription>
            Enter your counts for the day. Your changes are saved automatically.
          </SheetDescription>
        </SheetHeader>
        <div className="py-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField name="callsCount" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Calls</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="engagementsCount" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Engagements</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="appointmentsSetCount" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Appts Set</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="appointmentsHeldCount" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Appts Held</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="contractsWrittenCount" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Contracts Written</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField name="notes" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="Optional notes for the day..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                   <div className="flex justify-between items-center">
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            <Save className="mr-2 h-4 w-4" /> Save Daily Counts
                        </Button>
                        {lastSaved && (
                            <p className="text-xs text-muted-foreground">
                                Last saved: {format(lastSaved, 'p')}
                            </p>
                        )}
                    </div>
                </form>
              </Form>

              <Separator className="my-8" />
              
              {date && (
                <AppointmentLogger
                    selectedDate={date}
                    agentId={agentId}
                    userId={userId}
                />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
