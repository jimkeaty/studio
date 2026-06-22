'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle, Loader2, Wrench, Database, Calendar, Users, ArrowRight, Trash2, BarChart2, ShieldCheck, KeyRound, Mail } from 'lucide-react';

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

  // Agent Login Health Check — stamp firebaseUid onto all profiles
  const [uidStampRunning, setUidStampRunning] = useState(false);
  const [uidStampResult, setUidStampResult] = useState<{
    ok: boolean;
    summary?: { stamped: number; alreadyDone: number; noAuthUser: number; skipped: number; errors: number; total: number };
    results?: { profileId: string; email: string; status: string; firebaseUid?: string }[];
    error?: string;
  } | null>(null);
  async function runUidStamp() {
    if (!user) return;
    setUidStampRunning(true);
    setUidStampResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/backfill-agent-uids', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUidStampResult(data);
    } catch (err: any) {
      setUidStampResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setUidStampRunning(false);
    }
  }

  // Bulk Invite Agents
  const [inviteRunning, setInviteRunning] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    ok: boolean;
    dryRun?: boolean;
    summary?: { invited: number; alreadyExists: number; skippedNoEmail: number; wouldInvite: number; errors: number; total: number };
    results?: { profileId: string; email: string; name: string; status: string; firebaseUid?: string; error?: string }[];
    error?: string;
  } | null>(null);

  async function runBulkInvite(dryRun: boolean) {
    if (!user) return;
    if (!dryRun && !confirm(
      `This will create Firebase Auth accounts for all agents that don\'t have one yet and send each a password-setup email.\n\nContinue?`
    )) return;
    setInviteRunning(true);
    setInviteResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/bulk-invite-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      setInviteResult(data);
    } catch (err: any) {
      setInviteResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setInviteRunning(false);
    }
  }

  // Fix All Commission Modes
  const [commFixRunning, setCommFixRunning] = useState(false);
  const [commFixResult, setCommFixResult] = useState<{
    ok: boolean;
    scanned?: number;
    fixed?: number;
    skipped?: number;
    fixedAgents?: { id: string; displayName: string; from: string; to: string }[];
    message?: string;
    error?: string;
  } | null>(null);

  async function runCommissionModeFix() {
    if (!user) return;
    setCommFixRunning(true);
    setCommFixResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/agent-profiles/fix-commission-modes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCommFixResult(data);
    } catch (err: any) {
      setCommFixResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setCommFixRunning(false);
    }
  }

  // Commission % Diagnostics
  const [diagYear, setDiagYear] = useState(String(new Date().getFullYear()));
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<any | null>(null);

  async function runCommissionDiagnostics() {
    if (!user) return;
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/diagnostics/commission-pct?year=${diagYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDiagResult(data);
    } catch (err: any) {
      setDiagResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setDiagRunning(false);
    }
  }

  // Bulk Delete Duplicates
  const [bulkDeleteMode, setBulkDeleteMode] = useState<'idle' | 'dryrun' | 'execute'>('idle');
  const [bulkDeleteResult, setBulkDeleteResult] = useState<any | null>(null);

  async function runBulkDeleteDryRun() {
    if (!user) return;
    setBulkDeleteMode('dryrun');
    setBulkDeleteResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/migrations/bulk-delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setBulkDeleteResult(data);
    } catch (err: any) {
      setBulkDeleteResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setBulkDeleteMode('idle');
    }
  }

  async function runBulkDeleteExecute() {
    if (!user) return;
    if (!bulkDeleteResult?.confirmed) { alert('Run the dry run first to confirm matches.'); return; }
    if (!confirm(`This will permanently DELETE ${bulkDeleteResult.confirmed} transaction(s) from Firestore and rebuild rollups.\n\nAmbiguous (${bulkDeleteResult.ambiguous}) and not-found (${bulkDeleteResult.notFound}) rows will NOT be deleted.\n\nThis cannot be undone. Continue?`)) return;
    setBulkDeleteMode('execute');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/migrations/bulk-delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ execute: true }),
      });
      const data = await res.json();
      setBulkDeleteResult(data);
    } catch (err: any) {
      setBulkDeleteResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setBulkDeleteMode('idle');
    }
  }

  // Bulk Accept Duplicates
  const [bulkAcceptRunning, setBulkAcceptRunning] = useState(false);
  const [bulkAcceptResult, setBulkAcceptResult] = useState<{
    ok: boolean; accepted?: number; notFound?: number;
    notFoundList?: { address: string; agent: string }[]; error?: string;
  } | null>(null);

  // Bulk Accept MLS Duplicates by Year Range
  const [mlsAcceptYearFrom, setMlsAcceptYearFrom] = useState('2004');
  const [mlsAcceptYearTo, setMlsAcceptYearTo] = useState('2020');
  const [mlsAcceptSource, setMlsAcceptSource] = useState('all');
  const [mlsAcceptRunning, setMlsAcceptRunning] = useState(false);
  const [mlsAcceptDryRunResult, setMlsAcceptDryRunResult] = useState<any | null>(null);
  const [mlsAcceptResult, setMlsAcceptResult] = useState<any | null>(null);

  // Operation A — MLS Date Field Fix
  const [opADryRunResult, setOpADryRunResult] = useState<any | null>(null);
  const [opAExecResult, setOpAExecResult] = useState<any | null>(null);
  const [opARunning, setOpARunning] = useState(false);
  const [opAYearFrom, setOpAYearFrom] = useState('');
  const [opAYearTo, setOpAYearTo] = useState('');

  // Firestore Seed / Validate
  const [seedAuditResult, setSeedAuditResult] = useState<any | null>(null);
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedAuditRunning, setSeedAuditRunning] = useState(false);

  // Backfill Team Memberships
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any | null>(null);

  async function runSeedAudit() {
    if (!user) return;
    setSeedAuditRunning(true);
    setSeedAuditResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/seed-validate', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSeedAuditResult(data);
    } catch (err: any) {
      setSeedAuditResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setSeedAuditRunning(false);
    }
  }

  async function runSeedFix() {
    if (!user) return;
    setSeedRunning(true);
    setSeedAuditResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/seed-validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSeedAuditResult(data);
    } catch (err: any) {
      setSeedAuditResult({ ok: false, error: err?.message || 'Unknown error' });
    } finally {
      setSeedRunning(false);
    }
  }

  async function runBackfillMemberships() {
    if (!user) return;
    setBackfillRunning(true);
    setBackfillResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/backfill-memberships', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBackfillResult(data);
    } catch (e: any) {
      setBackfillResult({ ok: false, error: e?.message || 'Unknown error' });
    } finally {
      setBackfillRunning(false);
    }
  }

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

      {/* Bulk Delete Duplicates */}
      <Card className="border-red-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              <div>
                <CardTitle className="text-base">Bulk Delete 60 Duplicate Groups (65 rows)</CardTitle>
                <CardDescription className="mt-1">
                  Matches each DELETE row from the spreadsheet against live Firestore transactions by
                  agent + address + status + listing date. Runs a dry-run first so you can review
                  matches before executing. Ambiguous and not-found rows are never deleted automatically.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-red-300 text-red-700">Destructive</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {bulkDeleteResult && (
            <div className="space-y-3">
              {/* Summary */}
              <Alert variant={bulkDeleteResult.ok ? 'default' : 'destructive'}
                className={bulkDeleteResult.ok ? 'border-blue-200 bg-blue-50' : ''}>
                {bulkDeleteResult.ok ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle className={bulkDeleteResult.ok ? 'text-blue-800' : ''}>
                  {bulkDeleteResult.ok
                    ? bulkDeleteResult.mode === 'EXECUTE' ? 'Delete Complete' : 'Dry Run Complete'
                    : 'Error'}
                </AlertTitle>
                <AlertDescription className={bulkDeleteResult.ok ? 'text-blue-700' : ''}>
                  {bulkDeleteResult.ok ? (
                    <div className="space-y-1 text-sm">
                      <p>Total entries: <strong>{bulkDeleteResult.totalEntries}</strong></p>
                      <p className="text-green-700">✓ Confirmed matches: <strong>{bulkDeleteResult.confirmed}</strong></p>
                      <p className="text-amber-700">⚠ Ambiguous (need manual review): <strong>{bulkDeleteResult.ambiguous}</strong></p>
                      <p className="text-slate-500">✓ Likely already deleted: <strong>{bulkDeleteResult.notFound}</strong></p>
                      {bulkDeleteResult.mode === 'EXECUTE' && (
                        <p className="font-semibold text-green-800">Deleted: {bulkDeleteResult.deleted} | Rollups rebuilt: {bulkDeleteResult.rollupsRebuilt}</p>
                      )}
                    </div>
                  ) : bulkDeleteResult.error}
                </AlertDescription>
              </Alert>

              {/* Not found list — likely already deleted */}
              {bulkDeleteResult.ok && bulkDeleteResult.notFoundList?.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-slate-500">Likely Already Deleted ({bulkDeleteResult.notFoundList.length}) — click to expand</summary>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">These transactions were not found in Firestore. If you deleted them manually through the Transaction Ledger, this is expected and no action is needed. If any have address-only candidates shown below, the agent name or status may differ in Firestore.</p>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {bulkDeleteResult.notFoundList.map((r: any, i: number) => (
                      <li key={i} className="border rounded p-2">
                        <p>Group {r.group}: <strong>{r.address}</strong> — {r.agent} ({r.status}, listing: {r.listingDate || 'n/a'})</p>
                        {r.addrOnlyCandidates?.length > 0 && (
                          <div className="mt-1 ml-2 text-amber-700">
                            <p className="font-medium">⚠ Found by address only (agent/status mismatch):</p>
                            {r.addrOnlyCandidates.map((c: any, j: number) => (
                              <p key={j} className="ml-2">• {c.id} | status: {c.status} | agent: {c.agentDisplayName || c.agentName || c.agentId} | listing: {c.listingDate || 'n/a'}</p>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Ambiguous list */}
              {bulkDeleteResult.ok && bulkDeleteResult.ambiguousList?.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-red-700">Ambiguous — Manual Review Required ({bulkDeleteResult.ambiguousList.length})</summary>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {bulkDeleteResult.ambiguousList.map((r: any, i: number) => (
                      <li key={i} className="border rounded p-2">
                        <p className="font-medium">Group {r.group}: {r.address} — {r.agent}</p>
                        <p className="text-red-600">{r.reason}</p>
                        {r.candidates?.map((c: any, j: number) => (
                          <p key={j} className="ml-2">• {c.id} | {c.status} | listing: {c.listingDate || 'n/a'} | closed: {c.closedDate || 'n/a'}</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={runBulkDeleteDryRun}
              disabled={bulkDeleteMode !== 'idle'}
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {bulkDeleteMode === 'dryrun' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Dry Run…</> : 'Run Dry Run (Preview Only)'}
            </Button>
            <Button
              onClick={runBulkDeleteExecute}
              disabled={bulkDeleteMode !== 'idle' || !bulkDeleteResult?.confirmed}
              variant="destructive"
            >
              {bulkDeleteMode === 'execute' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : `Execute Delete (${bulkDeleteResult?.confirmed ?? 0} confirmed)`}
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Bulk Accept MLS Duplicates by Year Range */}
      <Card className="border-amber-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-amber-600" />
              <div>
                <CardTitle className="text-base">Bulk Accept MLS Duplicate Groups by Year Range</CardTitle>
                <CardDescription className="mt-1">
                  Scans all transactions in the selected year range, finds every duplicate group
                  (same agent + address appearing 2+ times), and marks them all as legitimate in
                  Firestore. Use this to clear the duplicate finder of MLS historical imports
                  (e.g. 2004–2020). Run a Dry Run first to preview how many groups will be accepted.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-amber-300 text-amber-700">Safe</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year From</label>
              <input
                type="number"
                min={2000}
                max={2030}
                value={mlsAcceptYearFrom}
                onChange={e => setMlsAcceptYearFrom(e.target.value)}
                className="w-24 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year To</label>
              <input
                type="number"
                min={2000}
                max={2030}
                value={mlsAcceptYearTo}
                onChange={e => setMlsAcceptYearTo(e.target.value)}
                className="w-24 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Source Filter</label>
              <select
                value={mlsAcceptSource}
                onChange={e => setMlsAcceptSource(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="all">All Sources</option>
                <option value="mls_import">MLS Import Only</option>
                <option value="import">CSV Import Only</option>
              </select>
            </div>
          </div>
          {mlsAcceptDryRunResult && !mlsAcceptResult && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTitle className="text-amber-800">Dry Run Preview</AlertTitle>
              <AlertDescription className="text-amber-700">
                <div className="space-y-1 text-sm">
                  <p>Transactions scanned: <strong>{mlsAcceptDryRunResult.totalTransactionsScanned?.toLocaleString()}</strong></p>
                  <p>Duplicate groups found: <strong>{mlsAcceptDryRunResult.dupGroupsFound}</strong></p>
                  <p>Already accepted: <strong>{mlsAcceptDryRunResult.alreadyAccepted}</strong></p>
                  <p>Would newly accept: <strong>{mlsAcceptDryRunResult.wouldAccept}</strong></p>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {mlsAcceptResult && (
            <Alert variant={mlsAcceptResult.ok ? 'default' : 'destructive'} className={mlsAcceptResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {mlsAcceptResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={mlsAcceptResult.ok ? 'text-green-800' : ''}>
                {mlsAcceptResult.ok ? 'Bulk Accept Complete' : 'Bulk Accept Failed'}
              </AlertTitle>
              <AlertDescription className={mlsAcceptResult.ok ? 'text-green-700' : ''}>
                {mlsAcceptResult.ok ? (
                  <div className="space-y-1 text-sm">
                    <p>✓ Transactions scanned: <strong>{mlsAcceptResult.totalTransactionsScanned?.toLocaleString()}</strong></p>
                    <p>✓ Duplicate groups found: <strong>{mlsAcceptResult.dupGroupsFound}</strong></p>
                    <p>✓ Already accepted (skipped): <strong>{mlsAcceptResult.alreadyAccepted}</strong></p>
                    <p>✓ Newly accepted: <strong>{mlsAcceptResult.newlyAccepted}</strong></p>
                  </div>
                ) : mlsAcceptResult.error}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!user) return;
                setMlsAcceptRunning(true);
                setMlsAcceptDryRunResult(null);
                setMlsAcceptResult(null);
                try {
                  const token = await getToken();
                  const res = await fetch('/api/admin/migrations/bulk-accept-mls-duplicates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      yearFrom: Number(mlsAcceptYearFrom),
                      yearTo: Number(mlsAcceptYearTo),
                      sourceFilter: mlsAcceptSource,
                      dryRun: true,
                    }),
                  });
                  const data = await res.json();
                  setMlsAcceptDryRunResult(data);
                } catch (err: any) {
                  setMlsAcceptDryRunResult({ ok: false, error: err?.message });
                } finally {
                  setMlsAcceptRunning(false);
                }
              }}
              disabled={mlsAcceptRunning}
            >
              {mlsAcceptRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : 'Dry Run (Preview)'}
            </Button>
            <Button
              onClick={async () => {
                if (!user) return;
                const count = mlsAcceptDryRunResult?.wouldAccept ?? '?';
                if (!confirm(`This will mark ${count} duplicate group(s) from ${mlsAcceptYearFrom}–${mlsAcceptYearTo} as legitimate in Firestore. They will no longer appear in the duplicate finder. Continue?`)) return;
                setMlsAcceptRunning(true);
                setMlsAcceptResult(null);
                try {
                  const token = await getToken();
                  const res = await fetch('/api/admin/migrations/bulk-accept-mls-duplicates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      yearFrom: Number(mlsAcceptYearFrom),
                      yearTo: Number(mlsAcceptYearTo),
                      sourceFilter: mlsAcceptSource,
                      dryRun: false,
                    }),
                  });
                  const data = await res.json();
                  setMlsAcceptResult(data);
                } catch (err: any) {
                  setMlsAcceptResult({ ok: false, error: err?.message });
                } finally {
                  setMlsAcceptRunning(false);
                }
              }}
              disabled={mlsAcceptRunning}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {mlsAcceptRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : `Accept All Duplicates (${mlsAcceptYearFrom}–${mlsAcceptYearTo})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Operation A — MLS Date Field Fix */}
      <Card className="border-teal-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              <div>
                <CardTitle className="text-base">Operation A — MLS Date Field Fix</CardTitle>
                <CardDescription className="mt-1">
                  Copies <code className="text-xs bg-muted px-1 rounded">closeDate</code> → <code className="text-xs bg-muted px-1 rounded">closedDate</code> and{' '}
                  <code className="text-xs bg-muted px-1 rounded">underContractDate</code> → <code className="text-xs bg-muted px-1 rounded">contractDate</code> for all MLS-imported transactions
                  where the main date fields are blank. Validates dates before writing. Run Dry Run first.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-teal-300 text-teal-700">Safe — Dry Run First</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year From (optional)</label>
              <input
                type="number" min={2000} max={2030} value={opAYearFrom}
                onChange={e => setOpAYearFrom(e.target.value)}
                placeholder="All"
                className="w-24 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year To (optional)</label>
              <input
                type="number" min={2000} max={2030} value={opAYearTo}
                onChange={e => setOpAYearTo(e.target.value)}
                placeholder="All"
                className="w-24 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              />
            </div>
          </div>

          {opADryRunResult && !opAExecResult && (
            <Alert className="border-teal-200 bg-teal-50">
              <AlertTitle className="text-teal-800">Dry Run Preview — No changes written</AlertTitle>
              <AlertDescription className="text-teal-700">
                <div className="space-y-1 text-sm mt-1">
                  <p>MLS transactions scanned: <strong>{opADryRunResult.summary?.totalMlsTransactionsScanned?.toLocaleString()}</strong></p>
                  <p>Already have closedDate (no change needed): <strong>{opADryRunResult.summary?.alreadyHaveClosedDate?.toLocaleString()}</strong></p>
                  <p>No source date available (cannot fix): <strong>{opADryRunResult.summary?.noSourceDateAvailable?.toLocaleString()}</strong></p>
                  <p className="font-semibold">Would be updated: <strong>{opADryRunResult.summary?.willBeUpdated?.toLocaleString()}</strong></p>
                  <p>— closedDate fixes: <strong>{opADryRunResult.summary?.closedDateFixes?.toLocaleString()}</strong></p>
                  <p>— contractDate fixes: <strong>{opADryRunResult.summary?.contractDateFixes?.toLocaleString()}</strong></p>
                  <p>— year field changes: <strong>{opADryRunResult.summary?.yearChanges?.toLocaleString()}</strong></p>
                  <p className="text-amber-700">Validation failures (will NOT be updated): <strong>{opADryRunResult.summary?.validationFailed?.toLocaleString()}</strong></p>
                </div>
                {opADryRunResult.preview?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1">Sample records that would be updated (first 10):</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 pr-3">Address</th>
                            <th className="text-left py-1 pr-3">Agent</th>
                            <th className="text-left py-1 pr-3">Current closedDate</th>
                            <th className="text-left py-1 pr-3">Source closeDate</th>
                            <th className="text-left py-1 pr-3">Proposed closedDate</th>
                            <th className="text-left py-1 pr-3">Year Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opADryRunResult.preview.slice(0, 10).map((r: any) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-1 pr-3 max-w-[160px] truncate">{r.address || '—'}</td>
                              <td className="py-1 pr-3 max-w-[120px] truncate">{r.agentDisplayName || '—'}</td>
                              <td className="py-1 pr-3 font-mono text-red-600">{r.currentClosedDate || '(blank)'}</td>
                              <td className="py-1 pr-3 font-mono text-blue-600">{r.sourceCloseDate || '—'}</td>
                              <td className="py-1 pr-3 font-mono text-green-700">{r.proposedClosedDate || '—'}</td>
                              <td className="py-1 pr-3">{r.yearWillChange ? <span className="text-amber-700">{r.currentYear} → {r.proposedYear}</span> : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {opADryRunResult.previewTruncated && (
                      <p className="text-xs text-muted-foreground mt-1">Showing first 10 of {opADryRunResult.summary?.willBeUpdated?.toLocaleString()} records.</p>
                    )}
                  </div>
                )}
                {opADryRunResult.validationFailures?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Validation failures (will be skipped — first 5):</p>
                    {opADryRunResult.validationFailures.slice(0, 5).map((r: any) => (
                      <p key={r.id} className="text-xs text-amber-700">{r.address} — {r.validationIssues.join(', ')}</p>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {opAExecResult && (
            <Alert variant={opAExecResult.ok ? 'default' : 'destructive'} className={opAExecResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {opAExecResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={opAExecResult.ok ? 'text-green-800' : ''}>
                {opAExecResult.ok ? 'Operation A Complete' : 'Operation A Failed'}
              </AlertTitle>
              <AlertDescription className={opAExecResult.ok ? 'text-green-700' : ''}>
                {opAExecResult.ok ? (
                  <div className="space-y-1 text-sm">
                    <p>✓ Records updated: <strong>{opAExecResult.summary?.updated?.toLocaleString()}</strong></p>
                    <p>✓ closedDate fixes applied: <strong>{opAExecResult.summary?.closedDateFixes?.toLocaleString()}</strong></p>
                    <p>✓ contractDate fixes applied: <strong>{opAExecResult.summary?.contractDateFixes?.toLocaleString()}</strong></p>
                    <p>✓ Year field recalculations: <strong>{opAExecResult.summary?.yearChanges?.toLocaleString()}</strong></p>
                    <p>✓ Leaderboard rollups rebuilt: <strong>{opAExecResult.rollupRebuilds?.toLocaleString()}</strong></p>
                    <p className="text-amber-700">Skipped (validation failures): <strong>{opAExecResult.summary?.validationFailed?.toLocaleString()}</strong></p>
                  </div>
                ) : opAExecResult.error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!user) return;
                setOpARunning(true);
                setOpADryRunResult(null);
                setOpAExecResult(null);
                try {
                  const token = await getToken();
                  const body: any = { dryRun: true };
                  if (opAYearFrom) body.yearFrom = Number(opAYearFrom);
                  if (opAYearTo) body.yearTo = Number(opAYearTo);
                  const res = await fetch('/api/admin/migrations/mls-date-field-fix', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body),
                  });
                  const data = await res.json();
                  setOpADryRunResult(data);
                } catch (err: any) {
                  setOpADryRunResult({ ok: false, error: err?.message });
                } finally {
                  setOpARunning(false);
                }
              }}
              disabled={opARunning}
            >
              {opARunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</> : 'Dry Run (Preview Only)'}
            </Button>
            <Button
              onClick={async () => {
                if (!user) return;
                if (!opADryRunResult) { alert('Please run a Dry Run first to preview the changes before executing.'); return; }
                const count = opADryRunResult?.summary?.willBeUpdated ?? '?';
                if (!confirm(`This will update ${count} MLS transaction(s) — copying closeDate → closedDate and underContractDate → contractDate. Leaderboard rollups will be rebuilt automatically. Continue?`)) return;
                setOpARunning(true);
                setOpAExecResult(null);
                try {
                  const token = await getToken();
                  const body: any = { dryRun: false };
                  if (opAYearFrom) body.yearFrom = Number(opAYearFrom);
                  if (opAYearTo) body.yearTo = Number(opAYearTo);
                  const res = await fetch('/api/admin/migrations/mls-date-field-fix', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body),
                  });
                  const data = await res.json();
                  setOpAExecResult(data);
                } catch (err: any) {
                  setOpAExecResult({ ok: false, error: err?.message });
                } finally {
                  setOpARunning(false);
                }
              }}
              disabled={opARunning}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {opARunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying…</> : `Apply Fix${opADryRunResult ? ` (${opADryRunResult.summary?.willBeUpdated?.toLocaleString() ?? '?'} records)` : ''}`}
            </Button>
          </div>
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

      {/* Commission % Diagnostics */}
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">Commission % Diagnostics</CardTitle>
                <CardDescription className="mt-1">
                  Shows the raw numbers behind the Avg Commission % on the Broker Dashboard.
                  Breaks down included vs. excluded (pass-through) transactions and shows what the
                  old vs. new calculation produces.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-blue-300 text-blue-700">Diagnostic</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="diagYear">Year</Label>
              <Input
                id="diagYear"
                value={diagYear}
                onChange={e => setDiagYear(e.target.value)}
                className="w-24"
                placeholder="2026"
              />
            </div>
            <Button onClick={runCommissionDiagnostics} disabled={diagRunning}>
              {diagRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : 'Run Diagnostics'}
            </Button>
          </div>

          {diagResult && (
            diagResult.ok ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Total Closed</div>
                    <div className="font-semibold">{diagResult.totalClosed}</div>
                  </div>
                  <div className="rounded-md border bg-green-50 border-green-200 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Included in %</div>
                    <div className="font-semibold text-green-700">{diagResult.includedCount}</div>
                  </div>
                  <div className="rounded-md border bg-amber-50 border-amber-200 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Pass-Throughs Excluded</div>
                    <div className="font-semibold text-amber-700">{diagResult.passThroughCount}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Zero-GCI Deals</div>
                    <div className="font-semibold">{diagResult.zeroGCICount}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Total GCI (excl. PT)</div>
                    <div className="font-semibold">${diagResult.totalGCI?.toLocaleString()}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Commission Volume (excl. PT)</div>
                    <div className="font-semibold">${diagResult.commissionVolume?.toLocaleString()}</div>
                  </div>
                </div>

                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                  <div className="text-sm font-semibold text-blue-900">Commission % Results</div>
                  <div className="text-sm text-blue-800">
                    <span className="line-through text-red-500 mr-2">Old (incl. pass-through volume): {diagResult.avgCommPctOld}%</span>
                    <span className="font-bold text-green-700">New (excl. pass-through volume): {diagResult.avgCommPctNew}%</span>
                  </div>
                </div>

                {diagResult.passThroughExamples?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:underline">Sample pass-through transactions ({diagResult.passThroughCount} total)</summary>
                    <table className="mt-2 w-full text-xs border rounded">
                      <thead><tr className="bg-muted/50"><th className="px-2 py-1 text-left">Address</th><th className="px-2 py-1 text-left">Agent</th><th className="px-2 py-1 text-right">Volume</th><th className="px-2 py-1 text-right">GCI</th><th className="px-2 py-1 text-right">Comm%</th></tr></thead>
                      <tbody>
                        {diagResult.passThroughExamples.map((ex: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1">{ex.address}</td>
                            <td className="px-2 py-1">{ex.agent}</td>
                            <td className="px-2 py-1 text-right">${ex.dealValue?.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">${ex.gci?.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">{ex.commPct}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}

                {diagResult.zeroGCIExamples?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:underline">Zero-GCI transactions ({diagResult.zeroGCICount} total) — may need data cleanup</summary>
                    <table className="mt-2 w-full text-xs border rounded">
                      <thead><tr className="bg-muted/50"><th className="px-2 py-1 text-left">Address</th><th className="px-2 py-1 text-left">Agent</th><th className="px-2 py-1 text-right">Volume</th><th className="px-2 py-1 text-left">Source</th><th className="px-2 py-1 text-left">Closed</th></tr></thead>
                      <tbody>
                        {diagResult.zeroGCIExamples.map((ex: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1">{ex.address}</td>
                            <td className="px-2 py-1">{ex.agent}</td>
                            <td className="px-2 py-1 text-right">${ex.dealValue?.toLocaleString()}</td>
                            <td className="px-2 py-1">{ex.dealSource}</td>
                            <td className="px-2 py-1">{ex.closedDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Diagnostics Failed</AlertTitle>
                <AlertDescription>{diagResult.error}</AlertDescription>
              </Alert>
            )
          )}
        </CardContent>
      </Card>

      {/* Firestore Seed & Validate */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Firestore Seed &amp; Validate</CardTitle>
                <CardDescription className="mt-1">
                  Checks that all required team, commission plan, membership, and member plan records exist in Firestore.
                  Run <strong>Audit</strong> to see what&apos;s missing, then <strong>Seed Missing Records</strong> to fix any gaps.
                  Safe to run at any time &mdash; only writes records that are absent.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">Data Integrity</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {seedAuditResult && (
            <Alert variant={seedAuditResult.ok ? 'default' : 'destructive'}>
              {seedAuditResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>
                {seedAuditResult.ok
                  ? seedAuditResult.totalSeeded !== undefined
                    ? seedAuditResult.totalSeeded === 0
                      ? 'All Records Present — Nothing to Seed'
                      : `Seeded ${seedAuditResult.totalSeeded} Missing Record(s)`
                    : seedAuditResult.healthy
                    ? 'All Records Present'
                    : `${seedAuditResult.summary?.totalMissing} Missing Record(s) Found`
                  : 'Error'}
              </AlertTitle>
              <AlertDescription>
                {seedAuditResult.error && <p>{seedAuditResult.error}</p>}
                {seedAuditResult.collections && (
                  <div className="mt-2 space-y-2 text-xs">
                    {Object.entries(seedAuditResult.collections).map(([col, info]: [string, any]) => (
                      <div key={col}>
                        <span className="font-semibold capitalize">{col}:</span>{' '}
                        <span className="text-green-600">{info.present.length} present</span>
                        {info.missing.length > 0 && (
                          <span className="text-red-500 ml-2">{info.missing.length} missing: {info.missing.join(', ')}</span>
                        )}
                        {info.extra.length > 0 && (
                          <span className="text-amber-500 ml-2">{info.extra.length} extra (user-created)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {seedAuditResult.details && (
                  <div className="mt-2 space-y-1 text-xs">
                    {Object.entries(seedAuditResult.details).map(([col, info]: [string, any]) => (
                      <div key={col}>
                        <span className="font-semibold capitalize">{col}:</span>{' '}
                        {(info as any).seeded > 0
                          ? <span className="text-green-600">seeded {(info as any).seeded} record(s): {(info as any).missing.join(', ')}</span>
                          : <span className="text-muted-foreground">nothing to seed</span>}
                      </div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={runSeedAudit} disabled={seedAuditRunning || seedRunning}>
              {seedAuditRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Auditing&hellip;</> : 'Audit Firestore'}
            </Button>
            <Button onClick={runSeedFix} disabled={seedRunning || seedAuditRunning}>
              {seedRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Seeding&hellip;</> : 'Seed Missing Records'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backfill Team Memberships */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Backfill Team Memberships &amp; Plans</CardTitle>
                <CardDescription className="mt-1">
                  Scans all team agents and auto-creates any missing{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">teamMemberships</code> and{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">memberPlans</code> records in Firestore.
                  Safe to run multiple times — never overwrites existing records.
                  Run this after adding new agents or teams to ensure commissions calculate correctly.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">Commission Fix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {backfillResult && (
            <Alert variant={backfillResult.ok ? 'default' : 'destructive'}>
              {backfillResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>{backfillResult.ok ? 'Backfill Complete' : 'Backfill Failed'}</AlertTitle>
              <AlertDescription>
                {backfillResult.ok ? (
                  <>
                    Processed <strong>{backfillResult.summary?.total ?? 0}</strong> team agents &mdash;{' '}
                    <strong>{backfillResult.summary?.created ?? 0}</strong> created,{' '}
                    <strong>{backfillResult.summary?.alreadyOk ?? 0}</strong> already OK,{' '}
                    <strong>{backfillResult.summary?.skipped ?? 0}</strong> skipped.
                    {backfillResult.results && backfillResult.results.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                          View details ({backfillResult.results.length} agents)
                        </summary>
                        <ul className="mt-1 space-y-1 text-xs font-mono text-muted-foreground">
                          {backfillResult.results.map((r: any) => (
                            <li key={r.agentId} className={r.error ? 'text-destructive' : ''}>
                              {r.displayName} ({r.role}) &mdash; membership: {r.membershipStatus}, plan: {r.memberPlanStatus}
                              {r.error && <span className="ml-1 text-destructive">&#9888; {r.error}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  backfillResult.error
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={runBackfillMemberships} disabled={backfillRunning}>
            {backfillRunning
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running Backfill&hellip;</>
              : 'Backfill Missing Memberships'}
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

      {/* Agent Login Health Check */}
      <Card className="border-indigo-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <CardTitle className="text-base">Agent Login Health Check</CardTitle>
                <CardDescription className="mt-1 text-sm">
                  Scans every agent profile and stamps the agent&apos;s Firebase Auth UID into the
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">firebaseUid</code>
                  field. This ensures every agent can log in directly and see their full dashboard,
                  transactions, goals, and business plan data — even if their profile doc ID is a
                  slug rather than their Firebase UID. Safe to run multiple times — only updates
                  profiles that are missing the field. Run this once to fix all agents at once.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-indigo-300 text-indigo-700">Login Fix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {uidStampResult && (
            <Alert variant={uidStampResult.ok ? 'default' : 'destructive'} className={uidStampResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {uidStampResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={uidStampResult.ok ? 'text-green-800' : ''}>
                {uidStampResult.ok ? 'Health Check Complete' : 'Health Check Failed'}
              </AlertTitle>
              <AlertDescription className={uidStampResult.ok ? 'text-green-700' : ''}>
                {uidStampResult.ok && uidStampResult.summary ? (
                  <>
                    <p className="text-sm">
                      Scanned <strong>{uidStampResult.summary.total}</strong> agent profiles &mdash;{' '}
                      <strong className="text-green-700">{uidStampResult.summary.stamped} newly fixed</strong>,{' '}
                      <strong>{uidStampResult.summary.alreadyDone}</strong> already OK,{' '}
                      <strong className="text-amber-700">{uidStampResult.summary.noAuthUser}</strong> no Firebase Auth account found,{' '}
                      <strong>{uidStampResult.summary.skipped}</strong> skipped (no email),{' '}
                      <strong className="text-red-700">{uidStampResult.summary.errors}</strong> errors.
                    </p>
                    {uidStampResult.summary.stamped > 0 && uidStampResult.results && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                          View newly fixed agents ({uidStampResult.results.filter(r => r.status === 'stamped').length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                          {uidStampResult.results.filter(r => r.status === 'stamped').map(r => (
                            <li key={r.profileId} className="text-green-700">
                              {r.email} &rarr; uid: {r.firebaseUid}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {uidStampResult.summary.noAuthUser > 0 && uidStampResult.results && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-amber-600 hover:underline">
                          Agents with no Firebase Auth account ({uidStampResult.summary.noAuthUser}) — these agents cannot log in yet
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                          {uidStampResult.results.filter(r => r.status === 'no_auth_user').map(r => (
                            <li key={r.profileId} className="text-amber-700">{r.email}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : uidStampResult.error}
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={runUidStamp}
            disabled={uidStampRunning}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {uidStampRunning
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning all agents&hellip;</>
              : uidStampResult?.ok
                ? <><CheckCircle2 className="mr-2 h-4 w-4" />Run Again</>
                : <><KeyRound className="mr-2 h-4 w-4" />Run Agent Login Health Check</>}
          </Button>
        </CardContent>
      </Card>

      {/* Bulk Invite Agents */}
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <CardTitle className="text-base">Bulk Invite Agents</CardTitle>
                <CardDescription className="mt-1 text-sm">
                  Creates Firebase Auth accounts for all agent profiles that don&apos;t have one yet
                  and sends each agent a password-setup welcome email. Run the dry run first to
                  preview which agents will be invited. Agents who already have accounts are skipped.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-blue-300 text-blue-700">Onboarding</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteResult && (
            <Alert variant={inviteResult.ok ? 'default' : 'destructive'} className={inviteResult.ok ? 'border-blue-200 bg-blue-50' : ''}>
              {inviteResult.ok ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle className={inviteResult.ok ? 'text-blue-800' : ''}>
                {inviteResult.ok
                  ? inviteResult.dryRun ? 'Dry Run Complete — No Changes Made' : 'Bulk Invite Complete'
                  : 'Bulk Invite Failed'}
              </AlertTitle>
              <AlertDescription className={inviteResult.ok ? 'text-blue-700' : ''}>
                {inviteResult.ok && inviteResult.summary ? (
                  <>
                    <p className="text-sm">
                      {inviteResult.dryRun ? (
                        <><strong className="text-blue-700">{inviteResult.summary.wouldInvite} agents would be invited</strong> (no accounts yet), <strong>{inviteResult.summary.alreadyExists}</strong> already have accounts, <strong>{inviteResult.summary.skippedNoEmail}</strong> skipped (no email).</>
                      ) : (
                        <><strong className="text-green-700">{inviteResult.summary.invited} agents invited</strong> &amp; sent welcome emails, <strong>{inviteResult.summary.alreadyExists}</strong> already had accounts, <strong>{inviteResult.summary.skippedNoEmail}</strong> skipped (no email), <strong className="text-red-700">{inviteResult.summary.errors}</strong> errors.</>
                      )}
                    </p>
                    {inviteResult.dryRun && inviteResult.summary.wouldInvite > 0 && inviteResult.results && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
                          Agents that would be invited ({inviteResult.results.filter(r => r.status === 'dry_run').length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                          {inviteResult.results.filter(r => r.status === 'dry_run').map(r => (
                            <li key={r.profileId} className="text-blue-700">{r.name} — {r.email}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {!inviteResult.dryRun && inviteResult.summary.invited > 0 && inviteResult.results && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-green-600 hover:underline">
                          Successfully invited ({inviteResult.results.filter(r => r.status === 'invited').length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                          {inviteResult.results.filter(r => r.status === 'invited').map(r => (
                            <li key={r.profileId} className="text-green-700">{r.name} — {r.email}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {inviteResult.summary.errors > 0 && inviteResult.results && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red-600 hover:underline">
                          Errors ({inviteResult.results.filter(r => r.status.startsWith('error')).length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                          {inviteResult.results.filter(r => r.status.startsWith('error')).map(r => (
                            <li key={r.profileId} className="text-red-700">{r.email}: {r.error}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : inviteResult.error}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => runBulkInvite(true)}
              disabled={inviteRunning}
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {inviteRunning
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running&hellip;</>
                : <><Mail className="mr-2 h-4 w-4" />Dry Run (Preview Only)</>}
            </Button>
            <Button
              onClick={() => runBulkInvite(false)}
              disabled={inviteRunning}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {inviteRunning
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Invites&hellip;</>
                : <><Mail className="mr-2 h-4 w-4" />Invite All Uninvited Agents</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fix All Commission Modes */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <CardTitle className="text-base">Fix All Commission Modes</CardTitle>
                <CardDescription className="mt-1 text-sm">
                  Scans every agent profile and ensures any agent with saved custom tiers has
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">commissionMode = &apos;custom&apos;</code>
                  so their tiers are always used as the source of truth.
                  Safe to run multiple times &mdash; only updates profiles that need it.
                  Run this once to fix all agents without opening each profile manually.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">Commission</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {commFixResult && (
            <Alert variant={commFixResult.ok ? 'default' : 'destructive'}>
              {commFixResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>{commFixResult.ok ? 'Complete' : 'Failed'}</AlertTitle>
              <AlertDescription>
                <p>{commFixResult.message || commFixResult.error}</p>
                {commFixResult.ok && commFixResult.scanned !== undefined && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scanned {commFixResult.scanned} profiles &middot; Fixed {commFixResult.fixed} &middot; Already correct {commFixResult.skipped}
                  </p>
                )}
                {commFixResult.ok && commFixResult.fixedAgents && commFixResult.fixedAgents.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                      View fixed agents ({commFixResult.fixedAgents.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                      {commFixResult.fixedAgents.map(a => (
                        <li key={a.id}>{a.displayName} &mdash; {a.from} &rarr; {a.to}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={runCommissionModeFix}
            disabled={commFixRunning}
            variant={commFixResult?.ok && commFixResult?.fixed === 0 ? 'outline' : 'default'}
          >
            {commFixRunning
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning…</>
              : commFixResult?.ok
                ? <><CheckCircle2 className="mr-2 h-4 w-4" />Run Again</>
                : <><ShieldCheck className="mr-2 h-4 w-4" />Fix All Commission Modes</>}
          </Button>
        </CardContent>
      </Card>

      {/* Update Agent Contacts */}
      <Card className="border-green-200">
        <CardHeader>
          <div className="flex items-start gap-3">
            <Mail className="h-6 w-6 text-green-600 mt-0.5" />
            <div>
              <CardTitle className="text-base">Update Agent Contacts</CardTitle>
              <CardDescription className="mt-1 text-sm">
                Upload a CSV to fill in missing email and phone numbers for agent profiles.
                Only fills in fields that are currently blank — never overwrites existing data.
                Also fixes Firebase Auth UID linking for agents who can’t see their dashboard.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => window.location.href = '/dashboard/admin/update-contacts'}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Open Update Contacts Tool
          </Button>
        </CardContent>
      </Card>

      {/* Recalculate Agent Plans */}
      <RecalculatePlansCard />
    </div>
  );
}

function RecalculatePlansCard() {
  const { user } = useUser();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async (dryRun: boolean) => {
    if (!user) return;
    setRunning(true);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/recalculate-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year: parseInt(year), dryRun }),
      });
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-orange-300">
      <CardHeader>
        <div className="flex items-start gap-3">
          <BarChart2 className="h-6 w-6 text-orange-600 mt-0.5" />
          <div>
            <CardTitle className="text-base">Recalculate Agent Plan Goals</CardTitle>
            <CardDescription className="mt-1 text-sm">
              Fixes KPI report card goals for Appointments Set, Appointments Held, and Contracts Written.
              Agents whose plans were saved before the fix have <code>daily: 0</code> stored &mdash; this rewrites
              those values with the correct fractional daily rates so YTD targets calculate properly.
              Run Dry Run first to preview, then Apply Fix to update Firestore.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Year:</label>
          <input
            type="number"
            value={year}
            onChange={e => setYear(e.target.value)}
            className="w-24 rounded border px-2 py-1 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={running}>
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running&hellip;</> : 'Dry Run (Preview)'}
          </Button>
          <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => run(false)} disabled={running}>
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Fixing&hellip;</> : 'Apply Fix to All Agents'}
          </Button>
        </div>
        {result && (
          <Alert variant={result.ok ? 'default' : 'destructive'}>
            <AlertTitle>{result.ok ? (result.dryRun ? 'Dry Run Complete' : 'Fix Applied') : 'Error'}</AlertTitle>
            <AlertDescription>
              {result.ok ? (
                <>
                  <p className="font-medium">{result.summary?.fixed} agents fixed &middot; {result.summary?.skipped} skipped &middot; {result.summary?.errors} errors</p>
                  {result.results?.filter((r: any) => r.status === 'fixed').map((r: any) => (
                    <div key={r.agentId} className="mt-1 text-xs">
                      <span className="font-mono">{r.agentId}</span>: apptSet daily {r.before?.appointmentsSet_daily?.toFixed(4)} &rarr; {r.after?.appointmentsSet_daily?.toFixed(4)}
                    </div>
                  ))}
                </>
              ) : result.error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
