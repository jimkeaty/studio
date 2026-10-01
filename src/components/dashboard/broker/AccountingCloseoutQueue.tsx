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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CircleAlert, Eye, Loader2, Pencil, Receipt, RefreshCw, Search } from 'lucide-react';

type AccountingFieldFormat = 'currency' | 'percent' | 'text' | 'date';
type AccountingField = { id: string; label: string; required: boolean; state: string; value: string | number | boolean | null; detail?: string | null; format?: AccountingFieldFormat };
type AccountingItem = {
  transactionId: string;
  transaction: { propertyAddress: string; mlsNumber: string; status: string };
  accounting: {
    status: 'new' | 'in_progress' | 'needs_information' | 'completed' | 'archived';
    handedOffAt?: string | null;
    requiredMissing: string[];
    needsInformation?: { detail?: string | null } | null;
    snapshot: { fields: AccountingField[] };
  };
};

const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : '—';
}

function percentValue(item: AccountingItem, id: string) {
  const value = field(item, id)?.value;
  const percent = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(percent) ? `${percent}%` : '—';
}

function dateValue(item: AccountingItem, id: string) {
  const value = textValue(item, id, '');
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function displayValue(item: AccountingItem, id: string) {
  const entry = field(item, id);
  if (!entry) return '—';
  if (entry.format === 'currency') return moneyValue(item, id);
  if (entry.format === 'percent') return percentValue(item, id);
  if (entry.format === 'date') return dateValue(item, id);
  if (typeof entry.value === 'boolean') return entry.value ? 'Yes' : 'No';
  return textValue(item, id);
}

function accountingReviewLabel(item: AccountingItem) {
  if (item.accounting.status === 'needs_information') return 'Needs information';
  if (item.accounting.status === 'completed') return 'Accounting complete';
  return 'Ready for Accounting review';
}

function AccountingDetailField({ item, id }: { item: AccountingItem; id: string }) {
  const entry = field(item, id);
  if (!entry) return null;
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{entry.label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{displayValue(item, id)}</div>
      {entry.detail && <div className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</div>}
    </div>
  );
}

function AccountingDetailSection({ item, title, fields }: { item: AccountingItem; title: string; fields: string[] }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b pb-1 text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((id) => <AccountingDetailField key={id} item={item} id={id} />)}
      </div>
    </section>
  );
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
  const [viewingItem, setViewingItem] = useState<AccountingItem | null>(null);

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
      textValue(item, 'agent', ''),
      textValue(item, 'leadSource', ''),
    ].some((value) => value.toLowerCase().includes(query)));
  }, [items, search]);

  const counts = useMemo(() => ({
    needsInformation: items.filter((item) => item.accounting.status === 'needs_information').length,
    completed: items.filter((item) => item.accounting.status === 'completed').length,
    readyForReview: items.filter((item) => !['needs_information', 'completed'].includes(item.accounting.status)).length,
  }), [items]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Receipt className="h-6 w-6 text-amber-600" />Accounting Closeout Queue</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Every row is a Closed transaction. View the Accounting detail before opening the canonical transaction editor to correct data, save changes, or complete Accounting.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <Alert>
        <Receipt className="h-4 w-4" />
        <AlertTitle>One shared Accounting queue</AlertTitle>
        <AlertDescription>The transaction status remains <strong>Closed</strong> throughout Accounting. Departmental review is shown separately so a new handoff is never confused with the transaction itself being new or in progress.</AlertDescription>
      </Alert>

      {error && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Accounting Queue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xl font-bold">{items.length}</div><div className="text-xs text-muted-foreground">Closed transactions</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-blue-700">{counts.readyForReview}</div><div className="text-xs text-muted-foreground">Ready for Accounting review</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-amber-700">{counts.needsInformation}</div><div className="text-xs text-muted-foreground">Need information</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xl font-bold text-emerald-700">{counts.completed}</div><div className="text-xs text-muted-foreground">Accounting complete</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base">{visibleItems.length} closed transaction{visibleItems.length === 1 ? '' : 's'}</CardTitle>
              <CardDescription>View Accounting details, then open the transaction only when an edit or Accounting completion is needed.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search address, client, agent, or source" /></div>
              <Select value={filter} onValueChange={setFilter}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All closed transactions</SelectItem><SelectItem value="needs_information">Needs information</SelectItem><SelectItem value="completed">Accounting complete</SelectItem></SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleItems.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No Accounting closeouts match this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="min-w-[190px]">Address</TableHead><TableHead>Client(s)</TableHead><TableHead>Agent</TableHead><TableHead>Source</TableHead><TableHead>Close date</TableHead><TableHead className="text-right">Sales price</TableHead><TableHead className="text-right">GCI</TableHead><TableHead>Transaction status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>{visibleItems.map((item) => {
                  const isSelected = item.transactionId === selectedTransactionId;
                  return <TableRow key={item.transactionId} className={isSelected ? 'bg-amber-50/70 dark:bg-amber-950/20' : 'hover:bg-muted/40'}>
                    <TableCell className="font-medium"><div className="max-w-52 truncate">{item.transaction.propertyAddress || 'Address missing'}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.transaction.mlsNumber ? `MLS ${item.transaction.mlsNumber}` : `Transaction ${item.transactionId}`}</div></TableCell>
                    <TableCell className="max-w-44 truncate text-sm">{textValue(item, 'clientNames')}</TableCell>
                    <TableCell className="max-w-44 truncate text-sm">{textValue(item, 'agent')}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{textValue(item, 'leadSource')}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{dateValue(item, 'closeDate')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{moneyValue(item, 'salePrice')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium text-emerald-700">{moneyValue(item, 'grossGci')}</TableCell>
                    <TableCell><Badge variant="outline">{textValue(item, 'transactionStatus', 'Closed')}</Badge>{item.accounting.requiredMissing.length > 0 && <div className="mt-1 text-xs text-destructive">Needs {item.accounting.requiredMissing.length} field{item.accounting.requiredMissing.length === 1 ? '' : 's'}</div>}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => setViewingItem(item)}><Eye className="mr-1.5 h-3.5 w-3.5" />View</Button><Link href={`/dashboard/transactions/new?edit=${item.transactionId}&accountingCloseout=1`}><Button size="sm" variant="outline" className="whitespace-nowrap"><Pencil className="mr-1.5 h-3.5 w-3.5" />Open &amp; edit</Button></Link></div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingItem} onOpenChange={(open) => { if (!open) setViewingItem(null); }}>
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          {viewingItem && <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">Accounting Transaction Detail <Badge variant="outline">Closed</Badge></DialogTitle>
              <DialogDescription>{viewingItem.transaction.propertyAddress || 'Address missing'}{viewingItem.transaction.mlsNumber ? ` · MLS ${viewingItem.transaction.mlsNumber}` : ''}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <span className="font-medium">Accounting review:</span>
                <Badge variant={viewingItem.accounting.status === 'needs_information' ? 'destructive' : viewingItem.accounting.status === 'completed' ? 'default' : 'secondary'}>{accountingReviewLabel(viewingItem)}</Badge>
                {viewingItem.accounting.status === 'needs_information' && viewingItem.accounting.needsInformation?.detail && <span className="text-muted-foreground">{viewingItem.accounting.needsInformation.detail}</span>}
              </div>
              <AccountingDetailSection item={viewingItem} title="Transaction" fields={['type', 'transactionStatus', 'dealType', 'agent', 'propertyAddress', 'leadSource', 'closeDate']} />
              <AccountingDetailSection item={viewingItem} title="Financials" fields={['listPrice', 'salePrice', 'commissionPercent', 'grossGci', 'transactionFee', 'brokerPercent', 'brokerGci', 'referral']} />
              <AccountingDetailSection item={viewingItem} title="Agent and Team Payouts" fields={['agentPercent', 'agentNet', 'teamMember1', 'teamMember1Pct', 'teamMember1Gci', 'teamMember2']} />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setViewingItem(null)}>Close</Button>
              <Link href={`/dashboard/transactions/new?edit=${viewingItem.transactionId}&accountingCloseout=1`}><Button><Pencil className="mr-1.5 h-4 w-4" />Open &amp; edit transaction</Button></Link>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
