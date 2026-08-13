'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Receipt, Save } from 'lucide-react';

type FeeSettings = { buyerDefault: number; listingDefault: number };

export default function TransactionFeeSettingsPage() {
  const { user } = useUser();
  const [settings, setSettings] = useState<FeeSettings>({ buyerDefault: 395, listingDefault: 150 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/transaction-fee-settings', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load transaction fee defaults.');
        if (!cancelled) setSettings(data.settings);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Unable to load transaction fee defaults.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true); setMessage(null); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/transaction-fee-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save transaction fee defaults.');
      setSettings(data.settings);
      setMessage('Broker transaction-fee defaults saved. New transactions will use these amounts; existing transactions retain their saved fee choice.');
    } catch (err: any) {
      setError(err?.message || 'Unable to save transaction fee defaults.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Receipt className="h-6 w-6" /> Broker Transaction Fee Defaults</h1>
        <p className="mt-1 text-muted-foreground">Set the starting fee for new buyer-side and listing-side transactions. These are defaults only; authorized users can change the amount or select No on any individual transaction.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Default amounts for new transactions</CardTitle>
          <CardDescription>Use 0 when a transaction type should begin with no fee. These settings never overwrite a fee decision already saved on an existing transaction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="buyerFee">Buyer-side default fee ($)</Label>
              <Input id="buyerFee" type="number" min="0" step="0.01" disabled={loading || saving} value={settings.buyerDefault} onChange={(e) => setSettings((prev) => ({ ...prev, buyerDefault: Number(e.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground">Current intended standard: $395.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="listingFee">Listing-side default fee ($)</Label>
              <Input id="listingFee" type="number" min="0" step="0.01" disabled={loading || saving} value={settings.listingDefault} onChange={(e) => setSettings((prev) => ({ ...prev, listingDefault: Number(e.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground">Current intended standard: $150.</p>
            </div>
          </div>
          <Button onClick={save} disabled={loading || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Saving…' : 'Save Broker Fee Defaults'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
