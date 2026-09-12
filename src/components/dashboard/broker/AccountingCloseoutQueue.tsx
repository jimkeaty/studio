'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CircleAlert, Loader2, Pencil, Receipt, RefreshCw, Search } from 'lucide-react';

type AccountingFieldFormat = 'currency' | 'percent' | 'text' | 'date';
type AccountingField = { id: string; label: string; required: boolean; state: string; value: string | number | boolean | null; detail?: string | null; format?: AccountingFieldFormat };
type AccountingItem = {
  transactionId: string;
  transaction: { propertyAddress: string; mlsNumber: string; status: string };
  accounting: {
    status: 'new' | 'in_progress' | 'needs_information' | 'completed' | 'archived';
    handedOffAt?: string | null;
    requiredMissing: string[];
    snapshot: { fields: AccountingField[] };
  };
};

const statusLabel: Record<string, string> = {
  new: 'New', in_progress: 'In Progress', needs_information: 'Needs Information', completed: 'Completed', archived: 'Archived',
};

function field(item: AccountingItem, id: string) {
  return item.accounting.snapshot.fields.find((entry) => entry.id === id);
}

function textValue(item: AccountingItem, id: string, fallback = '—') {
  const value = field(item, id)?.value;
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function moneyValue(item: AccountingItem, id: string) {
  const value = field(item, id)?.value;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    : '—';
}

function dateValue(item: AccountingItem, id: string) {
  const value = textValue(item, id, '');
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AccountingCloseoutQueue() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const selectedTransactionId = searchParams?.get('transactionId') || '';
  const [items, setItems] = useState<AccountingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/accounting-closeout?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load Accounting Queue');
      setItems(data.items || []);
    } catch (cause: any) {
      setError(cause.message || 'Unable to load Accounting Queue');
    } finally {
      setLoading(false);
    }
  }, [filter, user]);

  useEffect(() => { load(); }, [load]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.transaction.propertyAddress,
      item.transaction.mlsNumber,
      item.transactionId,
      textValue(item, 'clientNames', ''),
      textValue(item, 'agents', ''),
      textValue(item, 'leadSource', ''),
    ].some((value) => value.toLowerCase().includes(query)));
  }, [items, search]);

  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => {
    result[item.accounting.status] = (result[item.accounting.status] || 0) + 1;
    return result;
  }, {}), [items]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Receipt className="h-6 w-6 text-amber-600" />Accounting Closeout Queue</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Select a transaction to open the same full editor used by the Transaction Ledger. Accounting, Staff, TC, and Admin can correct transaction details and commissions, save them through the canonical transaction route, then complete Accounting from that edit screen.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <Alert>
        <Receipt className="h-4 w-4" />
        <AlertTitle>One shared Accounting queue</AlertTitle>
        <AlertDescription>New closeouts notify the designated Accounting recipient according to that person’s notification preferences. Cases are not manually taken or assigned, so Staff and Accounting can work the same transaction when needed.</AlertDescription>
      </Alert>

      {error && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Accounting Queue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xl font-bold">{items.length}</div><div className="text-xs text-muted-foreground">Visible closeouts</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-blue-700">{counts.new || 0}</div><div className="text-xs text-muted-foreground">New</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-amber-700">{counts.needs_information || 0}</div><div className="text-xs text-muted-foreground">Need information</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-emerald-700">{counts.completed || 0}</div><div className="text-xs text-muted-foreground">Completed</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base">{visibleItems.length} closeout{visibleItems.length === 1 ? '' : 's'}</CardTitle>
              <CardDescription>Open a transaction to make changes, save, and complete Accounting.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search address, client, agent, or source" /></div>
              <Select value={filter} onValueChange={setFilter}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{['all', 'new', 'in_progress', 'needs_information', 'completed'].map((value) => <SelectItem key={value} value={value}>{value === 'all' ? 'All cases' : statusLabel[value]}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleItems.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No Accounting closeouts match this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="min-w-[190px]">Address</TableHead><TableHead>Client(s)</TableHead><TableHead>Agent(s)</TableHead><TableHead>Lead source</TableHead><TableHead>Close date</TableHead><TableHead className="text-right">Sales price</TableHead><TableHead className="text-right">GCI</TableHead><TableHead className="text-right">Agent Take Home</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>{visibleItems.map((item) => {
                  const isSelected = item.transactionId === selectedTransactionId;
                  return <TableRow key={item.transactionId} className={isSelected ? 'bg-amber-50/70 dark:bg-amber-950/20' : 'hover:bg-muted/40'}>
                    <TableCell className="font-medium"><div className="max-w-52 truncate">{item.transaction.propertyAddress || 'Address missing'}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.transaction.mlsNumber ? `MLS ${item.transaction.mlsNumber}` : `Transaction ${item.transactionId}`}</div></TableCell>
                    <TableCell className="max-w-44 truncate text-sm">{textValue(item, 'clientNames')}</TableCell>
                    <TableCell className="max-w-44 truncate text-sm">{textValue(item, 'agents')}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{textValue(item, 'leadSource')}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{dateValue(item, 'closeDate')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{moneyValue(item, 'salePrice')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium text-emerald-700">{moneyValue(item, 'grossGci')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{moneyValue(item, 'totalAgentPayout')}</TableCell>
                    <TableCell><Badge variant={item.accounting.status === 'completed' ? 'default' : item.accounting.status === 'needs_information' ? 'destructive' : 'secondary'}>{statusLabel[item.accounting.status]}</Badge>{item.accounting.requiredMissing.length > 0 && <div className="mt-1 text-xs text-destructive">Needs {item.accounting.requiredMissing.length} field{item.accounting.requiredMissing.length === 1 ? '' : 's'}</div>}</TableCell>
                    <TableCell className="text-right"><Link href={`/dashboard/transactions/new?edit=${item.transactionId}&accountingCloseout=1`}><Button size="sm" variant="outline" className="whitespace-nowrap"><Pencil className="mr-1.5 h-3.5 w-3.5" />Open &amp; edit</Button></Link></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
