'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import type { Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, FileCheck2, Clock, AlertTriangle, DollarSign, Upload } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

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

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

export default function AdminTransactionLedgerPage() {
  const { user, loading: userLoading } = useUser();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_contract' | 'closed'>('all');

  useEffect(() => {
    const load = async () => {
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
    };
    if (!userLoading && user) load();
  }, [user, userLoading]);

  if (userLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!user) {
    return <Alert><AlertTitle>Authentication Required</AlertTitle><AlertDescription>Please sign in.</AlertDescription></Alert>;
  }

  if (user.uid !== ADMIN_UID) {
    return <Alert variant="destructive"><AlertTitle>Access Denied</AlertTitle><AlertDescription>Admin only.</AlertDescription></Alert>;
  }

  const filtered = transactions.filter(t => {
    const txYear = t.year ? String(t.year) : (t.closedDate ?? t.closingDate ?? t.contractDate ?? '').slice(0, 4);
    const yearMatch = txYear === yearFilter;
    const statusMatch = statusFilter === 'all' || t.status === statusFilter;
    return yearMatch && statusMatch;
  });

  const totalGross = filtered.reduce((s, t) => s + (t.splitSnapshot?.grossCommission ?? t.commission ?? 0), 0);
  const totalNet = filtered.reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0), 0);
  const totalBroker = filtered.reduce((s, t) => s + (t.splitSnapshot?.companyRetained ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaction Ledger</h1>
          <p className="text-muted-foreground">All transactions feeding agent dashboards.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/import">
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Bulk Import</Button>
          </Link>
          <Link href="/dashboard/admin/transactions/new">
            <Button><Plus className="mr-2 h-4 w-4" /> Add Transaction</Button>
          </Link>
        </div>
      </div>

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
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Year</span>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="under_contract">Under Contract</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTx ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No transactions found for the selected filters.</p>
              <Link href="/dashboard/admin/transactions/new">
                <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Add the first transaction</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Close Date</TableHead>
                    <TableHead className="text-right">Deal Value</TableHead>
                    <TableHead className="text-right">Gross Comm.</TableHead>
                    <TableHead className="text-right">Net to Agent</TableHead>
                    <TableHead className="text-right">Co. Retained</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                    const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                    const broker = t.splitSnapshot?.companyRetained ?? 0;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{t.address}</TableCell>
                        <TableCell className="text-sm">{t.agentDisplayName ?? t.agentId ?? t.userId ?? '—'}</TableCell>
                        <TableCell>{t.clientName ?? '—'}</TableCell>
                        <TableCell>
                          {t.transactionType ? (
                            <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{formatDate(t.closedDate ?? t.closingDate)}</TableCell>
                        <TableCell className="text-right">{t.dealValue ? formatCurrency(t.dealValue) : '—'}</TableCell>
                        <TableCell className="text-right">{gross ? formatCurrency(gross) : '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{net ? formatCurrency(net) : '—'}</TableCell>
                        <TableCell className="text-right">{broker ? formatCurrency(broker) : '—'}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs capitalize">{t.source ?? 'manual'}</Badge></TableCell>
                        <TableCell>
                          <Badge className={cn(
                            t.status === 'closed' && 'bg-green-600/80 text-white',
                            (t.status === 'pending' || t.status === 'under_contract') && 'bg-yellow-500/80 text-white',
                            t.status === 'cancelled' && 'bg-red-500/80 text-white',
                          )}>
                            {t.status === 'closed' ? (
                              <span className="flex items-center gap-1"><FileCheck2 className="h-3 w-3" /> Closed</span>
                            ) : t.status === 'under_contract' ? (
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Under Contract</span>
                            ) : (
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t.status}</span>
                            )}
                          </Badge>
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
