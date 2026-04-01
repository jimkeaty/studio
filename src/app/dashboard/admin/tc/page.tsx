'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Eye, RefreshCw, ClipboardList,
  Plus, Trash2, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type IntakeStatus = 'submitted' | 'in_review' | 'approved' | 'rejected';

type Intake = {
  id: string;
  agentDisplayName: string;
  address: string;
  clientName: string;
  closingType: string;
  dealType: string;
  status: IntakeStatus;
  submittedAt: string;
  updatedAt: string;
  salePrice?: number | null;
  gci?: number | null;
  contractDate?: string | null;
  projectedCloseDate?: string | null;
  approvedTransactionId?: string;
  assignedTcProfileId?: string | null;
};

// Staff user shape (TC coordinators come from staffUsers collection)
type StaffUser = {
  id: string;
  displayName: string;
  email: string;
  role: 'tc' | 'tc_admin' | 'office_admin';
  status: 'active' | 'inactive';
};

const formatCurrency = (n?: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n) : '—';

const formatDate = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return s; }
};

const STATUS_CONFIG: Record<IntakeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  submitted: {
    label: 'Submitted',
    color: 'bg-blue-500/80 text-white',
    icon: <Clock className="h-3 w-3" />,
  },
  in_review: {
    label: 'In Review',
    color: 'bg-yellow-500/80 text-white',
    icon: <Eye className="h-3 w-3" />,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-600/80 text-white',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-500/80 text-white',
    icon: <XCircle className="h-3 w-3" />,
  },
};

const CLOSING_TYPE_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  listing: 'Listing',
  referral: 'Referral',
  dual: 'Dual Agent',
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  residential_sale: 'Res. Sale',
  residential_lease: 'Res. Lease',
  land: 'Land',
  commercial_sale: 'Comm. Sale',
  commercial_lease: 'Comm. Lease',
};

// ── Default checklist template ────────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  'Contract received & verified',
  'Earnest money deposit confirmed',
  'Title company ordered',
  'Home inspection scheduled',
  'Home inspection completed',
  'Appraisal ordered',
  'Appraisal received',
  'Loan approval received',
  'Title commitment reviewed',
  'Survey ordered/received',
  'HOA docs requested (if applicable)',
  'Final walkthrough scheduled',
  'Closing disclosure reviewed',
  'Closing documents prepared',
  'Commission disbursement verified',
  'File closed & archived',
];

