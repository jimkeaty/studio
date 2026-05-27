'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getFirebaseAuth } from '@/lib/firebase';

interface FlaggedAgent {
  agentId: string;
  displayName: string;
  agentType: string;
  teamRole: string | null;
  teamGroup: string | null;
  primaryTeamId: string | null;
  commissionMode: string;
  reason: string;
}

interface AuditResult {
  totalActive: number;
  flaggedCount: number;
  flagged: FlaggedAgent[];
}

interface RebuildProgress {
  done: number;
  total: number;
  currentName: string;
  errors: { agentId: string; name: string; error: string }[];
  finished: boolean;
}

function agentTypeLabel(agent: FlaggedAgent): string {
  if (agent.agentType === 'independent') return 'Independent';
  if (agent.teamRole === 'leader') return 'Team Leader';
  if (agent.teamRole === 'member') {
    const group = agent.teamGroup || agent.primaryTeamId || '';
    return `Team Member${group ? ` (${group.toUpperCase()})` : ''}`;
  }
  return agent.agentType;
}

export default function CommissionAuditPage() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rebuild state
  const [rebuildState, setRebuildState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [rebuildProgress, setRebuildProgress] = useState<RebuildProgress>({
    done: 0,
    total: 0,
    currentName: '',
    errors: [],
    finished: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    runAudit();
  }, []);

  async function runAudit() {
    setLoading(true);
    setError('');
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setError('You must be signed in as an admin to view this page.');
        setLoading(false);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/agent-profiles/commission-audit', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || 'Failed to load audit results.');
      } else {
        setResult(json as AuditResult);
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRebuildAll() {
    setRebuildState('running');
    setRebuildProgress({ done: 0, total: 0, currentName: '', errors: [], finished: false });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();

      const res = await fetch('/api/admin/agent-profiles/rebuild-all-rollups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: abort.signal,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'start') {
              setRebuildProgress((p) => ({ ...p, total: msg.total }));
            } else if (msg.type === 'progress') {
              setRebuildProgress((p) => ({
                ...p,
                done: msg.done,
                total: msg.total,
                currentName: msg.name,
                errors: msg.status === 'error'
                  ? [...p.errors, { agentId: msg.agentId, name: msg.name, error: msg.error }]
                  : p.errors,
              }));
            } else if (msg.type === 'done') {
              setRebuildProgress((p) => ({
                ...p,
                done: msg.total,
                total: msg.total,
                finished: true,
                errors: msg.errorList || p.errors,
              }));
              setRebuildState('done');
            }
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setRebuildState('error');
        setRebuildProgress((p) => ({ ...p, finished: true }));
      }
    }
  }

  const pct = rebuildProgress.total > 0
    ? Math.round((rebuildProgress.done / rebuildProgress.total) * 100)
    : 0;

  return (
    <main className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard/admin/agents"
            className="text-sm text-blue-600 hover:underline mb-2 inline-block"
          >
            ← Back to Agents
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Commission Structure Audit</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active agents missing a saved commission structure, and tools to rebuild YTD rollups.
          </p>
        </div>

        {/* Rebuild All button */}
        <div className="flex flex-col items-end gap-2 min-w-[220px]">
          <button
            onClick={handleRebuildAll}
            disabled={rebuildState === 'running'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm
              ${rebuildState === 'running'
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : rebuildState === 'done'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
          >
            {rebuildState === 'running' && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {rebuildState === 'done' ? '✓ Rebuild Complete' : rebuildState === 'running' ? 'Rebuilding…' : 'Rebuild All YTD Rollups'}
          </button>
          <p className="text-xs text-gray-400 text-right max-w-[220px]">
            Recalculates YTD commission-dollar totals for every active agent from their transaction history.
          </p>
        </div>
      </div>

      {/* Rebuild progress */}
      {rebuildState !== 'idle' && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-800">
              {rebuildState === 'done' ? 'Rebuild complete' : `Rebuilding rollups… ${rebuildProgress.done} / ${rebuildProgress.total}`}
            </span>
            <span className="text-sm text-purple-600">{pct}%</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-purple-200 rounded-full h-2 mb-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {rebuildState === 'running' && rebuildProgress.currentName && (
            <p className="text-xs text-purple-600">Processing: {rebuildProgress.currentName}</p>
          )}
          {rebuildState === 'done' && (
            <p className="text-xs text-green-700 font-medium mt-1">
              ✓ {rebuildProgress.total} agents rebuilt successfully
              {rebuildProgress.errors.length > 0 && ` (${rebuildProgress.errors.length} errors)`}
            </p>
          )}
          {rebuildProgress.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
              {rebuildProgress.errors.map((e) => (
                <p key={e.agentId} className="text-xs text-red-600">
                  {e.name}: {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading audit */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Scanning active agent profiles…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Audit results */}
      {!loading && result && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            <div className="bg-gray-100 rounded-lg px-4 py-2 text-sm text-gray-700">
              <span className="font-semibold">{result.totalActive}</span> active agents scanned
            </div>
            {result.flaggedCount === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700 font-medium">
                ✓ All active agents have a saved commission structure
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700 font-medium">
                ⚠ {result.flaggedCount} agent{result.flaggedCount !== 1 ? 's' : ''} need attention
              </div>
            )}
            <button
              onClick={runAudit}
              className="text-xs text-blue-600 hover:underline"
            >
              Refresh audit
            </button>
          </div>

          {/* Flagged agents table */}
          {result.flaggedCount > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Agent</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Commission Mode</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Issue</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {result.flagged.map((agent) => (
                    <tr key={agent.agentId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{agent.displayName}</td>
                      <td className="px-4 py-3 text-gray-600">{agentTypeLabel(agent)}</td>
                      <td className="px-4 py-3 text-gray-500">{agent.commissionMode}</td>
                      <td className="px-4 py-3 text-amber-700 text-xs max-w-xs">{agent.reason}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/agents/${agent.agentId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 transition-colors"
                        >
                          Open &amp; Fix →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All clear */}
          {result.flaggedCount === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center text-green-700">
              <div className="text-4xl mb-3">✓</div>
              <p className="font-semibold text-lg">All clear</p>
              <p className="text-sm mt-1 text-green-600">
                Every active agent has a valid saved commission structure.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
