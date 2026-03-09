'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirebaseAuth } from '@/lib/firebase';

type AgentRow = {
  agentId: string;
  displayName: string;
  office: string | null;
  status: string;
  defaultSplitPlanId: string | null;
  anniversaryMonth?: number;
  anniversaryDay?: number;
};

function formatPlanLabel(planId: string | null | undefined) {
  switch (planId) {
    case 'cgl_first_year':
      return 'CGL First Year';
    case 'cgl_standard':
      return 'CGL Standard';
    case 'sbl_team_standard':
      return 'SBL Team Standard';
    case 'salary_flat':
      return 'Salary Flat';
    case 'referral_flat':
      return 'Referral Flat';
    case null:
    case undefined:
    case '':
      return '—';
    default:
      return planId;
  }
}

function formatAnniversary(month?: number, day?: number) {
  if (!month || !day) return '—';

  const date = new Date(2000, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export default function AgentsList() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadAgents() {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          throw new Error('You must be signed in to load agent profiles.');
        }

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
    }

    loadAgents();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage agent profiles, commission setup, and anniversary details.
          </p>
        </div>

        <Link
          href="/dashboard/admin/agents/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          New Agent
        </Link>
      </div>

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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Anniversary</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-6 text-gray-600" colSpan={6}>
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
                        {formatPlanLabel(agent.defaultSplitPlanId)}
                      </td>
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
