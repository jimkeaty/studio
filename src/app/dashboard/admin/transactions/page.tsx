'use client';

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
import {
  Plus, FileCheck2, Clock, AlertTriangle, DollarSign, Upload, Pencil, Trash2,
  Save, X, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ArrowRightLeft,
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
  pending: { label: 'Pending', color: 'bg-yellow-500/80 text-white' },
  under_contract: { label: 'Under Contract', color: 'bg-yellow-500/80 text-white' },
  sold: { label: 'Sold', color: 'bg-green-600/80 text-white' },
  closed: { label: 'Closed', color: 'bg-green-600/80 text-white' },
  canceled: { label: 'Canceled', color: 'bg-red-500/80 text-white' },
  cancelled: { label: 'Canceled', color: 'bg-red-500/80 text-white' },
  expired: { label: 'Expired', color: 'bg-gray-500/80 text-white' },
};

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

const ALL_STATUSES = ['active', 'pending', 'under_contract', 'sold', 'closed', 'canceled', 'expired'] as const;

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

  // Recalculate rollups
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ rebuilt: number; year: number } | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  // Agent list for transfer dropdown
  const [allAgents, setAllAgents] = useState<{ id: string; displayName: string }[]>([]);

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

  useEffect(() => {
    if (!userLoading && user) {
      loadTransactions();
      loadAgents();
    }
  }, [user, userLoading, loadTransactions, loadAgents]);

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

  /* ─── Sort toggle ──────────────────────────────────────────────────── */

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
          <Link href="/dashboard/transactions/new">
            <Button><Plus className="mr-2 h-4 w-4" /> Add Transaction</Button>
          </Link>
        </div>
      </div>

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('status')}>
                      <span className="flex items-center">Status<SortIcon col="status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('address')}>
                      <span className="flex items-center">Address<SortIcon col="address" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('agent')}>
                      <span className="flex items-center">Agent<SortIcon col="agent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('closingType')}>
                      <span className="flex items-center">Side<SortIcon col="closingType" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('dealType')}>
                      <span className="flex items-center">Deal Type<SortIcon col="dealType" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('contractDate')}>
                      <span className="flex items-center">Contract Date<SortIcon col="contractDate" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('closedDate')}>
                      <span className="flex items-center">Close Date<SortIcon col="closedDate" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => toggleSort('dealValue')}>
                      <span className="flex items-center justify-end">Deal Value<SortIcon col="dealValue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => toggleSort('grossComm')}>
                      <span className="flex items-center justify-end">Gross Comm.<SortIcon col="grossComm" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => toggleSort('netAgent')}>
                      <span className="flex items-center justify-end">Net to Agent<SortIcon col="netAgent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => toggleSort('companyRetained')}>
                      <span className="flex items-center justify-end">Co. Retained<SortIcon col="companyRetained" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('source')}>
                      <span className="flex items-center">Source<SortIcon col="source" /></span>
                    </TableHead>
                    <TableHead className="w-[80px]"></TableHead>
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
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openEdit(t)}
                      >
                        <TableCell>
                          <Badge className={cn(sc.color, 'text-xs capitalize whitespace-nowrap')}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{t.address}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{t.agentDisplayName ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {closingTypeLabel[(t as any).closingType] ?? (t as any).closingType ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {txTypeLabel[t.transactionType || ''] ?? t.transactionType ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(t.contractDate)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(t.closedDate ?? (t as any).closingDate)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{t.dealValue ? formatCurrency(t.dealValue) : '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{gross ? formatCurrency(gross) : '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-primary whitespace-nowrap">{net ? formatCurrency(net) : '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{broker ? formatCurrency(broker) : '—'}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs capitalize">{t.source ?? 'manual'}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(t); }} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
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
          )}
        </CardContent>
      </Card>

      {/* ── EDIT SHEET ── */}

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
    </div>
  );
}
