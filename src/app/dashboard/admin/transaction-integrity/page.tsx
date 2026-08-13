'use client';

import { FormEvent, useState } from 'react';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchCheck, ShieldCheck } from 'lucide-react';

type RecordShape = {
  id: string; collection: string; transactionId: string | null; address: string; status: string;
  dates: Record<string, unknown>; commission: Record<string, unknown>; clients: Record<string, unknown>;
  nestedContainers: string[]; rawFieldCount: number;
};

const text = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);

export default function TransactionIntegrityPage() {
  const { user } = useUser();
  const [address, setAddress] = useState('104 Tortoise Lane');
  const [records, setRecords] = useState<RecordShape[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/diagnostics/transaction-integrity?address=${encodeURIComponent(address)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to inspect transaction records.');
      setRecords(data.records || []); setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to inspect transaction records.'); }
    finally { setLoading(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6 p-6 pb-16">
    <div><div className="flex items-center gap-2"><SearchCheck className="h-7 w-7 text-sky-600" /><h1 className="text-2xl font-bold">Transaction Integrity Inspector</h1></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Read-only comparison of the canonical transaction record and any staff-queue record for one address. Use it when the Ledger summary and opened form disagree.</p></div>
    <Card><CardContent className="p-5"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={run}><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Property address" /><Button disabled={loading} type="submit"><SearchCheck className="mr-2 h-4 w-4" />{loading ? 'Inspecting…' : 'Inspect Records'}</Button></form></CardContent></Card>
    {error && <Alert variant="destructive"><AlertTitle>Inspector unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {searched && records.length === 0 && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>No matching records</AlertTitle><AlertDescription>No canonical transaction or staff-queue record matched that address text.</AlertDescription></Alert>}
    {records.map((record) => <Card key={`${record.collection}-${record.id}`}><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">{record.address}</CardTitle><Badge>{record.collection}</Badge><Badge variant="secondary">{record.status}</Badge></div><CardDescription>ID: {record.id}{record.transactionId ? ` · Linked transaction: ${record.transactionId}` : ''} · {record.rawFieldCount} saved fields{record.nestedContainers.length ? ` · Nested data: ${record.nestedContainers.join(', ')}` : ''}</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-3">
      <section><h2 className="mb-2 text-sm font-semibold">Key Dates</h2>{Object.entries(record.dates).map(([key, value]) => <p className="mb-1 text-sm" key={key}><span className="text-muted-foreground">{key}: </span>{text(value)}</p>)}</section>
      <section><h2 className="mb-2 text-sm font-semibold">Commission</h2>{Object.entries(record.commission).map(([key, value]) => <p className="mb-1 text-sm" key={key}><span className="text-muted-foreground">{key}: </span>{text(value)}</p>)}</section>
      <section><h2 className="mb-2 text-sm font-semibold">Clients</h2>{Object.entries(record.clients).map(([key, value]) => <p className="mb-1 text-sm" key={key}><span className="text-muted-foreground">{key}: </span>{text(value)}</p>)}</section>
    </CardContent></Card>)}
  </div>;
}
