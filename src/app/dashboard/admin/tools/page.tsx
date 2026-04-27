'use client';

import { useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertTriangle, Loader2, Wrench, Database, Calendar } from 'lucide-react';

interface MigrationResult {
  ok: boolean;
  migrated?: number;
  fixed?: number;
  message?: string;
  ids?: string[];
  records?: { id: string; updates: Record<string, any> }[];
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

  async function getToken() {
    const { getAuth } = await import('firebase/auth');
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    return token;
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

      {/* Migration: Fix Year 20226 Typo */}
      <Card className="border-amber-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              <div>
                <CardTitle className="text-base">Fix Year &quot;20226&quot; Typo</CardTitle>
                <CardDescription className="mt-1">
                  Finds all transactions where a date field (closedDate, contractDate, listingDate,
                  projectedCloseDate) or the year field contains the typo{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">20226</code> and corrects
                  it to{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">2026</code>.
                  This fixes the &quot;Year 20226&quot; showing on the Broker Dashboard.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs border-amber-300 text-amber-700">Data Fix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {yearFixResult && (
            <Alert variant={yearFixResult.ok ? 'default' : 'destructive'} className={yearFixResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {yearFixResult.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertTitle className={yearFixResult.ok ? 'text-green-800' : ''}>
                {yearFixResult.ok ? 'Fix Complete' : 'Fix Failed'}
              </AlertTitle>
              <AlertDescription className={yearFixResult.ok ? 'text-green-700' : ''}>
                {yearFixResult.ok
                  ? yearFixResult.fixed === 0
                    ? 'No transactions with year 20226 found — nothing to fix.'
                    : `Fixed ${yearFixResult.fixed} transaction${yearFixResult.fixed !== 1 ? 's' : ''}. The Broker Dashboard year filter should now be correct.`
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

          <Button
            onClick={runYearFix}
            disabled={yearFixRunning}
            variant={yearFixResult?.ok && yearFixResult?.fixed === 0 ? 'outline' : 'default'}
            className={yearFixResult?.ok && (yearFixResult?.fixed ?? 0) > 0 ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {yearFixRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning &amp; fixing…
              </>
            ) : yearFixResult?.ok ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Run Again
              </>
            ) : (
              'Fix Year 20226 Typo'
            )}
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
                  Finds all transactions in the database that still have the old{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">under_contract</code> status
                  and updates them to{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">pending</code>.
                  This is a one-time cleanup — &quot;Under Contract&quot; has been merged into &quot;Pending&quot;.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">Data Migration</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {result && (
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertTitle>{result.ok ? 'Migration Complete' : 'Migration Failed'}</AlertTitle>
              <AlertDescription>
                {result.message || result.error}
                {result.ok && result.migrated !== undefined && result.migrated > 0 && result.ids && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
                      View updated transaction IDs ({result.ids.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs font-mono text-muted-foreground">
                      {result.ids.map(id => <li key={id}>{id}</li>)}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={runMigration}
            disabled={running}
            variant={result?.ok && result?.migrated === 0 ? 'outline' : 'default'}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running migration…
              </>
            ) : result?.ok ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Run Again
              </>
            ) : (
              'Run Migration'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
