'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AppDefinition = { id: string; name: string; description: string; category: string; externalUrl?: string };
type Rule = { state: 'hidden' | 'coming_soon' | 'active'; roles?: string[]; officeIds?: string[]; teamIds?: string[]; userIds?: string[] };
const list = (value?: string[]) => (value || []).join(', ');
const parse = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export default function AppManagementPage() {
  const { user } = useUser();
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!user) return; user.getIdToken().then((token) => fetch('/api/admin/app-management', { headers: { Authorization: `Bearer ${token}` } })).then((response) => response.json()).then((data) => { if (!data.ok) throw new Error(data.error); setApps(data.apps || []); setRules(data.rollouts || {}); }).catch((error) => setMessage(error.message || 'Unable to load app management.')).finally(() => setLoading(false)); }, [user]);
  const update = (appId: string, patch: Partial<Rule>) => setRules((current) => {
    const currentRule = current[appId] || { state: 'hidden' as const };
    return { ...current, [appId]: { ...currentRule, ...patch } };
  });
  const save = async (appId: string) => { if (!user) return; setSaving(appId); setMessage(''); try { const token = await user.getIdToken(); const response = await fetch('/api/admin/app-management', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ appId, ...(rules[appId] || { state: 'hidden' }) }) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save app rollout.'); update(appId, data.rule); setMessage(`${apps.find((app) => app.id === appId)?.name || 'App'} rollout saved.`); } catch (error: any) { setMessage(error.message || 'Unable to save app rollout.'); } finally { setSaving(null); } };
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading App Management…</div>;
  return <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Admin App Management</h1><p className="text-sm text-muted-foreground">Hidden removes access, Coming Soon is visible but unavailable, and Active enables access. Changes never delete external-app data. Each save records an immutable audit event.</p></div>{message && <Alert><AlertTitle>App rollout</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}<div className="space-y-4">{apps.map((app) => { const rule = rules[app.id] || { state: 'hidden' as const }; return <Card key={app.id}><CardHeader><CardTitle className="text-base">{app.name}</CardTitle><CardDescription>{app.description}{app.externalUrl ? ' This opens the existing external app; no duplicate app is created.' : ''}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Availability</Label><Select value={rule.state} onValueChange={(state: Rule['state']) => update(app.id, { state })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hidden">Hidden</SelectItem><SelectItem value="coming_soon">Coming Soon</SelectItem><SelectItem value="active">Active</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Roles (optional, comma separated)</Label><Input value={list(rule.roles)} onChange={(event) => update(app.id, { roles: parse(event.target.value) })} placeholder="agent, admin, tc" /></div><div className="space-y-2"><Label>Office IDs (optional)</Label><Input value={list(rule.officeIds)} onChange={(event) => update(app.id, { officeIds: parse(event.target.value) })} placeholder="lafayette" /></div><div className="space-y-2"><Label>Team IDs (optional)</Label><Input value={list(rule.teamIds)} onChange={(event) => update(app.id, { teamIds: parse(event.target.value) })} placeholder="team-id" /></div><div className="space-y-2"><Label>Specific user or agent IDs (optional)</Label><Input value={list(rule.userIds)} onChange={(event) => update(app.id, { userIds: parse(event.target.value) })} placeholder="Firebase UID, agent ID" /></div><div className="flex items-end"><Button onClick={() => save(app.id)} disabled={saving === app.id}>{saving === app.id ? 'Saving…' : 'Save rollout'}</Button></div></CardContent></Card>; })}</div></div>;
}
