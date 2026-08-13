'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, CircleDollarSign, RefreshCw, SearchCheck } from 'lucide-react';

type AuditRow = {
  id: string;
  address: string;
  agent: string;
  status: string;
  basePrice: number;
  commissionRate: number;
  brokerAmount: number;
  agentAmount: number;
  calculatedGci: number;
  splitInferredGci: number;
  resolvedGci: number;
  resolution: string;
};

type Audit = {
  generatedAt: string;
  summary: { openCount: number; directGciCount: number; resolvedOnOpenCount: number; needsReviewCount: number };
  resolvedOnOpen: AuditRow[];
  needsReview: AuditRow[];
};

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

export default function GciIntegrityPage() {
  const { user } = useUser();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/diagnostics/gci-integrity', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to run GCI integrity audit.');
      setAudit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run GCI integrity audit.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void runAudit(); }, [runAudit]);

  const metrics = [
    { label: 'Open Transactions', value: audit?.summary.openCount ?? '—', icon: SearchCheck, tone: 'text-sky-600' },
    { label: 'Direct GCI Stored', value: audit?.summary.directGciCount ?? '—', icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Resolved on Open', value: audit?.summary.resolvedOnOpenCount ?? '—', icon: CircleDollarSign, tone: 'text-violet-600' },
    { label: 'Needs Review', value: audit?.summary.needsReviewCount ?? '—', icon: AlertTriangle, tone: 'text-amber-600' },
  ];

  const Table = ({ rows, review }: { rows: AuditRow[]; review?: boolean }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="pb-3 pr-4">Transaction</th><th className="pb-3 pr-4">Agent</th><th className="pb-3 pr-4">Status</th><th className="pb-3 pr-4">Price / Rate</th><th className="pb-3 pr-4">Saved Split</th><th className="pb-3">Audit Result</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.id} className="border-b last:border-0 align-top">
            <td className="py-3 pr-4 font-medium">{row.address}</td><td className="py-3 pr-4">{row.agent}</td><td className="py-3 pr-4"><Badge variant="secondary">{row.status}</Badge></td>
            <td className="py-3 pr-4">{money(row.basePrice)} {row.commissionRate > 0 ? `· ${row.commissionRate}%` : ''}</td>
            <td className="py-3 pr-4">Broker {money(row.brokerAmount)}<br />Agent {money(row.agentAmount)}</td>
            <td className="py-3"><span className={review ? 'text-amber-700' : 'text-emerald-700'}>{row.resolution}{row.resolvedGci > 0 ? ` (${money(row.resolvedGci)})` : ''}</span></td>
          </tr>)}
          {!loading && rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No transactions in this category.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return <div className="mx-auto max-w-7xl space-y-6 p-6 pb-16">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><SearchCheck className="h-7 w-7 text-sky-600" /><h1 className="text-2xl font-bold">GCI Integrity Audit</h1></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Read-only scan of open transaction commission data. It distinguishes records that the current form can resolve on open from records that still lack enough saved values to calculate GCI.</p></div><Button onClick={() => void runAudit()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Run Audit</Button></div>
    {error && <Alert variant="destructive"><AlertTitle>Audit unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Card key={metric.label}><CardContent className="flex items-center gap-4 p-5"><metric.icon className={`h-8 w-8 ${metric.tone}`} /><div><p className="text-2xl font-bold">{metric.value}</p><p className="text-sm text-muted-foreground">{metric.label}</p></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Requires Manual Review</CardTitle><CardDescription>Open files with evidence of commission data but insufficient values to calculate or infer GCI. No record is changed by this audit.</CardDescription></CardHeader><CardContent><Table rows={audit?.needsReview || []} review /></CardContent></Card>
    <Card><CardHeader><CardTitle>Resolved by Current Form on Open</CardTitle><CardDescription>Open files with stored GCI of zero/blank that the current form can reconstruct from saved price and rate or saved split dollars.</CardDescription></CardHeader><CardContent><Table rows={audit?.resolvedOnOpen || []} /></CardContent></Card>
    {audit?.generatedAt && <p className="text-xs text-muted-foreground">Last audit: {new Date(audit.generatedAt).toLocaleString()}</p>}
  </div>;
}
