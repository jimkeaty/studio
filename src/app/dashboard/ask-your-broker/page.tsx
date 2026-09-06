'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Source = { id: string; title: string; jurisdiction?: string | null; formVersion?: string | null; updatedAt?: string | null; documentUrl?: string | null };
type Result = { answer: string; escalated?: boolean; escalationId?: string; sources?: Source[] };

export default function AskYourBrokerPage() {
  const { user, loading } = useUser();
  const searchParams = useSearchParams();
  const [assistantName, setAssistantName] = useState('Ask Your Broker');
  const [question, setQuestion] = useState('');
  const [transactionId, setTransactionId] = useState(searchParams?.get('transactionId') || '');
  const [result, setResult] = useState<Result | null>(null);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/branding').then((response) => response.json()).then((data) => setAssistantName(data.branding?.askYourBrokerName || 'Ask Your Broker')).catch(() => {});
  }, []);

  useEffect(() => {
    const escalationId = searchParams?.get('escalation');
    if (!user || !escalationId) return;
    user.getIdToken().then((token) => fetch(`/api/ask-your-broker?escalation=${encodeURIComponent(escalationId)}`, { headers: { Authorization: `Bearer ${token}` } })).then((response) => response.json()).then((data) => {
      if (data.ok && data.escalation?.brokerAnswer) setResult({ answer: data.escalation.brokerAnswer, escalated: true, escalationId });
    }).catch(() => {});
  }, [searchParams, user]);

  const submit = async () => {
    if (!user || question.trim().length < 3) return;
    setLoadingAnswer(true); setError(''); setResult(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/ask-your-broker', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ question, transactionId: transactionId.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to submit your question.');
      setResult(data);
    } catch (caught: any) { setError(caught.message || 'Unable to submit your question.'); }
    finally { setLoadingAnswer(false); }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Alert><AlertTitle>Sign in required</AlertTitle><AlertDescription>Sign in to use brokerage guidance.</AlertDescription></Alert>;
  return <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
    <Card>
      <CardHeader><CardTitle>{assistantName}</CardTitle><CardDescription>Get help using Smart Broker or answers grounded in broker-approved guidance. Contract interpretation, legal exposure, termination, breach, and judgment calls are routed to your broker rather than answered by AI.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="broker-transaction">Optional transaction ID</Label><Input id="broker-transaction" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Attach a transaction for a concise summary" /></div>
        <div className="space-y-2"><Label htmlFor="broker-question">Question</Label><Textarea id="broker-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do you need help with?" rows={6} maxLength={5000} /></div>
        <Button onClick={submit} disabled={loadingAnswer || question.trim().length < 3}>{loadingAnswer ? 'Reviewing approved guidance…' : `Ask ${assistantName}`}</Button>
        {error && <Alert variant="destructive"><AlertTitle>Question not submitted</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
    </Card>
    {result && <Card><CardHeader><CardTitle>{result.escalated ? 'Broker review' : 'Approved guidance'}</CardTitle><CardDescription>{result.escalated ? 'Your broker or designated reviewer has been notified. Check this page again after they reply.' : 'This response is limited to the approved sources listed below.'}</CardDescription></CardHeader><CardContent className="space-y-4"><p className="whitespace-pre-wrap text-sm leading-6">{result.answer}</p>{(result.sources || []).length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold">Approved sources</h2><ul className="list-disc space-y-1 pl-5 text-sm">{result.sources?.map((source) => <li key={source.id}>{source.documentUrl ? <a className="underline" href={source.documentUrl} target="_blank" rel="noreferrer">{source.title}</a> : source.title}{source.jurisdiction ? ` — ${source.jurisdiction}` : ''}{source.formVersion ? `, ${source.formVersion}` : ''}</li>)}</ul></div>}</CardContent></Card>}
  </div>;
}
