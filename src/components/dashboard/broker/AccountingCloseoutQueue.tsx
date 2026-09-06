'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, CircleAlert, Loader2, Receipt, RefreshCw, UserPlus } from 'lucide-react';

type AccountingItem = {
  transactionId: string;
  transaction: { propertyAddress: string; mlsNumber: string; status: string };
  accounting: {
    status: 'new' | 'in_progress' | 'needs_information' | 'completed' | 'archived';
    assignedToUid?: string | null;
    assignedToName?: string | null;
    notes?: string;
    requiredMissing: string[];
    fieldOverrides?: Record<string, 'na'>;
    snapshot: { fields: Array<{ id: string; label: string; required: boolean; state: string; value: string | number | boolean | null; detail?: string | null }> };
  };
};

type AccountingUser = { uid: string; name: string; role: string };

const statusLabel: Record<string, string> = {
  new: 'New', in_progress: 'In Progress', needs_information: 'Needs Information', completed: 'Completed', archived: 'Archived',
};

function displayValue(value: string | number | boolean | null, detail?: string | null) {
  const base = value === null ? 'Missing' : typeof value === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
    : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
  return detail ? `${base} · ${detail}` : base;
}

export function AccountingCloseoutQueue() {
  const { user } = useUser();
  const [items, setItems] = useState<AccountingItem[]>([]);
  const [users, setUsers] = useState<AccountingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [needsInfo, setNeedsInfo] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/accounting-closeout?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load Accounting Queue');
      setItems(data.items || []);
      setUsers(data.accountingUsers || []);
    } catch (cause: any) {
      setError(cause.message || 'Unable to load Accounting Queue');
    } finally { setLoading(false); }
  }, [filter, user]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => {
    result[item.accounting.status] = (result[item.accounting.status] || 0) + 1; return result;
  }, {}), [items]);

  const act = async (transactionId: string, action: string, extra: Record<string, unknown> = {}) => {
    if (!user) return;
    setWorkingId(transactionId);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/accounting-closeout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transactionId, action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Accounting action failed');
      await load();
    } catch (cause: any) { setError(cause.message || 'Accounting action failed'); }
    finally { setWorkingId(null); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Receipt className="h-6 w-6 text-amber-600" />Accounting Closeout Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Closed transactions remain Closed while Accounting completes its separate departmental closeout.</p>
        </div>
        <div className="flex gap-2"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{['all', 'new', 'in_progress', 'needs_information', 'completed'].map((value) => <SelectItem key={value} value={value}>{value === 'all' ? 'All cases' : statusLabel[value]}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4"><Card><CardContent className="p-4"><div className="text-xl font-bold">{items.length}</div><div className="text-xs text-muted-foreground">Visible closeouts</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xl font-bold text-blue-700">{counts.new || 0}</div><div className="text-xs text-muted-foreground">New</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xl font-bold text-amber-700">{counts.needs_information || 0}</div><div className="text-xs text-muted-foreground">Need information</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xl font-bold text-emerald-700">{counts.completed || 0}</div><div className="text-xs text-muted-foreground">Completed</div></CardContent></Card></div>
      {error && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Accounting Queue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {items.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No closed transactions are currently awaiting Accounting closeout.</CardContent></Card> : items.map((item) => {
        const accounting = item.accounting; const busy = workingId === item.transactionId;
        return <Card key={item.transactionId} className="overflow-hidden"><CardHeader className="border-b bg-muted/30 pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{item.transaction.propertyAddress || 'Address missing'}</CardTitle><CardDescription>{item.transaction.mlsNumber ? `MLS ${item.transaction.mlsNumber}` : `Transaction ${item.transactionId}`}</CardDescription></div><div className="flex items-center gap-2"><Badge variant={accounting.status === 'completed' ? 'default' : accounting.status === 'needs_information' ? 'destructive' : 'secondary'}>{statusLabel[accounting.status]}</Badge>{accounting.assignedToName && <Badge variant="outline">{accounting.assignedToName}</Badge>}</div></div></CardHeader><CardContent className="space-y-4 pt-4"><div className="grid gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-3">{accounting.snapshot.fields.map((field) => <div key={field.id} className="flex items-start justify-between gap-3 border-b border-dashed py-1.5 text-sm"><span className="text-muted-foreground">{field.label}{field.required ? ' *' : ''}</span><span className={field.state === 'missing' && accounting.fieldOverrides?.[field.id] !== 'na' ? 'font-medium text-destructive text-right' : 'font-medium text-right'}>{accounting.fieldOverrides?.[field.id] === 'na' ? 'N/A' : displayValue(field.value, field.detail)}</span></div>)}</div>{accounting.requiredMissing.length > 0 && <Alert><CircleAlert className="h-4 w-4" /><AlertTitle>Required closeout information is missing</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-2">{accounting.requiredMissing.map((field) => <Button key={field} size="sm" variant="outline" disabled={busy} onClick={() => act(item.transactionId, 'set_field_state', { fieldId: field, state: 'na' })}>Mark {field} N/A</Button>)}</AlertDescription></Alert>}<div className="grid gap-3 border-t pt-4 lg:grid-cols-[1fr_auto]"><div className="space-y-2"><Label htmlFor={`notes-${item.transactionId}`}>Accounting notes</Label><Textarea id={`notes-${item.transactionId}`} value={notes[item.transactionId] ?? accounting.notes ?? ''} onChange={(event) => setNotes((prior) => ({ ...prior, [item.transactionId]: event.target.value }))} placeholder="Document reconciliation notes or final accounting detail." /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => act(item.transactionId, 'save_notes', { notes: notes[item.transactionId] ?? accounting.notes ?? '' })}>Save notes</Button><Input className="max-w-sm" value={needsInfo[item.transactionId] ?? ''} onChange={(event) => setNeedsInfo((prior) => ({ ...prior, [item.transactionId]: event.target.value }))} placeholder="Information requested from TC/Staff" /><Button size="sm" variant="outline" disabled={busy || !(needsInfo[item.transactionId] || '').trim()} onClick={() => act(item.transactionId, 'needs_information', { requestDetail: needsInfo[item.transactionId] })}>Request information</Button></div></div><div className="flex flex-wrap content-start gap-2 lg:justify-end">{!accounting.assignedToUid && <Button size="sm" disabled={busy} onClick={() => act(item.transactionId, 'take')}>Take case</Button>}<Select value={assignee[item.transactionId] || ''} onValueChange={(value) => setAssignee((prior) => ({ ...prior, [item.transactionId]: value }))}><SelectTrigger className="w-44"><SelectValue placeholder="Assign case" /></SelectTrigger><SelectContent>{users.map((entry) => <SelectItem key={entry.uid} value={entry.uid}>{entry.name}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={busy || !assignee[item.transactionId]} onClick={() => act(item.transactionId, 'assign', { assignedToUid: assignee[item.transactionId] })}><UserPlus className="mr-1 h-3.5 w-3.5" />Assign</Button>{accounting.status !== 'completed' ? <Button size="sm" disabled={busy || accounting.requiredMissing.length > 0} onClick={() => act(item.transactionId, 'complete')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Accounting complete</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => act(item.transactionId, 'reopen')}>Reopen</Button>}</div></div></CardContent></Card>;
      })}
    </div>
  );
}
