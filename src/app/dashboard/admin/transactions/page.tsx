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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, FileCheck2, Clock, AlertTriangle, DollarSign, Upload, Pencil, Trash2, Save, X } from 'lucide-react';
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
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_contract' | 'closed'>('all');

  // Edit sheet state
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTransactions = async () => {
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

  useEffect(() => {
    if (!userLoading && user) loadTransactions();
  }, [user, userLoading]);

  // ── Edit handlers ──
  const openEdit = (tx: Transaction) => {
    setEditTx({ ...tx });
    setSaveError(null);
    setEditOpen(true);
  };

  const updateEditField = (field: string, value: any) => {
    if (!editTx) return;
    setEditTx({ ...editTx, [field]: value });
  };

  const updateSplitField = (field: string, value: number) => {
    if (!editTx) return;
    setEditTx({
      ...editTx,
      splitSnapshot: {
        ...editTx.splitSnapshot,
        grossCommission: editTx.splitSnapshot?.grossCommission ?? 0,
        agentNetCommission: editTx.splitSnapshot?.agentNetCommission ?? 0,
        companyRetained: editTx.splitSnapshot?.companyRetained ?? 0,
        [field]: value,
      },
    });
  };

  const handleSave = async () => {
    if (!editTx || !user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editTx.id,
          status: editTx.status,
          transactionType: editTx.transactionType,
          address: editTx.address,
          clientName: editTx.clientName || null,
          dealValue: Number(editTx.dealValue) || 0,
          commission: Number(editTx.commission) || 0,
          contractDate: editTx.contractDate || null,
          closedDate: editTx.closedDate || null,
          notes: editTx.notes || null,
          splitSnapshot: editTx.splitSnapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update');

      // Update local state
      setTransactions(prev =>
        prev.map(t => t.id === editTx.id ? { ...t, ...data.transaction } : t)
      );
      setEditOpen(false);
      setEditTx(null);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handlers ──
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
      // If we were editing this tx, close the edit sheet
      if (editTx?.id === deleteTx.id) {
        setEditOpen(false);
        setEditTx(null);
      }
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setDeleting(false);
    }
  };

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
    const txYear = t.year ? String(t.year) : (t.closedDate ?? (t as any).closingDate ?? t.contractDate ?? '').slice(0, 4);
    const yearMatch = yearFilter === 'all' || txYear === yearFilter;
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
          <Link href="/dashboard/transactions/new">
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
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
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
          <CardDescription>{filtered.length} record{filtered.length !== 1 ? 's' : ''}{yearFilter !== 'all' ? ` in ${yearFilter}` : ''} ({transactions.length} total in database) &middot; Click a row to edit</CardDescription>
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
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const net = t.splitSnapshot?.agentNetCommission ?? t.netCommission ?? 0;
                    const gross = t.splitSnapshot?.grossCommission ?? t.commission ?? 0;
                    const broker = t.splitSnapshot?.companyRetained ?? 0;
                    return (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openEdit(t)}
                      >
                        <TableCell className="font-medium max-w-[200px] truncate">{t.address}</TableCell>
                        <TableCell className="text-sm">{t.agentDisplayName ?? t.agentId ?? (t as any).userId ?? '—'}</TableCell>
                        <TableCell>{t.clientName ?? '—'}</TableCell>
                        <TableCell>
                          {t.transactionType ? (
                            <Badge variant="outline">{txTypeLabel[t.transactionType] ?? t.transactionType}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{formatDate(t.closedDate ?? (t as any).closingDate)}</TableCell>
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
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); openDelete(t); }}
                            >
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
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit Transaction
            </SheetTitle>
            <SheetDescription>
              {editTx?.address} &middot; {editTx?.agentDisplayName}
            </SheetDescription>
          </SheetHeader>

          {editTx && (
            <div className="space-y-6 py-6">
              {saveError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}

              {/* STATUS — Quick Change */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Status</Label>
                <div className="flex gap-2">
                  {(['pending', 'under_contract', 'closed', 'cancelled'] as const).map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant={editTx.status === s ? 'default' : 'outline'}
                      className={cn(
                        editTx.status === s && s === 'closed' && 'bg-green-600 hover:bg-green-700',
                        editTx.status === s && (s === 'pending' || s === 'under_contract') && 'bg-yellow-500 hover:bg-yellow-600',
                        editTx.status === s && s === 'cancelled' && 'bg-red-500 hover:bg-red-600',
                      )}
                      onClick={() => updateEditField('status', s)}
                    >
                      {s === 'under_contract' ? 'Under Contract' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* TRANSACTION TYPE */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Transaction Type</Label>
                <Select
                  value={editTx.transactionType || 'residential_sale'}
                  onValueChange={(v) => updateEditField('transactionType', v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential_sale">Residential Sale</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                    <SelectItem value="commercial_sale">Commercial Sale</SelectItem>
                    <SelectItem value="commercial_lease">Commercial Lease</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ADDRESS */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Address</Label>
                <Input
                  value={editTx.address || ''}
                  onChange={(e) => updateEditField('address', e.target.value)}
                />
              </div>

              {/* CLIENT */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Client Name</Label>
                <Input
                  value={editTx.clientName || ''}
                  onChange={(e) => updateEditField('clientName', e.target.value)}
                />
              </div>

              {/* KEY DATES */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Key Dates</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contract Date</Label>
                    <Input
                      type="date"
                      value={editTx.contractDate || ''}
                      onChange={(e) => updateEditField('contractDate', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Closed Date</Label>
                    <Input
                      type="date"
                      value={editTx.closedDate || ''}
                      onChange={(e) => updateEditField('closedDate', e.target.value || null)}
                    />
                  </div>
                </div>
              </div>

              {/* FINANCIALS */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Financials</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Deal Value ($)</Label>
                    <Input
                      type="number"
                      value={editTx.dealValue || ''}
                      onChange={(e) => updateEditField('dealValue', Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Gross Commission ($)</Label>
                    <Input
                      type="number"
                      value={editTx.commission ?? editTx.splitSnapshot?.grossCommission ?? ''}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        updateEditField('commission', v);
                        updateSplitField('grossCommission', v);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Agent Net ($)</Label>
                    <Input
                      type="number"
                      value={editTx.splitSnapshot?.agentNetCommission ?? ''}
                      onChange={(e) => updateSplitField('agentNetCommission', Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Company Retained ($)</Label>
                    <Input
                      type="number"
                      value={editTx.splitSnapshot?.companyRetained ?? ''}
                      onChange={(e) => updateSplitField('companyRetained', Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {/* NOTES */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Notes</Label>
                <Textarea
                  value={editTx.notes || ''}
                  onChange={(e) => updateEditField('notes', e.target.value)}
                  rows={3}
                />
              </div>

              {/* ACTIONS */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setEditOpen(false); openDelete(editTx); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
                {deleteTx.agentDisplayName} &middot; {formatCurrency(deleteTx.splitSnapshot?.grossCommission ?? deleteTx.commission ?? 0)} GCI
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
