'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type TeamPlanRow = {
  teamPlanId: string;
  teamId: string;
  planName: string;
  status: string;
  structureModel?: string;
  thresholdMetric?: string;
};

function formatStatus(status?: string) {
  return (status || '—').replace('_', ' ');
}

function formatStructureModel(value?: string) {
  if (value === 'leaderFirst') return 'Leader First';
  return value || '—';
}

export default function TeamPlansList() {
  const [teamPlans, setTeamPlans] = useState<TeamPlanRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load team plans.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch('/api/admin/team-plans', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load team plans.');
        }

        if (!isMounted) return;
        setTeamPlans(Array.isArray(result.teamPlans) ? result.teamPlans : []);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load team plans.');
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
      <div>
        <h1 className="text-2xl font-semibold">Team Plans</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage reusable default commission structures for teams.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Loading team plans...</p>
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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Plan Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Structure</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Metric</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {teamPlans.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-6 text-gray-600" colSpan={6}>
                      No team plans found yet.
                    </td>
                  </tr>
                ) : (
                  teamPlans.map((teamPlan) => (
                    <tr key={teamPlan.teamPlanId} className="border-t">
                      <td className="px-4 py-3">{teamPlan.planName || teamPlan.teamPlanId}</td>
                      <td className="px-4 py-3">{teamPlan.teamId || '—'}</td>
                      <td className="px-4 py-3 capitalize">{formatStatus(teamPlan.status)}</td>
                      <td className="px-4 py-3">
                        {formatStructureModel(teamPlan.structureModel)}
                      </td>
                      <td className="px-4 py-3">{teamPlan.thresholdMetric || '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/team-plans/${teamPlan.teamPlanId}`}
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
