'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Eye, RefreshCw, ClipboardList,
  MapPin, Home, ArrowRightLeft, Plus, Mail, MailCheck, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type QueueStatus = 'pending_review' | 'in_progress' | 'completed' | 'dismissed';
type ActionType = 'new_listing' | 'status_change' | 'update' | 'closed_buyer' | 'open_house';

type StaffQueueItem = {
  id: string;
  transactionId: string | null;
  tcIntakeId?: string | null;
  transactionAddress: string;
  address?: string;
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
  // Enriched ledger fields
  salePrice?: number | null;
  gci?: number | null;
  closingType?: string | null;
  dealType?: string | null;
  contractDate?: string | null;
  closedDate?: string | null;
};

type OpenHouseSubmission = {
  id: string;
  agentId: string;
  agentName: string;
  agentPhone?: string;
  propertyAddress?: string;
  mlsNumber?: string;
  openHouseDate: string;
  startTime: string;
  endTime: string;
  specialNotes?: string;
  status: 'pending' | 'email_sent' | 'cancelled';
  createdAt: string;
  emailSentAt?: string;
  staffQueueId?: string;
  checklist?: { mls: boolean; boomtown: boolean; email: boolean };
  cancelReason?: string;
  changeHistory?: any[];
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

const formatDate = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy h:mm a'); } catch { return s; }
};

const formatDateShort = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return s; }
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending_review: { label: 'Pending Review', color: 'bg-amber-500/80 text-white', icon: <Clock className="h-3 w-3" /> },
  in_progress:    { label: 'In Progress',    color: 'bg-blue-500/80 text-white',   icon: <Eye className="h-3 w-3" /> },
  completed:      { label: 'Completed',      color: 'bg-green-600/80 text-white',  icon: <CheckCircle2 className="h-3 w-3" /> },
  dismissed:      { label: 'Dismissed',      color: 'bg-gray-500/80 text-white',   icon: <XCircle className="h-3 w-3" /> },
};

const OH_STATUS_CONFIG = {
  pending:    { label: 'Pending Review', color: 'bg-amber-500/80 text-white' },
  email_sent: { label: 'Email Sent ✓',  color: 'bg-green-600/80 text-white' },
  cancelled:  { label: 'Cancelled',     color: 'bg-red-500/80 text-white' },
};

const TX_STATUS_LABELS: Record<string, string> = {
  active: 'Active', pending: 'Pending', temp_off_market: 'Temp Off Market',
  closed: 'Closed', cancelled: 'Cancelled', canceled: 'Canceled',
  expired: 'Expired', coming_soon: 'Coming Soon',
};

const CLOSING_TYPE_LABEL: Record<string, string> = {
  buyer: "Buyer", listing: 'Listing', dual: 'Dual Agent',
  buyers_agent: "Buyer's Agent", listing_agent: 'Listing Agent', dual_agent: 'Dual Agent', referral: 'Referral', rental: 'Rental',
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  residential: 'Residential', residential_sale: 'Residential', commercial: 'Commercial',
  commercial_sale: 'Commercial', land: 'Land', rental: 'Rental', referral: 'Referral',
};

