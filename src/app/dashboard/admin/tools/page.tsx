'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle, Loader2, Wrench, Database, Calendar, Users, ArrowRight } from 'lucide-react';

interface MigrationResult {
  ok: boolean;
  migrated?: number;
  fixed?: number;
  message?: string;
  ids?: string[];
  records?: { id: string; updates: Record<string, any> }[];
  error?: string;
}

interface AgentRow {
  agentId: string;
  displayName: string;
  status: string;
  source?: string | null;
}

interface MergeResult {
  ok: boolean;
  keepDisplayName?: string;
  transactionsReassigned?: number;
  profilesDeleted?: number;
  error?: string;
}

export default function AdminToolsPage() {
  const { user } = useUser();

  // Under Contract migration
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  // Year 20226 fix
  const [yearFixRunning, setYearFixRunning] = useState(false);
  const [yearFixResult, setYearFixResult] = useState<MigrationResult | null>(null);

  // Bulk Accept Duplicates
  const [bulkAcceptRunning, setBulkAcceptRunning] = useState(false);
  const [bulkAcceptResult, setBulkAcceptResult] = useState<{
    ok: boolean; accepted?: number; notFound?: number;
    notFoundList?: { address: string; agent: string }[]; error?: string;
  } | null>(null);

  // Manual Agent Merge
  const [allAgents, setAllAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [searchKeep, setSearchKeep] = useState('');
  const [searchDelete, setSearchDelete] = useState('');
  const [keepAgent, setKeepAgent] = useState<AgentRow | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<AgentRow | null>(null);
  const [mergeRunning, setMergeRunning] = useState(false);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  async function getToken() {
    const { getAuth } = await import('firebase/auth');
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    return token;
  }

  // Load agents once on mount
  useEffect(() => {
    if (!user) return;
    setAgentsLoading(true);
    getToken().then(token =>
      fetch('/api/admin/agent-profiles', { headers: { Authorization: `Bearer ${token}` } })
    ).then(r => r.json()).then(data => {
      if (data.ok) setAllAgents(data.agents || []);
    }).catch(() => {}).finally(() => setAgentsLoading(false));
  }, [user]);

  const keepResults = searchKeep.length >= 2
    ? allAgents.filter(a => a.displayName.toLowerCase().includes(searchKeep.toLowerCase())).slice(0, 8)
    : [];
  const deleteResults = searchDelete.length >= 2
    ? allAgents.filter(a => a.displayName.toLowerCase().includes(searchDelete.toLowerCase()) && a.agentId !== keepAgent?.agentId).slice(0, 8)
    : [];

  async function runMerge() {
    if (!keepAgent || !deleteAgent) return;
    if (!confirm(`Merge "${deleteAgent.displayName}" INTO "${keepAgent.displayName}"?\n\nThis will:\n• Reassign all of ${deleteAgent.displayName}'s transactions to ${keepAgent.displayName}\n• Delete the ${deleteAgent.displayName} profile\n\nThis cannot be undone.`)) return;
    setMergeRunning(true);
    setMergeResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/agent-profiles/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keepAgentId: keepAgent.agentId, deleteAgentIds: [deleteAgent.agentId] }),
      });
      const data: MergeResult = await res.json();
      setMergeResult(data);
      if (data.ok) {
        // Remove merged agent from list
        setAllAgents(prev => prev.filter(a => a.agentId !== deleteAgent.agentId));
        setDeleteAgent(null);
        setSearchDelete('');
      }
    } catch (err: any) {
      setMergeResult({ ok: false, error: err?.message || 'Merge failed' });
    } finally {
      setMergeRunning(false);
    }
  }

  async function runMigration() {
    if (!user) return;
    setRunning(true);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/migrations/fix-under-contract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: MigrationResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setRunning(false);
    }
  }

  async function runBulkAcceptDuplicates() {
    if (!user) return;
    if (!confirm('This will permanently mark all 91 pre-verified duplicate groups as legitimate in Firestore. They will no longer appear in the duplicate finder. Continue?')) return;
    setBulkAcceptRunning(true);
    setBulkAcceptResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/migrations/bulk-accept-duplicates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBulkAcceptResult(data);
    } catch (err: any) {
      setBulkAcceptResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setBulkAcceptRunning(false);
    }
  }

  async function runYearFix() {
    if (!user) return;
    setYearFixRunning(true);
    setYearFixResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/migrations/fix-year-20226', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: MigrationResult = await res.json();
      setYearFixResult(data);
    } catch (err: any) {
      setYearFixResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setYearFixRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6" />
          Admin Tools
        </h1>
        <p className="text-muted-foreground mt-1">
          One-time maintenance tasks and data migrations. Each tool is safe to run multiple times.
        </p>
      </div>

      {/* Bulk Accept Duplicates */}
      <Card className="border-green-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle className="text-base">Bulk Accept 91 Pre-Verified Duplicate Groups</CardTitle>
                <CardDescription className="mt-1">
                  Permanently marks all 91 duplicate transaction groups from the spreadsheet as legitimate
                  in Firestore. These groups will no longer appear in the duplicate finder on the Transaction
                  Ledger — even after a page refresh. Categories: same agent listed &amp; sold, same address
                  sold in different years, leases 6+ months apart.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-green-300 text-green-700">One-Time</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {bulkAcceptResult && (
            <Alert variant={bulkAcceptResult.ok ? 'default' : 'destructive'} className={bulkAcceptResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {bulkAcceptResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={bulkAcceptResult.ok ? 'text-green-800' : ''}>
                {bulkAcceptResult.ok ? 'Bulk Accept Complete' : 'Bulk Accept Failed'}
              </AlertTitle>
              <AlertDescription className={bulkAcceptResult.ok ? 'text-green-700' : ''}>
                {bulkAcceptResult.ok ? (
                  <div className="space-y-1">
                    <p>✓ {bulkAcceptResult.accepted} group(s) accepted and saved to Firestore.</p>
                    {(bulkAcceptResult.notFound ?? 0) > 0 && (
                      <div>
                        <p className="text-amber-700">⚠ {bulkAcceptResult.notFound} entry/entries not found in transaction data:</p>
                        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                          {bulkAcceptResult.notFoundList?.map((nf, i) => (
                            <li key={i}>{nf.address} — {nf.agent}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : bulkAcceptResult.error}
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={runBulkAcceptDuplicates}
            disabled={bulkAcceptRunning}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {bulkAcceptRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : 'Accept All 91 Groups'}
          </Button>
        </CardContent>
      </Card>

      {/* Manual Agent Merge */}
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">Manual Agent Profile Merge</CardTitle>
                <CardDescription className="mt-1">
                  Search for two agent profiles by name and merge the duplicate into the primary.
                  All transactions from the duplicate will be reassigned to the primary profile,
                  then the duplicate profile will be deleted.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-blue-300 text-blue-700">Profile Fix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mergeResult && (
            <Alert variant={mergeResult.ok ? 'default' : 'destructive'} className={mergeResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {mergeResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={mergeResult.ok ? 'text-green-800' : ''}>
                {mergeResult.ok ? 'Merge Complete' : 'Merge Failed'}
              </AlertTitle>
              <AlertDescription className={mergeResult.ok ? 'text-green-700' : ''}>
                {mergeResult.ok
                  ? `Merged into "${mergeResult.keepDisplayName}": ${mergeResult.transactionsReassigned} transaction(s) reassigned, ${mergeResult.profilesDeleted} profile(s) deleted.`
                  : mergeResult.error}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr]">
            {/* Keep agent */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-green-700">Primary (Keep)</Label>
              <Input
                placeholder="Search agent name…"
                value={keepAgent ? keepAgent.displayName : searchKeep}
                onChange={e => { setSearchKeep(e.target.value); setKeepAgent(null); }}
                className="border-green-300 focus:border-green-500"
              />
              {keepAgent ? (
                <div className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
                  <span className="font-medium text-green-800">{keepAgent.displayName}</span>
                  <button className="text-xs text-green-600 underline" onClick={() => { setKeepAgent(null); setSearchKeep(''); }}>Clear</button>
                </div>
              ) : keepResults.length > 0 ? (
                <ul className="rounded border border-gray-200 bg-white shadow-sm divide-y text-sm max-h-40 overflow-y-auto">
                  {keepResults.map(a => (
                    <li key={a.agentId}>
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-green-50"
                        onClick={() => { setKeepAgent(a); setSearchKeep(''); }}
                      >
                        {a.displayName}
                        <span className="ml-2 text-xs text-muted-foreground">{a.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center pt-6">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>

            {/* Delete agent */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-red-700">Duplicate (Delete)</Label>
              <Input
                placeholder="Search agent name…"
                value={deleteAgent ? deleteAgent.displayName : searchDelete}
                onChange={e => { setSearchDelete(e.target.value); setDeleteAgent(null); }}
                className="border-red-300 focus:border-red-500"
                disabled={!keepAgent}
              />
              {deleteAgent ? (
                <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm">
                  <span className="font-medium text-red-800">{deleteAgent.displayName}</span>
                  <button className="text-xs text-red-600 underline" onClick={() => { setDeleteAgent(null); setSearchDelete(''); }}>Clear</button>
                </div>
              ) : deleteResults.length > 0 ? (
                <ul className="rounded border border-gray-200 bg-white shadow-sm divide-y text-sm max-h-40 overflow-y-auto">
                  {deleteResults.map(a => (
                    <li key={a.agentId}>
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-red-50"
                        onClick={() => { setDeleteAgent(a); setSearchDelete(''); }}
                      >
                        {a.displayName}
                        <span className="ml-2 text-xs text-muted-foreground">{a.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {keepAgent && deleteAgent && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Ready to merge:</strong> All transactions from <strong>{deleteAgent.displayName}</strong> will be
              reassigned to <strong>{keepAgent.displayName}</strong>, and the duplicate profile will be permanently deleted.
            </div>
          )}

          <Button
            onClick={runMerge}
            disabled={!keepAgent || !deleteAgent || mergeRunning || agentsLoading}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {mergeRunning ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging…</>
            ) : (
              'Merge Profiles'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Migration: Fix Year 20226 Typo */}
      <Card className="border-amber-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              <div>
                <CardTitle className="text-base">Fix Year &quot;20226&quot; Typo</CardTitle>
                <CardDescription className="mt-1">
                  Finds all transactions where a date field contains the typo{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">20226</code> and corrects
                  it to <code className="text-xs bg-muted px-1 py-0.5 rounded">2026</code>.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-amber-300 text-amber-700">Data Fix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {yearFixResult && (
            <Alert variant={yearFixResult.ok ? 'default' : 'destructive'} className={yearFixResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {yearFixResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={yearFixResult.ok ? 'text-green-800' : ''}>
                {yearFixResult.ok ? 'Fix Complete' : 'Fix Failed'}
              </AlertTitle>
              <AlertDescription className={yearFixResult.ok ? 'text-green-700' : ''}>
                {yearFixResult.ok
                  ? yearFixResult.fixed === 0
                    ? 'No transactions with year 20226 found.'
                    : `Fixed ${yearFixResult.fixed} transaction(s).`
                  : yearFixResult.error}
                {yearFixResult.ok && yearFixResult.records && yearFixResult.records.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                      View fixed records ({yearFixResult.records.length})
                    </summary>
                    <ul className="mt-1 space-y-1 text-xs font-mono text-muted-foreground">
                      {yearFixResult.records.map(r => (
                        <li key={r.id}>
                          <span className="font-semibold">{r.id}</span>:{' '}
                          {Object.entries(r.updates).map(([k, v]) => `${k} → ${v}`).join(', ')}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={runYearFix} disabled={yearFixRunning} variant={yearFixResult?.ok && yearFixResult?.fixed === 0 ? 'outline' : 'default'}>
            {yearFixRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning…</> : yearFixResult?.ok ? <><CheckCircle2 className="mr-2 h-4 w-4" />Run Again</> : 'Fix Year 20226 Typo'}
          </Button>
        </CardContent>
      </Card>

      {/* Migration: Fix Under Contract → Pending */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Fix &quot;Under Contract&quot; Status</CardTitle>
                <CardDescription className="mt-1">
                  Finds all transactions with the old{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">under_contract</code> status
                  and updates them to{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">pending</code>.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">Data Migration</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {result && (
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>{result.ok ? 'Migration Complete' : 'Migration Failed'}</AlertTitle>
              <AlertDescription>
                {result.message || result.error}
                {result.ok && result.migrated !== undefined && result.migrated > 0 && result.ids && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                      View updated IDs ({result.ids.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                      {result.ids.map(id => <li key={id}>{id}</li>)}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={runMigration} disabled={running} variant={result?.ok && result?.migrated === 0 ? 'outline' : 'default'}>
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : result?.ok ? <><CheckCircle2 className="mr-2 h-4 w-4" />Run Again</> : 'Run Migration'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
