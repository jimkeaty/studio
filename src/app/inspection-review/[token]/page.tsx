'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function InspectionClientReviewPage() {
  const params = useParams<{ token: string }>(); const [data, setData] = useState<any>(null); const [selections, setSelections] = useState<Record<string, { choice: string; comment: string }>>({}); const [message, setMessage] = useState('');
  useEffect(() => { fetch(`/api/inspection-client-review/${params.token}`).then((response) => response.json()).then((payload) => { setData(payload); const next: Record<string, any> = {}; (payload.findings || []).forEach((finding: any) => { if (finding.selection) next[finding.id] = { choice: finding.selection.choice, comment: finding.selection.comment || '' }; }); setSelections(next); }).catch(() => setData({ ok: false, error: 'Unable to load this review link.' })); }, [params.token]);
  if (!data) return <main className="mx-auto max-w-3xl p-6">Loading inspection review…</main>; if (!data.ok) return <main className="mx-auto max-w-3xl p-6">{data.error}</main>;
  const submit = async () => { setMessage(''); const response = await fetch(`/api/inspection-client-review/${params.token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Object.entries(selections).filter(([, value]) => value.choice).map(([findingId, value]) => ({ findingId, ...value })) }) }); const payload = await response.json(); setMessage(payload.ok ? 'Your selections were sent to your agent for review.' : payload.error || 'Unable to save selections.'); };
  return <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8"><Card><CardHeader><CardTitle>Inspection Review — {data.propertyAddress}</CardTitle><CardDescription>{data.disclaimer}</CardDescription></CardHeader></Card>{data.findings.map((finding: any) => <Card key={finding.id}><CardHeader><CardTitle className="text-lg">{finding.title}</CardTitle><CardDescription>{finding.category.replaceAll('_', ' ')}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{finding.description}</p><div><Label>Your selection</Label><Select value={selections[finding.id]?.choice || ''} onValueChange={(choice) => setSelections((prior) => ({ ...prior, [finding.id]: { choice, comment: prior[finding.id]?.comment || '' } }))}><SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger><SelectContent>{data.choices.map((choice: any) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select></div><Textarea value={selections[finding.id]?.comment || ''} placeholder="Optional comments for your agent" onChange={(event) => setSelections((prior) => ({ ...prior, [finding.id]: { choice: prior[finding.id]?.choice || '', comment: event.target.value } }))} /></CardContent></Card>)}<Button onClick={submit}>Send selections to my agent</Button>{message && <p className="text-sm font-medium">{message}</p>}</main>;
}
