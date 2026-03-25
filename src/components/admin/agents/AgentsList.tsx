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
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Loading agent profiles...</p>
        </div>
      ) : errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Office</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Agent Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Anniversary</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-6 text-gray-600" colSpan={7}>
                      No agent profiles found yet.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.agentId} className="border-t">
                      <td className="px-4 py-3">{agent.displayName || agent.agentId}</td>
                      <td className="px-4 py-3">{agent.office || '—'}</td>
                      <td className="px-4 py-3 capitalize">
                        {(agent.status || '—').replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        {formatAgentType(agent.agentType, agent.teamRole)}
                      </td>
                      <td className="px-4 py-3">{agent.primaryTeamId || '—'}</td>
                      <td className="px-4 py-3">
                        {formatAnniversary(agent.anniversaryMonth, agent.anniversaryDay)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/agents/${agent.agentId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
