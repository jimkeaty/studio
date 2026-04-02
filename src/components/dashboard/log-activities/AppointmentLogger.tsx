'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser } from '@/firebase';
import { format } from 'date-fns';
import type { AppointmentLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, PlusCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const appointmentSchema = z.object({
  category: z.enum(['buyer', 'seller', 'both']),
  status: z.enum(['set', 'held']),
  contactName: z.string().min(2, 'Name is required.'),
  scheduledAtDate: z.date().optional(),
  scheduledAtTime: z.string().optional(),
  heldAtDate: z.date().optional(),
  heldAtTime: z.string().optional(),
  dateSetDate: z.date().optional(),
  dateSetTime: z.string().optional(),
  priceRangeLow: z.string().optional(),
  priceRangeHigh: z.string().optional(),
  timing: z.enum(['0_60', '60_120', '120_plus', 'other', '']).optional(),
  notes: z.string().optional(),
});
type AppointmentFormValues = z.infer<typeof appointmentSchema>;

const TIMING_LABELS: Record<string, string> = {
  '0_60': '0\u201360 Days',
  '60_120': '60\u2013120 Days',
  '120_plus': '120+ Days',
  'other': 'Other / Unknown',
};

const CATEGORY_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  both: 'Both',
};

const timeToISO = (date?: Date, time?: string): string | undefined => {
    if (!date) return undefined;
    const d = new Date(date);
    if (time) {
        const [h, m] = time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
    }
    return d.toISOString();
}

