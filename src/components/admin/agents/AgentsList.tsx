'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type AgentRow = {
  agentId: string;
  displayName: string;
  office: string | null;
  status: string;
  agentType: string;
  teamRole?: string | null;
  primaryTeamId?: string | null;
  anniversaryMonth?: number;
  anniversaryDay?: number;
};

type DuplicateGroup = {
  agentId: string;
  displayName: string;
  source: string | null;
  status: string;
}[];

function formatAnniversary(month?: number, day?: number) {
  if (!month || !day) return '—';

  const date = new Date(2000, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

function formatAgentType(agentType?: string, teamRole?: string | null) {
  if (agentType === 'independent') {
    return 'Independent';
  }

  if (agentType === 'team') {
    if (teamRole === 'leader') return 'Team Leader';
    if (teamRole === 'member') return 'Team Member';
    return 'Team';
  }

  return agentType || '—';
}

export default function AgentsList() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeResults, setMergeResults] = useState<string[]>([]);
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function getToken() {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    return user.getIdToken();
  }

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load agent profiles.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch('/api/admin/agent-profiles', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load agent profiles.');
        }

        if (!isMounted) return;
        setAgents(Array.isArray(result.agents) ? result.agents : []);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load agent profiles.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  async function handleFindDuplicates() {
    setLoadingDuplicates(true);
    setDuplicateGroups([]);
    setMergeResults([]);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/agent-profiles/duplicates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDuplicateGroups(data.duplicateGroups || []);
      setShowDuplicates(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to find duplicates');
    } finally {
      setLoadingDuplicates(false);
    }
  }

  async function handleMerge(keepId: string, deleteIds: string[]) {
    if (!confirm(`Merge ${deleteIds.length} duplicate(s) into the primary agent? This will reassign all their transactions and delete the duplicate profiles.`)) {
      return;
    }
    setMerging(keepId);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/agent-profiles/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keepAgentId: keepId, deleteAgentIds: deleteIds }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMergeResults(prev => [...prev, `Merged into "${data.keepDisplayName}": ${data.transactionsReassigned} transactions reassigned, ${data.profilesDeleted} profile(s) deleted`]);
      // Remove merged group from list
      setDuplicateGroups(prev => prev.filter(g => !g.some(a => a.agentId === keepId)));
      // Refresh agent list
      const token2 = await getToken();
      const agentsRes = await fetch('/api/admin/agent-profiles', {
        headers: { Authorization: `Bearer ${token2}` },
      });
      const agentsData = await agentsRes.json();
      if (agentsData.ok) {
        setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : []);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Merge failed');
    } finally {
      setMerging(null);
    }
  }

  async function handleDeleteAgent(agentId: string, displayName: string, force = false) {
    const msg = force
      ? `FORCE DELETE "${displayName}"? This will permanently delete the agent AND all their transactions, activity, and goals. This cannot be undone.`
      : `Delete "${displayName}"? This will remove the agent profile. If they have transactions, you'll be asked to confirm.`;

    if (!confirm(msg)) return;

    setDeletingAgent(agentId);
    try {
      const token = await getToken();
      const url = force
        ? `/api/admin/agent-profiles/${agentId}?force=true`
        : `/api/admin/agent-profiles/${agentId}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.requiresForce) {
        // Agent has transactions — ask to force delete
        const forceConfirm = confirm(
          `${data.error}\n\nDo you want to FORCE DELETE and remove all ${data.transactionCount} transaction(s) as well?`
        );
        if (forceConfirm) {
          await handleDeleteAgent(agentId, displayName, true);
          return;
        }
      } else if (!data.ok) {
        throw new Error(data.error || 'Delete failed');
      } else {
        // Success — remove from list
        setAgents(prev => prev.filter(a => a.agentId !== agentId));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Delete failed');
    } finally {
      setDeletingAgent(null);
    }
  }

  const filteredAgents = searchQuery.trim() === ''
    ? agents
    : agents.filter((agent) => {
        const q = searchQuery.toLowerCase();
        return (
          (agent.displayName || '').toLowerCase().includes(q) ||
          (agent.office || '').toLowerCase().includes(q) ||
          (agent.primaryTeamId || '').toLowerCase().includes(q) ||
          (agent.agentType || '').toLowerCase().includes(q) ||
          (agent.teamRole || '').toLowerCase().includes(q)
        );
      });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage agent profiles, team assignments, and commission setup.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFindDuplicates}
            disabled={loadingDuplicates}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {loadingDuplicates ? 'Scanning...' : 'Find Duplicates'}
          </button>
          <Link
            href="/dashboard/admin/agents/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            New Agent
          </Link>
        </div>
      </div>

      {/* ── Search Bar ──────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents by name, office, or team…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Duplicate Detection Results ──────────────────────────────────── */}
      {showDuplicates && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-amber-800">
              {duplicateGroups.length > 0
                ? `${duplicateGroups.length} Potential Duplicate Group${duplicateGroups.length !== 1 ? 's' : ''} Found`
                : 'No Duplicates Found'}
            </h2>
            <button
              onClick={() => setShowDuplicates(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          {duplicateGroups.length === 0 && (
            <p className="text-sm text-amber-700">All agent names are unique — no duplicates detected.</p>
          )}

          {mergeResults.length > 0 && (
            <div className="mb-4 space-y-1">
              {mergeResults.map((msg, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {msg}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {duplicateGroups.map((group, gi) => (
              <div key={gi} className="rounded-lg border border-amber-200 bg-white p-4">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
                  Duplicate Group {gi + 1}
                </p>
                <div className="space-y-2">
                  {group.map((agent, ai) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{agent.displayName}</span>
                        {agent.source === 'bulk_import' && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            auto-created
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          agent.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {agent.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/admin/agents/${agent.agentId}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => {
                            const deleteIds = group
                              .filter(a => a.agentId !== agent.agentId)
                              .map(a => a.agentId);
                            handleMerge(agent.agentId, deleteIds);
                          }}
                          disabled={merging !== null}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {merging === agent.agentId ? 'Merging...' : 'Keep This One'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Click &quot;Keep This One&quot; to merge all others into that agent. Their transactions will be reassigned.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white shadow-sm overflow-hidden animate-pulse">
              <div className="h-16 bg-gradient-to-r from-gray-200 to-gray-300" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <p className="font-semibold text-gray-700">No agents yet</p>
          <p className="text-sm text-gray-500 mt-1">Add your first agent profile to get started.</p>
          <Link href="/dashboard/admin/agents/new" className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Add Agent
          </Link>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <p className="font-semibold text-gray-700">No agents match &ldquo;{searchQuery}&rdquo;</p>
          <p className="text-sm text-gray-500 mt-1">Try a different name, office, or team.</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {searchQuery && (
            <p className="text-sm text-gray-500">
              Showing {filteredAgents.length} of {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </p>
          )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => {
            const initials = (agent.displayName || 'A')
              .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
            const gradients = [
              'from-blue-500 to-indigo-600',
              'from-emerald-500 to-teal-600',
              'from-violet-500 to-purple-600',
              'from-amber-500 to-orange-600',
              'from-rose-500 to-pink-600',
              'from-cyan-500 to-blue-600',
            ];
            const gradientIndex = (agent.displayName || '').charCodeAt(0) % gradients.length;
            const gradient = gradients[gradientIndex];
            const isActive = agent.status === 'active';
            return (
              <div key={agent.agentId} className="rounded-xl border bg-white shadow-sm overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex flex-col">
                {/* Gradient header */}
                <div className={`bg-gradient-to-r ${gradient} h-16 flex items-end px-4 pb-2`}>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate leading-tight">{agent.displayName || agent.agentId}</p>
                      <p className="text-white/70 text-[11px] truncate">{agent.office || 'No office'}</p>
                    </div>
                  </div>
                </div>
                {/* Card body */}
                <div className="p-3 flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isActive ? '● Active' : '○ Inactive'}
                    </span>
                    <span className="text-[11px] text-gray-500">{formatAgentType(agent.agentType, agent.teamRole)}</span>
                  </div>
                  {agent.primaryTeamId && (
                    <p className="text-[11px] text-gray-500 truncate">Team: {agent.primaryTeamId}</p>
                  )}
                  <p className="text-[11px] text-gray-400">
                    Anniversary: {formatAnniversary(agent.anniversaryMonth, agent.anniversaryDay)}
                  </p>
                </div>
                {/* Actions */}
                <div className="border-t px-3 py-2 flex items-center gap-2 bg-gray-50/50">
                  <Link
                    href={`/dashboard?viewAs=${agent.agentId}&viewAsName=${encodeURIComponent(agent.displayName)}`}
                    className="flex-1 text-center text-[11px] font-medium text-green-600 hover:text-green-700 hover:underline"
                  >
                    Dashboard
                  </Link>
                  <span className="text-gray-200">|</span>
                  <Link
                    href={`/dashboard/admin/agents/${agent.agentId}`}
                    className="flex-1 text-center text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Edit
                  </Link>
                  <span className="text-gray-200">|</span>
                  <button
                    onClick={() => handleDeleteAgent(agent.agentId, agent.displayName)}
                    disabled={deletingAgent === agent.agentId}
                    className="flex-1 text-center text-[11px] font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
                  >
                    {deletingAgent === agent.agentId ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
