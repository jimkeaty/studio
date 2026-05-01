'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import type { Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import {
  Plus, FileCheck2, Clock, AlertTriangle, DollarSign, Upload, Pencil, Trash2,
  Save, X, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ArrowRightLeft, Download, Tags,
  Copy, ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

/* ─── Constants ──────────────────────────────────────────────────────── */

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
};

const txTypeLabel: Record<string, string> = {
  residential_sale: 'Residential',
  rental: 'Rental',
  commercial_lease: 'Comm. Lease',
  commercial_sale: 'Comm. Sale',
};

const closingTypeLabel: Record<string, string> = {
  buyer: 'Buyer',
  listing: 'Seller/Listing',
  referral: 'Referral',
  dual: 'Dual Agent',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-500/80 text-white' },
  temp_off_market: { label: 'Temp Off Market', color: 'bg-orange-500/80 text-white' },
  pending: { label: 'Pending', color: 'bg-yellow-500/80 text-white' },
  sold: { label: 'Sold', color: 'bg-green-600/80 text-white' },
  closed: { label: 'Closed', color: 'bg-green-600/80 text-white' },
  canceled: { label: 'Canceled', color: 'bg-red-500/80 text-white' },
  cancelled: { label: 'Canceled', color: 'bg-red-500/80 text-white' },
  expired: { label: 'Expired', color: 'bg-gray-500/80 text-white' },
};

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const ALL_STATUSES = ['active', 'temp_off_market', 'pending', 'sold', 'closed', 'canceled', 'expired'] as const;

/* ─── Sorting ────────────────────────────────────────────────────────── */

type SortKey = 'status' | 'address' | 'agent' | 'closingType' | 'dealType' | 'contractDate' | 'closedDate' | 'dealValue' | 'grossComm' | 'netAgent' | 'companyRetained' | 'source';
type SortDir = 'asc' | 'desc';

function getSortValue(tx: Transaction, key: SortKey): string | number {
  switch (key) {
    case 'status': return tx.status || '';
    case 'address': return (tx.address || '').toLowerCase();
    case 'agent': return (tx.agentDisplayName || '').toLowerCase();
    case 'closingType': return (tx as any).closingType || '';
    case 'dealType': return tx.transactionType || '';
    case 'contractDate': return tx.contractDate || '';
    case 'closedDate': return tx.closedDate || (tx as any).closingDate || '';
    case 'dealValue': return tx.dealValue || 0;
    case 'grossComm': return tx.splitSnapshot?.grossCommission ?? tx.commission ?? 0;
    case 'netAgent': return tx.splitSnapshot?.agentNetCommission ?? tx.netCommission ?? 0;
    case 'companyRetained': return tx.splitSnapshot?.companyRetained ?? 0;
    case 'source': return tx.source || 'manual';
    default: return '';
  }
}

/* ─── Component ──────────────────────────────────────────────────────── */