export default function TcQueuePage() {
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  // ── TC Queue state ──────────────────────────────────────────────────────────
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ── Staff TC users state (replaces legacy tcProfiles) ──────────────────────
  const [tcStaff, setTcStaff] = useState<StaffUser[]>([]);

  // ── Workflow Templates state ────────────────────────────────────────────────
  const [checklistTemplate, setChecklistTemplate] = useState<string[]>(DEFAULT_CHECKLIST);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  // ── Helper: get auth token ──────────────────────────────────────────────────
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  // ── Load intakes ────────────────────────────────────────────────────────────
  const loadIntakes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const url = statusFilter === 'all'
        ? '/api/admin/tc'
        : `/api/admin/tc?status=${statusFilter}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setIntakes(data.intakes ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter, getToken]);

  // ── Load TC staff from staffUsers (role tc or tc_admin, status active) ──────
  const loadTcStaff = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/staff-users', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        const tc = (data.users as StaffUser[]).filter(
          (u) => (u.role === 'tc' || u.role === 'tc_admin') && u.status === 'active'
        );
        setTcStaff(tc);
      }
    } catch {
      // Non-critical — assignment dropdown will just be empty
    }
  }, [user, getToken]);

  useEffect(() => {
    if (!userLoading && user) {
      loadIntakes();
      loadTcStaff();
    }
  }, [user, userLoading, statusFilter, loadIntakes, loadTcStaff]);

  // ── Assign TC to intake ─────────────────────────────────────────────────────
  const assignTcToIntake = async (intakeId: string, profileId: string | null) => {
    try {
      const token = await getToken();
      await fetch(`/api/admin/tc/${intakeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTcProfileId: profileId }),
      });
      setIntakes((prev) =>
        prev.map((i) => (i.id === intakeId ? { ...i, assignedTcProfileId: profileId } : i))
      );
    } catch (err: any) {
      console.error('Failed to assign TC:', err);
    }
  };

  // ── Checklist template helpers ──────────────────────────────────────────────
  const addChecklistItem = () => {
    const trimmed = newChecklistItem.trim();
    if (!trimmed) return;
    setChecklistTemplate((prev) => [...prev, trimmed]);
    setNewChecklistItem('');
  };

  const removeChecklistItem = (index: number) => {
    setChecklistTemplate((prev) => prev.filter((_, i) => i !== index));
  };

  const moveChecklistItem = (index: number, direction: 'up' | 'down') => {
    setChecklistTemplate((prev) => {
      const copy = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return copy;
      [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];
      return copy;
    });
  };

  const resetChecklist = () => {
    setChecklistTemplate(DEFAULT_CHECKLIST);
  };

  // ── Auth guards ─────────────────────────────────────────────────────────────
  if (userLoading || adminLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!user) {
    return <Alert><AlertTitle>Authentication Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;
  }

  if (!isAdmin) {
    return <Alert variant="destructive"><AlertTitle>Access Denied</AlertTitle><AlertDescription>Admin only.</AlertDescription></Alert>;
  }

  // Summary counts
  const counts = intakes.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const allCount = intakes.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TC Management</h1>
          <p className="text-muted-foreground">Manage TC intake queue and workflow templates. Add or edit TC coordinators in <Link href="/dashboard/admin/staff-users" className="underline text-primary">Staff Users</Link>.</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            <ClipboardList className="h-4 w-4" /> TC Queue
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <ListChecks className="h-4 w-4" /> Workflow Templates
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TC QUEUE TAB                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="queue" className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={loadIntakes} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(['submitted', 'in_review', 'approved', 'rejected'] as IntakeStatus[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <Card
                  key={s}
                  className={cn('cursor-pointer transition-all', statusFilter === s && 'ring-2 ring-primary')}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                      {cfg.icon} {cfg.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{counts[s] ?? 0}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Filter */}
          <Card>
            <CardContent className="pt-4 flex items-center gap-4">
              <span className="text-sm font-medium">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({allCount})</SelectItem>
                  <SelectItem value="submitted">Submitted ({counts.submitted ?? 0})</SelectItem>
                  <SelectItem value="in_review">In Review ({counts.in_review ?? 0})</SelectItem>
                  <SelectItem value="approved">Approved ({counts.approved ?? 0})</SelectItem>
                  <SelectItem value="rejected">Rejected ({counts.rejected ?? 0})</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Intakes</CardTitle>
              <CardDescription>{intakes.length} record{intakes.length !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : intakes.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No TC submissions found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Contract Date</TableHead>
                        <TableHead>Proj. Close</TableHead>
                        <TableHead className="text-right">GCI</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned TC</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {intakes.map((intake) => {
                        const cfg = STATUS_CONFIG[intake.status] ?? STATUS_CONFIG.submitted;
                        const assignedStaff = tcStaff.find((s) => s.id === intake.assignedTcProfileId);
                        return (
                          <TableRow key={intake.id}>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(intake.submittedAt)}
                            </TableCell>
                            <TableCell className="font-medium">{intake.agentDisplayName}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              {intake.address}
                            </TableCell>
                            <TableCell className="text-sm">{intake.clientName || '—'}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {intake.closingType && (
                                  <Badge variant="outline" className="text-xs w-fit">
                                    {CLOSING_TYPE_LABEL[intake.closingType] ?? intake.closingType}
                                  </Badge>
                                )}
                                {intake.dealType && (
                                  <span className="text-xs text-muted-foreground">
                                    {DEAL_TYPE_LABEL[intake.dealType] ?? intake.dealType}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(intake.contractDate)}</TableCell>
                            <TableCell className="text-sm">{formatDate(intake.projectedCloseDate)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(intake.gci)}
                            </TableCell>
                            <TableCell>
                              <Badge className={cn('flex items-center gap-1 w-fit', cfg.color)}>
                                {cfg.icon} {cfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={intake.assignedTcProfileId || 'unassigned'}
                                onValueChange={(val) =>
                                  assignTcToIntake(intake.id, val === 'unassigned' ? null : val)
                                }
                              >
                                <SelectTrigger className="w-[150px] h-8 text-xs">
                                  <SelectValue>
                                    {assignedStaff ? assignedStaff.displayName : 'Unassigned'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {tcStaff.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              <Link href={`/dashboard/admin/tc/${intake.id}`}>
                                <Button size="sm" variant={intake.status === 'submitted' ? 'default' : 'outline'}>
                                  <Eye className="h-3 w-3 mr-1" />
                                  {intake.status === 'submitted' ? 'Review' : 'View'}
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* WORKFLOW TEMPLATES TAB                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Workflow Checklist Template</h2>
              <p className="text-sm text-muted-foreground">
                Default checklist items applied to new TC intakes. Reorder, add, or remove items.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetChecklist}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reset to Default
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Checklist Items</CardTitle>
              <CardDescription>{checklistTemplate.length} step{checklistTemplate.length !== 1 ? 's' : ''} in workflow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {checklistTemplate.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-md border bg-muted/30"
                  >
                    <span className="text-sm font-mono text-muted-foreground w-6 text-right">
                      {index + 1}.
                    </span>
                    <span className="flex-1 text-sm">{item}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => moveChecklistItem(index, 'up')}
                        className="h-7 w-7 p-0"
                      >
                        &uarr;
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === checklistTemplate.length - 1}
                        onClick={() => moveChecklistItem(index, 'down')}
                        className="h-7 w-7 p-0"
                      >
                        &darr;
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => removeChecklistItem(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Add new checklist item..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                />
                <Button onClick={addChecklistItem} disabled={!newChecklistItem.trim()}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
