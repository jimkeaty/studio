'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { listAppointmentLogsForRange } from '@/lib/activityService';
import type { AppointmentLog } from '@/lib/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type CategoryFilter = 'all' | 'buyer' | 'seller';
type StatusFilter = 'all' | 'set' | 'held';

export function RunningAppointmentList({ agentId, currentMonth }: { agentId: string, currentMonth: Date }) {
  const db = useFirestore();
  const [logs, setLogs] = useState<AppointmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    const startDate = startOfMonth(currentMonth);
    const endDate = endOfMonth(currentMonth);
    
    const filters: { category?: 'buyer' | 'seller', status?: 'set' | 'held' } = {};
    if (categoryFilter !== 'all') filters.category = categoryFilter;
    if (statusFilter !== 'all') filters.status = statusFilter;

    listAppointmentLogsForRange(db, agentId, startDate, endDate, filters)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));

  }, [db, agentId, currentMonth, categoryFilter, statusFilter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <CardTitle>Running Appointment List</CardTitle>
                <CardDescription>All appointment records for {format(currentMonth, 'MMMM yyyy')}.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="seller">Seller</SelectItem>
                    </SelectContent>
                </Select>
                 <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="set">Set</SelectItem>
                        <SelectItem value="held">Held</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        [...Array(3)].map((_, i) => (
                            <TableRow key={i}>
                                <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                            </TableRow>
                        ))
                    ) : logs.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                No appointment records match your filters for this month.
                            </TableCell>
                        </TableRow>
                    ) : (
                        logs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell>{format(new Date(log.date), 'MMM d')}</TableCell>
                                <TableCell className="font-medium">{log.contactName}</TableCell>
                                <TableCell><Badge variant={log.category === 'buyer' ? 'default' : 'secondary'}>{log.category}</Badge></TableCell>
                                <TableCell><Badge variant="outline">{log.status}</Badge></TableCell>
                                <TableCell>{log.scheduledAt ? format(log.scheduledAt.toDate(), 'Pp') : '—'}</TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}