export function AppointmentLogger({ selectedDate, agentId }: { selectedDate: Date; agentId: string; userId?: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AppointmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const dateString = format(selectedDate, 'yyyy-MM-dd');

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      category: 'buyer',
      status: 'set',
      contactName: '',
      priceRangeLow: '',
      priceRangeHigh: '',
      timing: '',
      notes: '',
    },
  });

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/appointments?date=${dateString}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load appointments.');
        const data = await res.json();
        setLogs(data.appointments || []);
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
        setLoading(false);
    }
  }, [user, dateString, toast]);
  
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  
  const handleSave = async (values: AppointmentFormValues) => {
    if (!user) return;
    setIsSubmitting(true);
    const parsedLow = values.priceRangeLow ? parseFloat(values.priceRangeLow.replace(/[^0-9.]/g, '')) : null;
    const parsedHigh = values.priceRangeHigh ? parseFloat(values.priceRangeHigh.replace(/[^0-9.]/g, '')) : null;
    const payload = {
      date: dateString,
      category: values.category,
      status: values.status,
      contactName: values.contactName,
      scheduledAt: timeToISO(values.scheduledAtDate, values.scheduledAtTime),
      heldAt: timeToISO(values.heldAtDate, values.heldAtTime),
      dateSet: values.dateSetDate ? format(values.dateSetDate, 'yyyy-MM-dd') : undefined,
      timeSet: values.dateSetTime || undefined,
      priceRangeLow: parsedLow && !isNaN(parsedLow) ? parsedLow : null,
      priceRangeHigh: parsedHigh && !isNaN(parsedHigh) ? parsedHigh : null,
      timing: values.timing || null,
      notes: values.notes || null,
      source: 'manual',
    };
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to save appointment.');
      toast({ title: 'Success', description: 'Appointment logged.' });
      form.reset({ category: 'buyer', status: 'set', contactName: '', priceRangeLow: '', priceRangeHigh: '', timing: '', notes: '' });
      setShowForm(false);
      fetchLogs();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete.');
      }
      toast({ title: 'Deleted', description: 'Appointment removed.' });
      fetchLogs();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Appointments — {format(selectedDate, 'PPP')}</CardTitle>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />Log Appointment
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">New Appointment</p>

              {/* Client Type + Status */}
              <div className="grid grid-cols-2 gap-3">
                <FormField name="category" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="seller">Seller</SelectItem>
                        <SelectItem value="both">Both (Buyer &amp; Seller)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="status" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="set">Set</SelectItem>
                        <SelectItem value="held">Held</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Contact Name */}
              <FormField name="contactName" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Date Appointment Was SET */}
              <div className="space-y-1">
                <p className="text-sm font-medium">Date Appointment Was Set</p>
                <div className="flex items-end gap-2">
                  <FormField name="dateSetDate" control={form.control} render={({ field }) => (
                    <FormItem className="flex-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, 'PPP') : <span>Pick date set</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )} />
                  <FormField name="dateSetTime" control={form.control} render={({ field }) => (
                    <FormItem><FormControl><Input type="time" className="w-[130px]" {...field} /></FormControl></FormItem>
                  )} />
                </div>
              </div>

              {/* Appointment Scheduled At */}
              <div className="space-y-1">
                <p className="text-sm font-medium">Appointment Date &amp; Time</p>
                <div className="flex items-end gap-2">
                  <FormField name="scheduledAtDate" control={form.control} render={({ field }) => (
                    <FormItem className="flex-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, 'PPP') : <span>Pick appointment date</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )} />
                  <FormField name="scheduledAtTime" control={form.control} render={({ field }) => (
                    <FormItem><FormControl><Input type="time" className="w-[130px]" {...field} /></FormControl></FormItem>
                  )} />
                </div>
              </div>

              {/* Held At */}
              <div className="space-y-1">
                <p className="text-sm font-medium">Held At <span className="text-muted-foreground font-normal">(if already held)</span></p>
                <div className="flex items-end gap-2">
                  <FormField name="heldAtDate" control={form.control} render={({ field }) => (
                    <FormItem className="flex-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, 'PPP') : <span>Pick held date</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )} />
                  <FormField name="heldAtTime" control={form.control} render={({ field }) => (
                    <FormItem><FormControl><Input type="time" className="w-[130px]" {...field} /></FormControl></FormItem>
                  )} />
                </div>
              </div>

              {/* Sale Price Range */}
              <div className="space-y-1">
                <p className="text-sm font-medium">Sale Price Range</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField name="priceRangeLow" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Low ($)</FormLabel>
                      <FormControl><Input placeholder="e.g. 250000" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField name="priceRangeHigh" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">High ($)</FormLabel>
                      <FormControl><Input placeholder="e.g. 350000" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Timing */}
              <FormField name="timing" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Timing (When do they expect to transact?)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select timing" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="0_60">0\u201360 Days</SelectItem>
                      <SelectItem value="60_120">60\u2013120 Days</SelectItem>
                      <SelectItem value="120_plus">120+ Days</SelectItem>
                      <SelectItem value="other">Other / Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Notes */}
              <FormField name="notes" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="Any additional notes..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Appointment'}</Button>
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); form.reset(); }}>Cancel</Button>
              </div>
            </form>
          </Form>
        )}

        {/* Logged list */}
        <div>
          <h4 className="font-semibold mb-2 text-sm">Logged for {format(selectedDate, 'PPP')}</h4>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Type / Status</TableHead>
                  <TableHead>Price Range</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No appointments logged for this day.</TableCell></TableRow>
                ) : (
                  logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.contactName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={log.category === 'buyer' ? 'default' : log.category === 'seller' ? 'secondary' : 'outline'}>
                            {CATEGORY_LABELS[log.category] ?? log.category}
                          </Badge>
                          <Badge variant="outline">{log.status ?? '\u2014'}</Badge>
                          {(log as any).source === 'bulk_import' && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Bulk Import</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.priceRangeLow || log.priceRangeHigh
                          ? `$${(log.priceRangeLow ?? 0).toLocaleString()} \u2013 $${(log.priceRangeHigh ?? 0).toLocaleString()}`
                          : '\u2014'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.timing ? TIMING_LABELS[log.timing] ?? log.timing : '\u2014'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(log.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
