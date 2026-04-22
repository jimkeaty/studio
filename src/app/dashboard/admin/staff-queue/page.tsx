'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Eye, RefreshCw, ClipboardList, MapPin, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QueueStatus = 'pending_review' | 'in_progress' | 'completed' | 'dismissed';
type ActionType = 'new_listing' | 'status_change' | 'update';

type StaffQueueItem = {
  id: string;
  transactionId: string;
  transactionAddress: string;
  agentId: string;
  agentName: string;
  actionType: ActionType;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string;
  submittedBy: string;
  submittedByName: string;
  tcWorking: boolean;
  status: QueueStatus;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  staffNotes?: string;
  createdAt: string;
  updatedAt: string;
};

const formatDate = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy h:mm a'); } catch { return s; }
};

const formatDateShort = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return s; }
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending_review: {
    label: 'Pending Review',
    color: 'bg-amber-500/80 text-white',
    icon: <Clock className="h-3 w-3" />,
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-500/80 text-white',
    icon: <Eye className="h-3 w-3" />,
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-600/80 text-white',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  dismissed: {
    label: 'Dismissed',
    color: 'bg-gray-500/80 text-white',
    icon: <XCircle className="h-3 w-3" />,
  },
};

const ACTION_CONFIG: Record<ActionType, { label: string; color: string }> = {
  new_listing: { label: 'New Listing', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  status_change: { label: 'Status Change', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  update: { label: 'Update', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

const TX_STATUS_LABELS: Record<string, string> = {
  active: 'Active', pending: 'Pending', temp_off_market: 'Temp Off Market',
  closed: 'Closed', cancelled: 'Cancelled', canceled: 'Canceled',
  expired: 'Expired', sold: 'Sold',
};

export default function StaffQueuePage() {
  const { user } = useUser();
  const isStaff = useIsStaff();

  const [items, setItems] = useState<StaffQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter === 'active') {
        params.set('active', 'true');
      } else if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await fetch(`/api/admin/staff-queue?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load staff queue');
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.transactionAddress?.toLowerCase().includes(q) ||
      item.agentName?.toLowerCase().includes(q) ||
      item.submittedByName?.toLowerCase().includes(q);
    const matchAction = actionFilter === 'all' || item.actionType === actionFilter;
    return matchSearch && matchAction;
  });

  const pendingCount = items.filter((i) => i.status === 'pending_review').length;
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length;
  const completedCount = items.filter((i) => i.status === 'completed').length;

  if (!isStaff) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view the Staff Queue.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Staff Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            MLS updates, new listings, and status changes requiring staff action
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending Review', value: pendingCount, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          { label: 'In Progress', value: inProgressCount, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Completed', value: completedCount, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { label: 'Total (filtered)', value: filtered.length, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
        ].map((c) => (
          <Card key={c.label} className={cn('border', c.bg)}>
            <CardContent className="p-4">
              <div className={cn('text-2xl font-bold', c.color)}>{c.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert for pending items */}
      {pendingCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Action Required</AlertTitle>
          <AlertDescription className="text-amber-700">
            {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending review — please update MLS and mark as completed.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by address or agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Queue Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (Pending + In Progress)</SelectItem>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="new_listing">New Listing</SelectItem>
                <SelectItem value="status_change">Status Change</SelectItem>
                <SelectItem value="update">Update</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No items found</p>
              <p className="text-sm mt-1">
                {statusFilter === 'active' ? 'All caught up — no pending or in-progress items.' : 'Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap w-[140px]">Queue Status</TableHead>
                    <TableHead className="whitespace-nowrap w-[120px]">Action Type</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[200px]">Address</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[130px]">Agent</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[160px]">Status Change</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[120px]">Submitted</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[130px]">Reviewed By</TableHead>
                    <TableHead className="whitespace-nowrap w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const sc = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending_review;
                    const ac = ACTION_CONFIG[item.actionType] ?? ACTION_CONFIG.update;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/40">
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', sc.color)}>
                            {sc.icon}{sc.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap', ac.color)}>
                            {ac.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm truncate max-w-[240px]">{item.transactionAddress || '—'}</div>
                          {item.tcWorking && (
                            <span className="text-[10px] text-indigo-600 font-medium">Working with TC</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{item.agentName || item.submittedByName || '—'}</TableCell>
                        <TableCell>
                          {item.actionType === 'status_change' && (item.previousStatus || item.newStatus) ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="px-1.5 py-0.5 rounded bg-muted border text-muted-foreground">
                                {TX_STATUS_LABELS[item.previousStatus || ''] || item.previousStatus || '?'}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-medium">
                                {TX_STATUS_LABELS[item.newStatus || ''] || item.newStatus || '?'}
                              </span>
                            </div>
                          ) : item.actionType === 'new_listing' ? (
                            <span className="text-xs text-emerald-700 font-medium">New listing added</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateShort(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.reviewedByName || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/admin/staff-queue/${item.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
