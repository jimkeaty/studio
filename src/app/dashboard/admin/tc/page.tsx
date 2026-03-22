'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Eye, RefreshCw, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

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
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  residential_sale: 'Res. Sale',
  residential_lease: 'Res. Lease',
  land: 'Land',
  commercial_sale: 'Comm. Sale',
  commercial_lease: 'Comm. Lease',
};

export default function TcQueuePage() {
  const { user, loading: userLoading } = useUser();
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
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
  };

  useEffect(() => {
    if (!userLoading && user) load();
  }, [user, userLoading, statusFilter]);

  if (userLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!user) {
    return <Alert><AlertTitle>Authentication Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;
  }

  if (user.uid !== ADMIN_UID) {
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
          <h1 className="text-3xl font-bold tracking-tight">TC Intake Queue</h1>
          <p className="text-muted-foreground">Review, approve, or reject agent-submitted TC forms.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
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
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intakes.map((intake) => {
                    const cfg = STATUS_CONFIG[intake.status] ?? STATUS_CONFIG.submitted;
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
    </div>
  );
}
