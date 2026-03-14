'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type TeamRow = {
  teamId: string;
  teamName: string;
  leaderAgentId: string;
  teamPlanId: string;
  status: string;
  office?: string | null;
};

export default function TeamsList() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load teams.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch('/api/admin/teams', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load teams.');
        }

        if (!isMounted) return;
        setTeams(Array.isArray(result.teams) ? result.teams : []);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load teams.');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Teams</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage teams and link them to their default commission plans.
          </p>
        </div>

        <Link
          href="/dashboard/admin/teams/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          New Team
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Loading teams...</p>
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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Leader Agent ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team Plan ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Office</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-6 text-gray-600" colSpan={6}>
                      No teams found yet.
                    </td>
                  </tr>
                ) : (
                  teams.map((team) => (
                    <tr key={team.teamId} className="border-t">
                      <td className="px-4 py-3">{team.teamName || team.teamId}</td>
                      <td className="px-4 py-3">{team.leaderAgentId || '—'}</td>
                      <td className="px-4 py-3">{team.teamPlanId || '—'}</td>
                      <td className="px-4 py-3 capitalize">
                        {(team.status || '—').replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3">{team.office || '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/teams/${team.teamId}`}
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