const formatCurrency = (v?: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

/* ─── Main Component ─────────────────────────────────────────────────────────── */

export default function StaffQueuePage() {
  const { user, loading: userLoading } = useUser();
  const { isStaff, loading: staffLoading } = useIsStaff();
  const { toast } = useToast();

  // Transaction queue items
  const [items, setItems] = useState<StaffQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');

  // Open house submissions
  const [ohItems, setOhItems] = useState<OpenHouseSubmission[]>([]);
  const [ohLoading, setOhLoading] = useState(true);
  const [ohError, setOhError] = useState<string | null>(null);
  const [ohStatusFilter, setOhStatusFilter] = useState<string>('pending');
  const [markingEmailSent, setMarkingEmailSent] = useState<string | null>(null);
  // Per-submission checklist state (submissionId -> checklist)
  const [checklists, setChecklists] = useState<Record<string, { mls: boolean; boomtown: boolean; email: boolean }>>({});
  const [savingChecklist, setSavingChecklist] = useState<string | null>(null);

  /* ─── Fetch transaction queue ─────────────────────────────────────────── */

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

  /* ─── Fetch open house submissions ───────────────────────────────────── */

  const fetchOhItems = useCallback(async () => {
    if (!user) return;
    setOhLoading(true);
    setOhError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (ohStatusFilter !== 'all') params.set('status', ohStatusFilter);
      const res = await fetch(`/api/admin/open-house-submissions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      const loaded: OpenHouseSubmission[] = data.items || [];
      setOhItems(loaded);
      // Initialize checklist state from stored data
      const initChecklists: Record<string, { mls: boolean; boomtown: boolean; email: boolean }> = {};
      for (const item of loaded) {
        initChecklists[item.id] = item.checklist ?? { mls: false, boomtown: false, email: false };
      }
      setChecklists(prev => ({ ...prev, ...initChecklists }));
    } catch (err: any) {
      setOhError(err.message || 'Failed to load open house submissions');
    } finally {
      setOhLoading(false);
    }
  }, [user, ohStatusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchOhItems(); }, [fetchOhItems]);

  /* ─── Checklist helpers ──────────────────────────────────────────────── */

  const handleChecklistChange = (submissionId: string, key: 'mls' | 'boomtown' | 'email', value: boolean) => {
    setChecklists(prev => ({
      ...prev,
      [submissionId]: { ...(prev[submissionId] ?? { mls: false, boomtown: false, email: false }), [key]: value },
    }));
  };

  const handleSaveChecklist = async (submissionId: string) => {
    if (!user) return;
    const cl = checklists[submissionId] ?? { mls: false, boomtown: false, email: false };
    setSavingChecklist(submissionId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/open-house-submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update_checklist', checklist: cl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      toast({ title: '✅ Checklist saved', description: 'Progress has been saved.' });
      fetchOhItems();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingChecklist(null);
    }
  };

  /* ─── Mark all done ──────────────────────────────────────────────────── */

  const handleMarkEmailSent = async (submissionId: string) => {
    if (!user) return;
    setMarkingEmailSent(submissionId);
    const cl = checklists[submissionId] ?? { mls: false, boomtown: false, email: false };
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/open-house-submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark_email_sent', checklist: cl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      toast({ title: '✅ Marked Complete', description: 'Agent has been notified that their open house is live.' });
      fetchOhItems();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setMarkingEmailSent(null);
    }
  };

  /* ─── Derived data ────────────────────────────────────────────────────── */

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    const displayAddr = item.transactionAddress || item.address || '';
    return (
      !q ||
      displayAddr.toLowerCase().includes(q) ||
      item.agentName?.toLowerCase().includes(q) ||
      item.submittedByName?.toLowerCase().includes(q)
    );
  });

  const statusChanges = filteredItems.filter(i => i.actionType === 'status_change' || i.actionType === 'closed_buyer' || i.actionType === 'update');
  const newListings = filteredItems.filter(i => i.actionType === 'new_listing');

  const pendingOhCount = ohItems.filter(i => i.status === 'pending').length;
  const pendingTxCount = items.filter(i => i.status === 'pending_review').length;

  /* ─── Loading / auth guards ───────────────────────────────────────────── */

  if (userLoading || staffLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!user || !isStaff) {
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

  /* ─── Render ──────────────────────────────────────────────────────────── */

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
            Open house submissions, MLS updates, new listings, and status changes
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchItems(); fetchOhItems(); }} disabled={loading || ohLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', (loading || ohLoading) && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{pendingOhCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Open Houses Pending</div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{statusChanges.filter(i => i.status === 'pending_review').length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Status Changes Pending</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{newListings.filter(i => i.status === 'pending_review').length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">New Listings Pending</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{pendingTxCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Pending Review</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="open-houses">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="open-houses" className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" />
            Open Houses
            {pendingOhCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pendingOhCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="status-changes" className="flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Status Changes
            {statusChanges.filter(i => i.status === 'pending_review').length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-500 text-white text-[10px] font-bold">
                {statusChanges.filter(i => i.status === 'pending_review').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="new-listings" className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Listings
            {newListings.filter(i => i.status === 'pending_review').length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                {newListings.filter(i => i.status === 'pending_review').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Open Houses Tab ─────────────────────────────────────────────── */}
        <TabsContent value="open-houses" className="mt-4 space-y-4">
          {pendingOhCount > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <Home className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Open House Submissions Pending</AlertTitle>
              <AlertDescription className="text-amber-700">
                {pendingOhCount} open house{pendingOhCount !== 1 ? 's' : ''} submitted — check off MLS, Boomtown, and Email Blast for each, then click "Mark Done".
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={ohStatusFilter} onValueChange={setOhStatusFilter}>
                  <SelectTrigger className="sm:w-52">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="email_sent">Email Sent</SelectItem>
                    <SelectItem value="all">All Submissions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ohItems.length} submission{ohItems.length !== 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ohLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : ohError ? (
                <div className="p-6">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{ohError}</AlertDescription>
                  </Alert>
                </div>
              ) : ohItems.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No open house submissions</p>
                  <p className="text-sm mt-1">
                    {ohStatusFilter === 'pending' ? 'No pending submissions — all caught up!' : 'Try changing the filter.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Open House Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Address / MLS</TableHead>
                        <TableHead>Special Notes</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Checklist</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ohItems.map((item) => {
                        const sc = OH_STATUS_CONFIG[item.status] ?? OH_STATUS_CONFIG.pending;
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/40">
                            <TableCell>
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', sc.color)}>
                                {sc.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{item.agentName}</div>
                              {item.agentPhone && <div className="text-xs text-muted-foreground">{item.agentPhone}</div>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-medium text-sm">
                              {item.openHouseDate ? format(parseISO(item.openHouseDate), 'EEE, MMM d, yyyy') : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {item.startTime} – {item.endTime}
                            </TableCell>
                            <TableCell>
                              {item.propertyAddress && <div className="text-sm font-medium">{item.propertyAddress}</div>}
                              {item.mlsNumber && <div className="text-xs text-muted-foreground">MLS# {item.mlsNumber}</div>}
                              {!item.propertyAddress && !item.mlsNumber && <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              {item.specialNotes ? (
                                <p className="text-xs text-muted-foreground truncate" title={item.specialNotes}>{item.specialNotes}</p>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDateShort(item.createdAt)}
                              {(item.changeHistory?.length ?? 0) > 0 && (
                                <div className="text-[10px] text-amber-600 mt-0.5">edited {item.changeHistory!.length}×</div>
                              )}
                            </TableCell>
                            {/* Checklist */}
                            <TableCell>
                              {item.status !== 'cancelled' ? (
                                <div className="space-y-1 min-w-[140px]">
                                  {(['mls', 'boomtown', 'email'] as const).map(key => {
                                    const cl = checklists[item.id] ?? { mls: false, boomtown: false, email: false };
                                    const label = key === 'mls' ? 'MLS' : key === 'boomtown' ? 'Boomtown' : 'Email Blast';
                                    return (
                                      <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={cl[key]}
                                          onChange={e => handleChecklistChange(item.id, key, e.target.checked)}
                                          className="h-3.5 w-3.5 rounded"
                                          disabled={item.status === 'email_sent'}
                                        />
                                        <span className={cn('text-xs', cl[key] ? 'line-through text-muted-foreground' : '')}>{label}</span>
                                      </label>
                                    );
                                  })}
                                  {item.status === 'pending' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[10px] mt-1 w-full"
                                      onClick={() => handleSaveChecklist(item.id)}
                                      disabled={savingChecklist === item.id}
                                    >
                                      {savingChecklist === item.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Save'}
                                    </Button>
                                  )}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.status === 'pending' ? (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleMarkEmailSent(item.id)}
                                  disabled={markingEmailSent === item.id}
                                >
                                  {markingEmailSent === item.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <MailCheck className="h-3 w-3" />
                                  )}
                                  Mark Done
                                </Button>
                              ) : item.status === 'email_sent' ? (
                                <span className="text-xs text-green-700 font-medium flex items-center gap-1 justify-end">
                                  <MailCheck className="h-3.5 w-3.5" />
                                  Done {item.emailSentAt ? formatDateShort(item.emailSentAt) : ''}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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
        </TabsContent>

        {/* ── Status Changes Tab ──────────────────────────────────────────── */}
        <TabsContent value="status-changes" className="mt-4 space-y-4">
          <TransactionQueueSection
            items={statusChanges}
            loading={loading}
            error={error}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            emptyMessage="No status change items found."
            emptySubMessage={statusFilter === 'active' ? 'All caught up — no pending status changes.' : 'Try adjusting your filters.'}
          />
        </TabsContent>

        {/* ── New Listings Tab ────────────────────────────────────────────── */}
        <TabsContent value="new-listings" className="mt-4 space-y-4">
          <TransactionQueueSection
            items={newListings}
            loading={loading}
            error={error}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            emptyMessage="No new listing items found."
            emptySubMessage={statusFilter === 'active' ? 'All caught up — no pending new listings.' : 'Try adjusting your filters.'}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Shared Transaction Queue Section ──────────────────────────────────────── */

type TxSectionProps = {
  items: StaffQueueItem[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  emptyMessage: string;
  emptySubMessage: string;
};

function TransactionQueueSection({
  items, loading, error, search, setSearch, statusFilter, setStatusFilter,
  emptyMessage, emptySubMessage,
}: TxSectionProps) {
  return (
    <div className="space-y-4">
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
              <SelectTrigger className="sm:w-52">
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
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{items.length} item{items.length !== 1 ? 's' : ''}</CardTitle>
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
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{emptyMessage}</p>
              <p className="text-sm mt-1">{emptySubMessage}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Queue Status</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[200px]">Address</TableHead>
                    <TableHead className="whitespace-nowrap">Agent</TableHead>
                    <TableHead className="whitespace-nowrap">Side</TableHead>
                    <TableHead className="whitespace-nowrap">Deal Type</TableHead>
                    <TableHead className="whitespace-nowrap">Contract Date</TableHead>
                    <TableHead className="whitespace-nowrap">Close Date</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Sale Price</TableHead>
                    <TableHead className="whitespace-nowrap">Status Change</TableHead>
                    <TableHead className="whitespace-nowrap">Notes</TableHead>
                    <TableHead className="whitespace-nowrap">Submitted</TableHead>
                    <TableHead className="whitespace-nowrap w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const sc = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending_review;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/40">
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', sc.color)}>
                            {sc.icon}{sc.label}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          <div className="font-medium text-sm truncate max-w-[240px]">{item.transactionAddress || item.address || '—'}</div>
                          {item.tcWorking && (
                            <span className="text-[10px] text-indigo-600 font-medium">Working with TC</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{item.agentName}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.closingType ? (
                            <Badge variant="outline" className="text-xs">
                              {CLOSING_TYPE_LABEL[item.closingType] ?? item.closingType}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {DEAL_TYPE_LABEL[item.dealType ?? ''] ?? item.dealType ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateShort(item.contractDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateShort(item.closedDate)}</TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {formatCurrency(item.salePrice)}
                        </TableCell>
                        <TableCell>
                          {(item.actionType === 'status_change' || item.actionType === 'closed_buyer') && (item.previousStatus || item.newStatus) ? (
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
                        <TableCell className="max-w-[180px]">
                          {item.notes ? (
                            <p className="text-xs text-muted-foreground truncate" title={item.notes}>{item.notes}</p>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateShort(item.createdAt)}
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
