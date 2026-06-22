'use client';
export const dynamic = 'force-dynamic';

/**
 * /dashboard/admin/import-history
 *
 * Shows every bulk import batch across all import types:
 *   • Transaction CSV imports
 *   • MLS listing imports
 *   • Activity tracking imports
 *
 * Each row shows: type, date/time, record count, years covered,
 * sample agents, sample addresses, and a "Reverse Import" button
 * that deletes all records from that batch after a confirmation step.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Trash2,
  FileSpreadsheet,
  BarChart2,
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type ImportType = 'transaction' | 'mls' | 'activity';

interface ImportBatch {
  batchId: string;
  type: ImportType;
  importedAt: string;
  count: number;
  years: number[];
  sampleAgents: string[];
  sampleAddresses: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ImportType, { label: string; color: string; icon: React.ReactNode }> = {
  transaction: {
    label: 'Transaction Import',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
  },
  mls: {
    label: 'MLS Listing Import',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    icon: <BarChart2 className="h-3.5 w-3.5" />,
  },
  activity: {
    label: 'Activity Import',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    icon: <Activity className="h-3.5 w-3.5" />,
  },
};

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mos = Math.floor(days / 30);
  return `${mos}mo ago`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ImportHistoryPage() {
  const { user } = useUser();
  const isAdmin = useIsAdminLike();

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | ImportType>('all');
  const [search, setSearch] = useState('');

  // Reverse (delete) dialog
  const [reverseTarget, setReverseTarget] = useState<ImportBatch | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseSuccess, setReverseSuccess] = useState<string | null>(null);

  // Expanded rows (show full sample data)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Load batches ─────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/import-history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load import history');
      setBatches(data.batches ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // ── Reverse import ────────────────────────────────────────────────────────

  const handleReverse = async () => {
    if (!reverseTarget || !user || confirmText !== 'DELETE') return;
    setReversing(true);
    setReverseError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        batchId: reverseTarget.batchId,
        type: reverseTarget.type,
      });
      const res = await fetch(`/api/admin/import-history?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reverse failed');
      const typeLabel = TYPE_CONFIG[reverseTarget.type].label;
      setReverseSuccess(
        `Successfully reversed ${typeLabel}: ${data.deleted} record${data.deleted !== 1 ? 's' : ''} deleted.`
      );
      setBatches(prev => prev.filter(b => b.batchId !== reverseTarget.batchId));
      setReverseTarget(null);
      setConfirmText('');
    } catch (err: any) {
      setReverseError(err.message);
    } finally {
      setReversing(false);
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = batches.filter(b => {
    if (typeFilter !== 'all' && b.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        b.batchId.toLowerCase().includes(q) ||
        b.sampleAgents.some(a => a.toLowerCase().includes(q)) ||
        b.sampleAddresses.some(a => a.toLowerCase().includes(q)) ||
        b.years.some(y => String(y).includes(q))
      );
    }
    return true;
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  const totalTx = batches.filter(b => b.type === 'transaction').reduce((s, b) => s + b.count, 0);
  const totalMls = batches.filter(b => b.type === 'mls').reduce((s, b) => s + b.count, 0);
  const totalAct = batches.filter(b => b.type === 'activity').reduce((s, b) => s + b.count, 0);

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Admin access required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin/import">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Import
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Import History</h1>
            <p className="text-sm text-muted-foreground">
              View and reverse all bulk imports — transactions, MLS listings, and activity records
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadBatches} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Success banner */}
      {reverseSuccess && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-300">Import Reversed</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {reverseSuccess}
          </AlertDescription>
        </Alert>
      )}

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Transaction Imports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{batches.filter(b => b.type === 'transaction').length}</p>
            <p className="text-xs text-muted-foreground">{totalTx.toLocaleString()} total records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart2 className="h-4 w-4" /> MLS Imports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{batches.filter(b => b.type === 'mls').length}</p>
            <p className="text-xs text-muted-foreground">{totalMls.toLocaleString()} total records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" /> Activity Imports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{batches.filter(b => b.type === 'activity').length}</p>
            <p className="text-xs text-muted-foreground">{totalAct.toLocaleString()} total records</p>
          </CardContent>
        </Card>
      </div>

      {/* Info callout */}
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">About Reversing Imports</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-400">
          Reversing an import permanently deletes all records from that batch. For transaction and MLS
          imports, agent leaderboard rollups are automatically rebuilt. This action cannot be undone.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by agent, address, year, or batch ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Import Types</SelectItem>
                <SelectItem value="transaction">Transaction Imports</SelectItem>
                <SelectItem value="mls">MLS Imports</SelectItem>
                <SelectItem value="activity">Activity Imports</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Batch table */}
      <Card>
        <CardHeader>
          <CardTitle>Import Batches</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${filtered.length} batch${filtered.length !== 1 ? 'es' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading import history…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No import batches found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Years</TableHead>
                  <TableHead>Agents (sample)</TableHead>
                  <TableHead>Batch ID</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(batch => {
                  const cfg = TYPE_CONFIG[batch.type];
                  const isExpanded = expanded.has(batch.batchId);
                  return (
                    <>
                      <TableRow
                        key={batch.batchId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          setExpanded(prev => {
                            const next = new Set(prev);
                            if (next.has(batch.batchId)) next.delete(batch.batchId);
                            else next.add(batch.batchId);
                            return next;
                          })
                        }
                      >
                        {/* Expand toggle */}
                        <TableCell className="pr-0">
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>

                        {/* Type badge */}
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full', cfg.color)}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </TableCell>

                        {/* Date */}
                        <TableCell>
                          <div className="text-sm font-medium">{formatDateTime(batch.importedAt)}</div>
                          <div className="text-xs text-muted-foreground">{formatRelative(batch.importedAt)}</div>
                        </TableCell>

                        {/* Count */}
                        <TableCell className="text-right font-mono font-semibold">
                          {batch.count.toLocaleString()}
                        </TableCell>

                        {/* Years */}
                        <TableCell>
                          {batch.years.length > 0
                            ? batch.years.join(', ')
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>

                        {/* Sample agents */}
                        <TableCell className="max-w-[180px]">
                          <div className="text-sm truncate">
                            {batch.sampleAgents.length > 0
                              ? batch.sampleAgents.slice(0, 2).join(', ') +
                                (batch.sampleAgents.length > 2 ? ` +${batch.sampleAgents.length - 2} more` : '')
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </TableCell>

                        {/* Batch ID */}
                        <TableCell>
                          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {batch.batchId.length > 24
                              ? batch.batchId.slice(0, 24) + '…'
                              : batch.batchId}
                          </code>
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setReverseTarget(batch);
                              setConfirmText('');
                              setReverseError(null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Reverse
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <TableRow key={`${batch.batchId}_detail`} className="bg-muted/20">
                          <TableCell colSpan={8} className="py-3 px-6">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full Batch ID</p>
                                <code className="text-xs break-all">{batch.batchId}</code>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sample Agents</p>
                                {batch.sampleAgents.length > 0
                                  ? <ul className="space-y-0.5">{batch.sampleAgents.map(a => <li key={a}>{a}</li>)}</ul>
                                  : <span className="text-muted-foreground">None recorded</span>}
                              </div>
                              {batch.type !== 'activity' && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sample Addresses</p>
                                  {batch.sampleAddresses.length > 0
                                    ? <ul className="space-y-0.5">{batch.sampleAddresses.map(a => <li key={a}>{a}</li>)}</ul>
                                    : <span className="text-muted-foreground">None recorded</span>}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reverse confirmation dialog */}
      <Dialog
        open={!!reverseTarget}
        onOpenChange={open => {
          if (!open) { setReverseTarget(null); setConfirmText(''); setReverseError(null); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Reverse Import Batch
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                {reverseTarget && (
                  <>
                    <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{TYPE_CONFIG[reverseTarget.type].label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Imported</span>
                        <span className="font-medium">{formatDateTime(reverseTarget.importedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Records</span>
                        <span className="font-bold text-destructive">{reverseTarget.count.toLocaleString()}</span>
                      </div>
                      {reverseTarget.years.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Years</span>
                          <span className="font-medium">{reverseTarget.years.join(', ')}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-destructive font-medium">
                      This will permanently delete all {reverseTarget.count.toLocaleString()} records
                      from this import batch. This action cannot be undone.
                    </p>
                    {(reverseTarget.type === 'transaction' || reverseTarget.type === 'mls') && (
                      <p className="text-xs text-muted-foreground">
                        Agent leaderboard rollups will be automatically rebuilt after deletion.
                      </p>
                    )}
                    <div className="pt-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        Type <strong>DELETE</strong> to confirm
                      </label>
                      <Input
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="font-mono"
                        autoFocus
                      />
                    </div>
                    {reverseError && (
                      <Alert variant="destructive" className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{reverseError}</AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setReverseTarget(null); setConfirmText(''); setReverseError(null); }}
              disabled={reversing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReverse}
              disabled={confirmText !== 'DELETE' || reversing}
            >
              {reversing ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Reversing…</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" /> Reverse Import</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
