'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Entry = { id: string; workflow?: string; recipientUid?: string; status?: string; channels?: string[]; createdAt?: { _seconds?: number } | string; error?: string };
export default function NotificationDeliveryLogPage() {
  const { user } = useUser(); const [entries, setEntries] = useState<Entry[]>([]); const [error, setError] = useState('');
  useEffect(() => { if (!user) return; user.getIdToken().then((token) => fetch('/api/admin/notification-delivery-log', { headers: { Authorization: `Bearer ${token}` } })).then((response) => response.json()).then((data) => { if (!data.ok) throw new Error(data.error); setEntries(data.entries || []); }).catch((caught) => setError(caught.message || 'Unable to load log.')); }, [user]);
  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Notification Delivery Log</h1><p className="text-sm text-muted-foreground">Scheduled and Sent indicate internal processing. Delivered must come from a provider confirmation; Failed and Skipped due to preferences must not be presented as delivered.</p></div><Card><CardHeader><CardTitle className="text-base">Recent delivery activity</CardTitle><CardDescription>{error || `${entries.length} recent records`}</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Workflow</th><th className="p-2">Recipient</th><th className="p-2">Status</th><th className="p-2">Channels</th><th className="p-2">Detail</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b"><td className="p-2">{entry.workflow || '—'}</td><td className="p-2 font-mono text-xs">{entry.recipientUid || '—'}</td><td className="p-2">{entry.status || '—'}</td><td className="p-2">{(entry.channels || []).join(', ') || '—'}</td><td className="p-2 text-xs text-muted-foreground">{entry.error || '—'}</td></tr>)}</tbody></table></div></CardContent></Card></div>;
}
