'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser } from '@/firebase';
import { format, parseISO } from 'date-fns';
import type { AppointmentLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, PlusCircle, AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const appointmentSchema = z.object({
  category: z.enum(['buyer', 'seller']),
  status: z.enum(['set', 'held']),
  contactName: z.string().min(2, 'Name is required.'),
  scheduledAtDate: z.date().optional(),
  scheduledAtTime: z.string().optional(),
  heldAtDate: z.date().optional(),
  heldAtTime: z.string().optional(),
});
type AppointmentFormValues = z.infer<typeof appointmentSchema>;

const timeToISO = (date?: Date, time?: string): string | undefined => {
    if (!date) return undefined;
    const d = new Date(date);
    if (time) {
        const [h, m] = time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
    }
    return d.toISOString();
}

export function AppointmentLogger({ selectedDate, agentId }: { selectedDate: Date, agentId: string, userId: string }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AppointmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const dateString = format(selectedDate, 'yyyy-MM-dd');

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: { category: 'buyer', status: 'set', contactName: '' },
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

    const payload = {
        date: dateString,
        category: values.category,
        status: values.status,
        contactName: values.contactName,
        scheduledAt: timeToISO(values.scheduledAtDate, values.scheduledAtTime),
        heldAt: timeToISO(values.heldAtDate, values.heldAtTime),
    };

    try {
        const token = await user.getIdToken();
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify(payload)
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Failed to save appointment.');

        toast({ title: 'Success', description: 'Appointment logged.' });
        form.reset();
        setShowForm(false);
        fetchLogs();
    } catch(err: any) {
        toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const onSubmit = async (values: AppointmentFormValues) => {
    handleSave(values);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/appointments/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`}
      });
      if (!res.ok) throw new Error('Failed to delete appointment.');

      toast({ title: 'Deleted', description: 'Appointment log removed.' });
      fetchLogs();
    } catch(err: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appointment Name Records</CardTitle>
      </CardHeader>
      <CardContent>
        {!showForm && (
          <Button variant="outline" onClick={() => setShowForm(true)} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Appointment Record
          </Button>
        )}
        {showForm && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 border rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                    <FormField name="category" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField name="status" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="set">Set</SelectItem><SelectItem value="held">Held</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField name="contactName" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Contact Name</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <div className="flex items-end gap-2">
                    <FormField name="scheduledAtDate" control={form.control} render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel>Scheduled At</FormLabel>
                             <Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'PPP') : <span>Pick date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                        </FormItem>
                    )} />
                    <FormField name="scheduledAtTime" control={form.control} render={({ field }) => (
                        <FormItem><FormControl><Input type="time" {...field} /></FormControl></FormItem>
                    )} />
                </div>
                
                 <div className="flex items-end gap-2">
                    <FormField name="heldAtDate" control={form.control} render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel>Held At</FormLabel>
                             <Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'PPP') : <span>Pick date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                        </FormItem>
                    )} />
                    <FormField name="heldAtTime" control={form.control} render={({ field }) => (
                        <FormItem><FormControl><Input type="time" {...field} /></FormControl></FormItem>
                    )} />
                </div>
                
                <div className="flex items-center gap-4">
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Record'}</Button>
                  <Button type="button" variant="ghost" onClick={() => { setShowForm(false); form.reset(); }}>Cancel</Button>
                </div>
            </form>
          </Form>
        )}
        <div className="mt-6">
          <h4 className="font-semibold mb-2">Logged for {format(selectedDate, 'PPP')}</h4>
          <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Details</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={3} className="text-center"><p>Loading...</p></TableCell></TableRow>
                    ) : logs.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No appointment records for this day.</TableCell></TableRow>
                    ) : (
                        logs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <Badge variant={log.category === 'buyer' ? 'default' : 'secondary'}>{log.category}</Badge>
                                        <Badge variant="outline">{log.status}</Badge>
                                    </div>
                                </TableCell>
                                <TableCell>{log.contactName}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