export default function AdminTransactionLedgerPage() {
  const { user, loading: userLoading } = useUser();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [addressSearch, setAddressSearch] = useState('');

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('closedDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');


  // Delete confirmation
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Transfer dialog
  const [transferTx, setTransferTx] = useState<Transaction | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAgentId, setTransferAgentId] = useState('');
  const [transferAgentName, setTransferAgentName] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Export CSV
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Recalculate rollups
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ rebuilt: number; year: number } | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  // Agent list for transfer dropdown
  const [allAgents, setAllAgents] = useState<{ id: string; displayName: string }[]>([]);

  // Selection & bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Duplicate finder
  const [dupFinderOpen, setDupFinderOpen] = useState(true);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [acceptedDupKeys, setAcceptedDupKeys] = useState<Set<string>>(new Set());
  const [acceptedDupLoaded, setAcceptedDupLoaded] = useState(false);

  // Compute duplicate groups: same agent + normalized address, 2+ transactions
  const duplicateGroups = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const map = new Map<string, { key: string; txs: Transaction[] }>();
    for (const tx of transactions) {
      // Use the same normalization as the bulk-accept migration so keys match
      const agentRaw = (tx.agentDisplayName || tx.agentId || '').trim();
      const addrRaw = (tx.address || '').trim();
      const agent = normalize(agentRaw);
      const addr = normalize(addrRaw);
      if (!agent || !addr) continue;
      const key = `${agent}|||${addr}`;
      if (!map.has(key)) map.set(key, { key, txs: [] });
      map.get(key)!.txs.push(tx);
    }
    return Array.from(map.values())
      .filter(g => g.txs.length > 1)
      .sort((a, b) => b.txs.length - a.txs.length);
  }, [transactions]);

  const visibleDupGroups = useMemo(
    () => duplicateGroups.filter(g => !acceptedDupKeys.has(g.key)),
    [duplicateGroups, acceptedDupKeys]
  );

  const acceptDupGroup = async (key: string) => {
    setAcceptedDupKeys(prev => new Set([...prev, key]));
    // Persist to Firestore
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/admin/accepted-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key }),
      });
    } catch { /* non-critical — UI already updated */ }
  };

  // Quick status change (Temp Off Market toggle)
  const [quickStatusTx, setQuickStatusTx] = useState<Transaction | null>(null);
  const [quickStatusOpen, setQuickStatusOpen] = useState(false);
  const [quickStatusValue, setQuickStatusValue] = useState<string>('');
  const [quickStatusSaving, setQuickStatusSaving] = useState(false);

  /* ─── Data loading ─────────────────────────────────────────────────── */

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setLoadingTx(true);
    setPageError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load transactions');
      setTransactions(data.transactions ?? []);
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }, [user]);

  const loadAgents = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.agents) {
        setAllAgents(data.agents.map((a: any) => ({ id: a.uid || a.id, displayName: a.displayName || a.name || a.email })));
      }
    } catch { /* ignore */ }
  }, [user]);

  // Load accepted duplicate keys from Firestore on mount
  const loadAcceptedDups = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/accepted-duplicates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.keys)) {
        setAcceptedDupKeys(new Set(data.keys));
      }
    } catch { /* non-critical */ } finally {
      setAcceptedDupLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (!userLoading && user) {
      loadTransactions();
      loadAgents();
      loadAcceptedDups();
    }
  }, [user, userLoading, loadTransactions, loadAgents, loadAcceptedDups]);

  /* ─── Recalculate rollups ──────────────────────────────────────────── */

  const handleRecalculateRollups = async () => {
    if (!user) return;
    const year = yearFilter === 'all' ? new Date().getFullYear() : Number(yearFilter);
    setRecalculating(true);
    setRecalcResult(null);
    setRecalcError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/recalculate-rollups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Recalculation failed');
      setRecalcResult({ rebuilt: data.rebuilt, year: data.year });
    } catch (err: any) {
      setRecalcError(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  /* ─── Export CSV ──────────────────────────────────────────────────── */

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    setExportError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (agentFilter !== 'all') params.set('agentId', agentFilter);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const url = `/api/admin/transactions/export${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || 'transactions.csv';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const router = useRouter();

  /* ─── Edit handlers ────────────────────────────────────────────────── */

  const openEdit = (tx: Transaction) => {
    // Navigate to the full-edit page (mirrors Add Transaction form exactly)
    router.push(`/dashboard/admin/transactions/edit?id=${tx.id}`);
  };


  /* ─── Delete handlers ──────────────────────────────────────────────── */

  const openDelete = (tx: Transaction) => {
    setDeleteTx(tx);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTx || !user) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTx.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete');

      setTransactions(prev => prev.filter(t => t.id !== deleteTx.id));
      setDeleteOpen(false);
      setDeleteTx(null);
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Bulk selection & delete ────────────────────────────────────── */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    }
  };
  const handleBulkDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transactions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Bulk delete failed');
      setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  /* ─── Transfer handler ─────────────────────────────────────────────── */
  const openTransfer = (tx: Transaction) => {
    setTransferTx(tx);
    setTransferAgentId('');
    setTransferAgentName('');
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!transferTx || !transferAgentId || !user) return;
    setTransferring(true);
    try {
      const token = await user.getIdToken();
      const selectedAgent = allAgents.find(a => a.id === transferAgentId);
      const newName = selectedAgent?.displayName || transferAgentName || transferAgentId;

      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: transferTx.id,
          agentId: transferAgentId,
          agentDisplayName: newName,
          // Preserve all other fields
          status: transferTx.status,
          transactionType: transferTx.transactionType,
          address: transferTx.address,
          clientName: transferTx.clientName || null,
          dealValue: Number(transferTx.dealValue) || 0,
          commission: Number(transferTx.commission) || 0,
          contractDate: transferTx.contractDate || null,
          closedDate: transferTx.closedDate || null,
          notes: transferTx.notes || null,
          splitSnapshot: transferTx.splitSnapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to transfer');

      // Update local state
      setTransactions(prev =>
        prev.map(t => t.id === transferTx.id
          ? { ...t, agentId: transferAgentId, agentDisplayName: newName }
          : t
        )
      );
      setTransferOpen(false);
      setTransferTx(null);
      // Close edit sheet if open for this tx
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setTransferring(false);
    }
  };

    /* ─── Quick status change handler ───────────────────────────── */

  const openQuickStatus = (tx: Transaction) => {
    setQuickStatusTx(tx);
    setQuickStatusValue(tx.status);
    setQuickStatusOpen(true);
  };

  const handleQuickStatus = async () => {
    if (!quickStatusTx || !quickStatusValue || !user) return;
    if (quickStatusValue === quickStatusTx.status) {
      setQuickStatusOpen(false);
      return;
    }
    setQuickStatusSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: quickStatusTx.id, status: quickStatusValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update status');
      setTransactions(prev =>
        prev.map(t => t.id === quickStatusTx.id ? { ...t, status: quickStatusValue as Transaction['status'] } : t)
      );
      setQuickStatusOpen(false);
      setQuickStatusTx(null);
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setQuickStatusSaving(false);
    }
  };

  /* ─── Sort toggle ────────────────────────────────────────────────── */

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'closedDate' || key === 'dealValue' || key === 'grossComm' || key === 'netAgent' || key === 'companyRetained' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  /* ─── Filtering + Sorting ──────────────────────────────────────────── */

  const agentNames = useMemo(() =>
    Array.from(new Set(transactions.map(t => t.agentDisplayName ?? '').filter(Boolean))).sort(),
    [transactions]
  );

  const filtered = useMemo(() => {
    let result = transactions.filter(t => {
      const txYear = t.year ? String(t.year) : (t.closedDate ?? (t as any).closingDate ?? t.contractDate ?? '').slice(0, 4);
      const yearMatch = yearFilter === 'all' || txYear === yearFilter;
      const statusMatch = statusFilter === 'all' || t.status === statusFilter;
      const agentMatch = agentFilter === 'all' || (t.agentDisplayName ?? '') === agentFilter;
      const addressMatch = !addressSearch.trim() || (t.address || '').toLowerCase().includes(addressSearch.trim().toLowerCase());
      return yearMatch && statusMatch && agentMatch && addressMatch;
    });

    // Sort
    result.sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, yearFilter, statusFilter, agentFilter, addressSearch, sortKey, sortDir]);

  const totalGross = useMemo(() => filtered.reduce((s, t) => s + (t.splitSnapshot?.grossCommission ?? t.commission ?? 0), 0), [filtered]);
  const totalNet = useMemo(() => filtered.reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0), 0), [filtered]);
  const totalBroker = useMemo(() => filtered.reduce((s, t) => s + (t.splitSnapshot?.companyRetained ?? 0), 0), [filtered]);

  /* ─── Auth guards ──────────────────────────────────────────────────── */

  if (userLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!user) {
    return <Alert><AlertTitle>Authentication Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaction Ledger</h1>
          <p className="text-muted-foreground">All transactions feeding agent dashboards.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRecalculateRollups}
            disabled={recalculating}
            title={`Rebuild leaderboard rollups from ledger for ${yearFilter === 'all' ? new Date().getFullYear() : yearFilter}`}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating…' : 'Recalculate Rollups'}
          </Button>
          <Link href="/dashboard/admin/import">
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Bulk Import</Button>
          </Link>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
            title={`Export current view to CSV`}
          >
            <Download className={`mr-2 h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Link href="/dashboard/transactions/new">
            <Button><Plus className="mr-2 h-4 w-4" /> Add Transaction</Button>
          </Link>
        </div>
      </div>

      {/* DUPLICATE FINDER BANNER */}
      {visibleDupGroups.length > 0 && !dupDismissed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            onClick={() => setDupFinderOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                {visibleDupGroups.length} Potential Duplicate Group{visibleDupGroups.length !== 1 ? 's' : ''} Detected
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400">
                — same agent &amp; address · review each group below
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-amber-700 underline hover:text-amber-900 mr-2"
                onClick={e => { e.stopPropagation(); setDupDismissed(true); }}
              >
                Dismiss All
              </button>
              {dupFinderOpen
                ? <ChevronUp className="h-4 w-4 text-amber-600" />
                : <ChevronDown className="h-4 w-4 text-amber-600" />}
            </div>
          </button>

          {dupFinderOpen && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-amber-700 pb-1">
                <strong>Legitimate duplicates</strong> (same agent listed &amp; sold, two agents on opposite sides, or same address sold in different years) — click <strong>Accept as Legitimate</strong> to hide the group.
                {' '}<strong>True duplicates</strong> — use <strong>Delete</strong> on the row(s) to remove.
              </p>
              {visibleDupGroups.map((group) => (
                <div key={group.key} className="rounded-md border border-amber-200 bg-white dark:bg-amber-950/20 overflow-hidden">
                  <div className="px-3 py-2 bg-amber-100 dark:bg-amber-900/30 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-amber-900 dark:text-amber-200 min-w-0 truncate">
                      {group.txs[0].address || '(no address)'}
                      <span className="ml-2 text-xs font-normal text-amber-700">— {group.txs[0].agentDisplayName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-semibold">
                        {group.txs.length} transactions
                      </span>
                      <button
                        className="text-xs bg-green-100 text-green-800 border border-green-300 rounded px-2 py-1 hover:bg-green-200 font-medium whitespace-nowrap"
                        onClick={() => acceptDupGroup(group.key)}
                        title="Mark this group as legitimate — hides it from the duplicate finder for this session"
                      >
                        ✓ Accept as Legitimate
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-100 text-muted-foreground">
                        <th className="text-left px-3 py-1.5 font-medium">Status</th>
                        <th className="text-left px-3 py-1.5 font-medium">Type</th>
                        <th className="text-left px-3 py-1.5 font-medium">Year</th>
                        <th className="text-left px-3 py-1.5 font-medium">Contract Date</th>
                        <th className="text-left px-3 py-1.5 font-medium">Close Date</th>
                        <th className="text-left px-3 py-1.5 font-medium">Sale Price</th>
                        <th className="text-left px-3 py-1.5 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.txs.map((tx, ti) => (
                        <tr key={tx.id} className={ti % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-amber-50/50 dark:bg-amber-950/10'}>
                          <td className="px-3 py-1.5">
                            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold', statusConfig[tx.status]?.color ?? 'bg-gray-200 text-gray-700')}>
                              {statusConfig[tx.status]?.label ?? tx.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{closingTypeLabel[(tx as any).closingType] ?? (tx as any).closingType ?? '—'}</td>
                          <td className="px-3 py-1.5 font-medium">{(tx as any).year ?? '—'}</td>
                          <td className="px-3 py-1.5">{formatDate(tx.contractDate)}</td>
                          <td className="px-3 py-1.5">{formatDate(tx.closedDate ?? (tx as any).closingDate)}</td>
                          <td className="px-3 py-1.5">{(tx as any).salePrice ? formatCurrency((tx as any).salePrice) : (tx.dealValue ? formatCurrency(tx.dealValue) : '—')}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <Link href={`/dashboard/admin/transactions/edit?id=${tx.id}`}>
                                <button className="text-blue-600 hover:underline text-[11px]">Edit</button>
                              </Link>
                              <span className="text-muted-foreground">·</span>
                              <button
                                className="text-red-600 hover:underline text-[11px]"
                                onClick={() => { setDeleteTx(tx); setDeleteOpen(true); }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ALERTS */}
      {recalcResult && (
        <Alert className="border-green-200 bg-green-50">
          <RefreshCw className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Rollups Rebuilt</AlertTitle>
          <AlertDescription className="text-green-700">
            Successfully rebuilt leaderboard data for {recalcResult.rebuilt} agent{recalcResult.rebuilt !== 1 ? 's' : ''} for {recalcResult.year}.
          </AlertDescription>
        </Alert>
      )}
      {recalcError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Recalculation Failed</AlertTitle>
          <AlertDescription>{recalcError}</AlertDescription>
        </Alert>
      )}
      {pageError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}
      {exportError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Export Failed</AlertTitle>
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gross Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(totalGross)}</p><p className="text-xs text-muted-foreground">{filtered.length} transactions</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Net to Agents</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">{formatCurrency(totalNet)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Company Retained</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(totalBroker)}</p></CardContent>
        </Card>
      </div>

      {/* FILTERS */}
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Address Search */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Search by Address</span>
            <Input
              placeholder="Type an address to search..."
              value={addressSearch}
              onChange={(e) => setAddressSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Year</span>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{statusConfig[s]?.label ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Agent</span>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agentNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {yearFilter !== 'all' ? ` in ${yearFilter}` : ''} ({transactions.length} total) · Click a row to edit
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* ── Bulk-select toolbar — appears when any rows are selected ── */}
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2">
              <span className="text-sm font-medium text-destructive">
                {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete Selected
                </Button>
              </div>
            </div>
          )}
          {loadingTx ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No transactions found for the selected filters.</p>
              <Link href="/dashboard/transactions/new">
                <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Add the first transaction</Button>
              </Link>
            </div>
          ) : (
            <>
              {/* ── Mobile card layout (sm and below) ─────────────────────────── */}
              <div className="flex flex-col gap-3 sm:hidden">
                {filtered.map((t) => {
                  const net = t.splitSnapshot?.agentNetCommission ?? (t as any).netCommission ?? 0;
                  const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                  const sc = statusConfig[t.status] || statusConfig.pending;
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.99]"
                      onClick={() => openEdit(t)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{t.address || '—'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.agentDisplayName ?? '—'}</p>
                        </div>
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0', sc.color)}>
                          {sc.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Sale Price</p>
                          <p className="text-sm font-semibold">{t.dealValue ? formatCurrency(t.dealValue) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Gross GCI</p>
                          <p className="text-sm font-semibold">{gross ? formatCurrency(gross) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Net to Agent</p>
                          <p className="text-sm font-semibold text-primary">{net ? formatCurrency(net) : '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{txTypeLabel[t.transactionType || ''] ?? t.transactionType ?? '—'}</span>
                        <span>{formatDate(t.closedDate ?? (t as any).closingDate) || formatDate(t.contractDate) || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t">
                        <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={(e) => { e.stopPropagation(); openTransfer(t); }}>
                          <ArrowRightLeft className="h-3 w-3 mr-1" /> Transfer
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openDelete(t); }}>
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* ── Desktop table layout (sm and above) ───────────────────────── */}
              <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] px-2 align-middle">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer block"
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                          onChange={toggleSelectAll}
                          title="Select all visible"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap w-[100px]" onClick={() => toggleSort('status')}>
                      <span className="flex items-center">Status<SortIcon col="status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[160px] max-w-[220px]" onClick={() => toggleSort('address')}>
                      <span className="flex items-center">Address<SortIcon col="address" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[140px]" onClick={() => toggleSort('agent')}>
                      <span className="flex items-center">Agent<SortIcon col="agent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[90px]" onClick={() => toggleSort('closingType')}>
                      <span className="flex items-center">Side<SortIcon col="closingType" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px]" onClick={() => toggleSort('dealType')}>
                      <span className="flex items-center">Deal Type<SortIcon col="dealType" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[120px]" onClick={() => toggleSort('contractDate')}>
                      <span className="flex items-center">Contract Date<SortIcon col="contractDate" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px]" onClick={() => toggleSort('closedDate')}>
                      <span className="flex items-center">Close Date<SortIcon col="closedDate" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('dealValue')}>
                      <span className="flex items-center justify-end">Deal Value<SortIcon col="dealValue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('grossComm')}>
                      <span className="flex items-center justify-end">Gross Comm.<SortIcon col="grossComm" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('netAgent')}>
                      <span className="flex items-center justify-end">Net to Agent<SortIcon col="netAgent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('companyRetained')}>
                      <span className="flex items-center justify-end">Co. Retained<SortIcon col="companyRetained" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[90px]" onClick={() => toggleSort('source')}>
                      <span className="flex items-center">Source<SortIcon col="source" /></span>
                    </TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                    const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                    const broker = t.splitSnapshot?.companyRetained ?? 0;
                    const sc = statusConfig[t.status] || statusConfig.pending;
                    return (
                      <TableRow
                        key={t.id}
                        className={cn('cursor-pointer hover:bg-muted/40 transition-colors group', selectedIds.has(t.id) && 'bg-destructive/5')}
                        onClick={() => openEdit(t)}
                      >
                        <TableCell className="w-[40px] px-2 align-middle" onClick={e => { e.stopPropagation(); toggleSelect(t.id); }}>
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 cursor-pointer block"
                              checked={selectedIds.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="w-[130px]">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <button className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity',
                                sc.color
                              )}>
                                {sc.label}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuLabel className="text-xs text-muted-foreground">Change Status</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {ALL_STATUSES
                                .filter(s => {
                                  if (s === t.status) return false; // hide current
                                  if ((s as string) === 'temp_off_market' &&
                                    (t.status === 'closed' || t.status === 'sold')) return false;
                                  return true;
                                })
                                .map(s => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!user) return;
                                      try {
                                        const token = await user.getIdToken();
                                        const res = await fetch('/api/admin/transactions', {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                          body: JSON.stringify({ id: t.id, status: s }),
                                        });
                                        const data = await res.json();
                                        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
                                        setTransactions(prev =>
                                          prev.map(tx => tx.id === t.id ? { ...tx, status: s as Transaction['status'] } : tx)
                                        );
                                      } catch (err: any) {
                                        setPageError(err.message);
                                      }
                                    }}
                                    className="flex items-center gap-2 text-xs cursor-pointer"
                                  >
                                    <span className={cn(
                                      'inline-block w-2 h-2 rounded-full flex-shrink-0',
                                      (s as string) === 'active' ? 'bg-blue-500' :
                                      (s as string) === 'temp_off_market' ? 'bg-orange-500' :
                                      (s as string) === 'pending' ? 'bg-yellow-500' :
                                      (s as string) === 'sold' || (s as string) === 'closed' ? 'bg-green-600' :
                                      (s as string) === 'canceled' || (s as string) === 'cancelled' ? 'bg-red-500' :
                                      'bg-gray-500'
                                    )} />
                                    {statusConfig[s]?.label ?? s}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="min-w-[160px] max-w-[220px]">
                          <div className="font-medium truncate text-sm">{t.address || '—'}</div>
                        </TableCell>
                        <TableCell className="min-w-[140px] whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{t.agentDisplayName ?? '—'}</span>
                            {(t as any).hasCoAgent && (t as any).coAgent?.agentDisplayName && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" /></svg>
                                w/ {(t as any).coAgent.agentDisplayName}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[90px]">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/50 whitespace-nowrap">
                            {closingTypeLabel[(t as any).closingType] ?? (t as any).closingType ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[110px]">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/50 whitespace-nowrap">
                            {txTypeLabel[t.transactionType || ''] ?? t.transactionType ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[120px] whitespace-nowrap">{formatDate(t.contractDate)}</TableCell>
                        <TableCell className="min-w-[110px] whitespace-nowrap">{formatDate(t.closedDate ?? (t as any).closingDate)}</TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap">{t.dealValue ? formatCurrency(t.dealValue) : '—'}</TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap">{gross ? formatCurrency(gross) : '—'}</TableCell>
                        <TableCell className="min-w-[110px] text-right font-semibold text-primary whitespace-nowrap">{net ? formatCurrency(net) : '—'}</TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap">{broker ? formatCurrency(broker) : '—'}</TableCell>
                        <TableCell className="min-w-[90px]"><Badge variant="secondary" className="text-xs capitalize">{t.source ?? 'manual'}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(t); }} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-7 w-7',
                                t.status === 'temp_off_market' && 'text-orange-600 hover:text-orange-700'
                              )}
                              onClick={(e) => { e.stopPropagation(); openQuickStatus(t); }}
                              title="Change listing status"
                            >
                              <Tags className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openTransfer(t); }} title="Transfer to another agent">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openDelete(t); }} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── EDIT SHEET ── */}

      {/* ── QUICK STATUS CHANGE DIALOG ── */}
      <Dialog open={quickStatusOpen} onOpenChange={setQuickStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" /> Change Listing Status
            </DialogTitle>
            <DialogDescription>
              Update the status for this listing. Use &quot;Temp Off Market&quot; to temporarily remove it from active listings, then set back to &quot;Active&quot; when ready.
            </DialogDescription>
          </DialogHeader>
          {quickStatusTx && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="font-medium text-sm">{quickStatusTx.address}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Agent: <strong>{quickStatusTx.agentDisplayName ?? '—'}</strong>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current:</span>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    statusConfig[quickStatusTx.status]?.color || 'bg-gray-500/80 text-white'
                  )}>
                    {statusConfig[quickStatusTx.status]?.label ?? quickStatusTx.status}
                  </span>
                </div>
              </div>
              {(quickStatusTx?.status === 'closed' || quickStatusTx?.status === 'sold') && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <strong>Note:</strong> Closed listings cannot be moved to Temp Off Market. Only status corrections (e.g. Cancelled) are available.
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">New Status</Label>
                <Select value={quickStatusValue} onValueChange={setQuickStatusValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES
                      .filter(s => {
                        // Temp Off Market is not available for closed/sold listings
                        if ((s as string) === 'temp_off_market' &&
                          (quickStatusTx?.status === 'closed' || quickStatusTx?.status === 'sold')) {
                          return false;
                        }
                        return true;
                      })
                      .map(s => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <span className={cn(
                              'inline-block w-2 h-2 rounded-full',
                              (s as string) === 'active' ? 'bg-blue-500' :
                              (s as string) === 'temp_off_market' ? 'bg-orange-500' :
              (s as string) === 'pending' ? 'bg-yellow-500' :
              (s as string) === 'sold' || (s as string) === 'closed' ? 'bg-green-600' :
                              (s as string) === 'canceled' || (s as string) === 'cancelled' ? 'bg-red-500' :
                              'bg-gray-500'
                            )} />
                            {statusConfig[s]?.label ?? s}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickStatusOpen(false)} disabled={quickStatusSaving}>Cancel</Button>
            <Button
              onClick={handleQuickStatus}
              disabled={quickStatusSaving || !quickStatusValue || quickStatusValue === quickStatusTx?.status}
            >
              {quickStatusSaving ? 'Saving...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── TRANSFER DIALOG ── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Transfer Transaction
            </DialogTitle>
            <DialogDescription>
              Reassign this transaction to another agent. All data will be preserved.
            </DialogDescription>
          </DialogHeader>
          {transferTx && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="font-medium">{transferTx.address}</p>
                <p className="text-sm text-muted-foreground">
                  Currently assigned to: <strong>{transferTx.agentDisplayName ?? '—'}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(transferTx.splitSnapshot?.grossCommission ?? transferTx.commission ?? 0)} GCI
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Transfer to Agent</Label>
                <Select value={transferAgentId} onValueChange={(v) => {
                  setTransferAgentId(v);
                  const agent = allAgents.find(a => a.id === v);
                  if (agent) setTransferAgentName(agent.displayName);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select an agent..." /></SelectTrigger>
                  <SelectContent>
                    {allAgents
                      .filter(a => a.id !== transferTx.agentId)
                      .map(a => <SelectItem key={a.id} value={a.id}>{a.displayName}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferring || !transferAgentId}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> {transferring ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTx && (
            <div className="py-4 space-y-2">
              <p className="font-medium">{deleteTx.address}</p>
              <p className="text-sm text-muted-foreground">
                {deleteTx.agentDisplayName} · {formatCurrency(deleteTx.splitSnapshot?.grossCommission ?? deleteTx.commission ?? 0)} GCI
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" /> {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BULK DELETE DIALOG ── */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete {selectedIds.size} Transaction{selectedIds.size !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedIds.size} selected transaction{selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Agent rollups will be rebuilt automatically after deletion.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size} Transaction${selectedIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
