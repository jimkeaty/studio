'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Escalation = { id: string; status: string; agentName?: string; question?: string; transactionContext?: Record<string, string> | null; escalationReason?: string; brokerAnswer?: string; };

export default function BrokerReviewPage() {
  const { user, loading } = useUser();
  const [items, setItems] = useState<Escalation[]>([]);
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [answer, setAnswer] = useState('');
  const [addToKnowledgeBase, setAddToKnowledgeBase] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoadingItems(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/ask-your-broker/escalations', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load broker reviews.');
      setItems(data.escalations || []);
    } catch (caught: any) { setError(caught.message || 'Unable to load broker reviews.'); }
    finally { setLoadingItems(false); }
  };
  useEffect(() => { load(); }, [user]);
  const choose = (item: Escalation) => { setSelected(item); setAnswer(item.brokerAnswer || ''); setKnowledgeTitle(item.question ? `Broker guidance: ${item.question}` : ''); setAddToKnowledgeBase(false); };
  const submit = async () => {
    if (!user || !selected || !answer.trim()) return;
    setSaving(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/ask-your-broker/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ answer, addToKnowledgeBase, knowledgeTitle }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save the broker response.');
      setSelected(null); setAnswer(''); await load();
    } catch (caught: any) { setError(caught.message || 'Unable to save the broker response.'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Ask Your Broker — Review Queue</h1><p className="text-sm text-muted-foreground">Only provide guidance you approve. Adding an answer to the knowledge base is optional and never automatic.</p></div>{error && <Alert variant="destructive"><AlertTitle>Review queue issue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}<div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><Card><CardHeader><CardTitle className="text-base">Open and answered requests</CardTitle></CardHeader><CardContent className="space-y-2">{loadingItems ? <p className="text-sm text-muted-foreground">Loading requests…</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">No broker review requests are waiting.</p> : items.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className="w-full rounded-md border p-3 text-left hover:bg-muted"><p className="text-xs font-semibold uppercase text-muted-foreground">{item.status}</p><p className="font-medium">{item.agentName || 'Agent'}</p><p className="line-clamp-2 text-sm">{item.question}</p></button>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">{selected ? 'Broker response' : 'Select a request'}</CardTitle><CardDescription>{selected?.escalationReason || 'Select a review request from the queue.'}</CardDescription></CardHeader>{selected && <CardContent className="space-y-4"><div className="rounded-md bg-muted p-3 text-sm"><strong>Question:</strong> {selected.question}{selected.transactionContext?.property && <><br /><strong>Property:</strong> {selected.transactionContext.property}</>}</div><div className="space-y-2"><Label htmlFor="broker-answer">Approved response</Label><Textarea id="broker-answer" rows={8} value={answer} onChange={(event) => setAnswer(event.target.value)} /></div><div className="flex items-center gap-2"><Checkbox id="add-to-kb" checked={addToKnowledgeBase} onCheckedChange={(checked) => setAddToKnowledgeBase(checked === true)} /><Label htmlFor="add-to-kb">Add this answer to Ask Your Broker Knowledge Base</Label></div>{addToKnowledgeBase && <div className="space-y-2"><Label htmlFor="kb-title">Knowledge base title</Label><Input id="kb-title" value={knowledgeTitle} onChange={(event) => setKnowledgeTitle(event.target.value)} /></div>}<Button onClick={submit} disabled={saving || !answer.trim()}>{saving ? 'Saving response…' : 'Send broker response'}</Button></CardContent>}</Card></div></div>;
}
