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
  structureType?: string;
  commissionModelType?: string;
  structureModel?: string;
  thresholdMetric?: string;
  memberDefaultBands?: unknown[];
  leaderStructureBands?: unknown[];
};

function StatusBadge({ status }: { status?: string }) {
  const isActive = (status || 'active') === 'active';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function StructureBadge({ structureType }: { structureType?: string }) {
  const isLeaderless = structureType === 'no_leader';
  const isUnset = !structureType;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isLeaderless
          ? 'bg-amber-100 text-amber-800'
          : isUnset
          ? 'bg-gray-100 text-gray-500'
          : 'bg-purple-100 text-purple-800'
      }`}
    >
      {isLeaderless ? 'No Leader' : isUnset ? 'Not Set' : 'Has Leader'}
    </span>
  );
}

function ModelBadge({ model }: { model?: string }) {
  const isFixed = model === 'fixed';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isFixed
          ? 'bg-blue-100 text-blue-800'
          : 'bg-indigo-50 text-indigo-700'
      }`}
    >
      {isFixed ? 'Fixed' : 'Tiered'}
    </span>
  );
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

  const leaderlessCount = teamPlans.filter((p) => p.structureType === 'no_leader').length;
  const notSetCount = teamPlans.filter((p) => !p.structureType).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team Plans</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage reusable default commission structures for teams.
          </p>
        </div>

        <Link
          href="/dashboard/admin/team-plans/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Team Plan
        </Link>
      </div>

      {/* Summary cards */}
      {!isLoading && !errorMessage && teamPlans.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Plans</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{teamPlans.length}</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">With Leader</p>
            <p className="mt-1 text-2xl font-bold text-purple-700">
              {teamPlans.filter((p) => p.structureType === 'with_leader').length}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">No Leader</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{leaderlessCount}</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Structure Not Set</p>
            <p className="mt-1 text-2xl font-bold text-gray-500">{notSetCount}</p>
            {notSetCount > 0 && (
              <p className="mt-1 text-xs text-amber-600">Edit these plans to set structure type</p>
            )}
          </div>
        </div>
      )}

      {/* Alert for plans without structureType */}
      {!isLoading && !errorMessage && notSetCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{notSetCount} team plan{notSetCount > 1 ? 's' : ''}</strong> do not have a Team Structure set yet.
          Open each plan and select <strong>Has Team Leader</strong> or <strong>No Team Leader</strong> to configure correctly.
          Plans without this setting default to &quot;Has Leader&quot; behavior in the commission resolver.
        </div>
      )}

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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Team Structure</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Commission Model</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Bands</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {teamPlans.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-6 text-gray-600" colSpan={7}>
                      No team plans found yet.{' '}
                      <Link href="/dashboard/admin/team-plans/new" className="text-blue-600 hover:underline">
                        Create your first team plan
                      </Link>
                      .
                    </td>
                  </tr>
                ) : (
                  teamPlans.map((teamPlan) => {
                    const leaderBandCount = Array.isArray(teamPlan.leaderStructureBands)
                      ? teamPlan.leaderStructureBands.length
                      : 0;
                    const memberBandCount = Array.isArray(teamPlan.memberDefaultBands)
                      ? teamPlan.memberDefaultBands.length
                      : 0;
                    const isLeaderless = teamPlan.structureType === 'no_leader';

                    return (
                      <tr key={teamPlan.teamPlanId} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          {teamPlan.planName || teamPlan.teamPlanId}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {teamPlan.teamId || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={teamPlan.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StructureBadge structureType={teamPlan.structureType} />
                        </td>
                        <td className="px-4 py-3">
                          <ModelBadge model={teamPlan.commissionModelType} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {isLeaderless ? (
                            <span>{memberBandCount} payout band{memberBandCount !== 1 ? 's' : ''}</span>
                          ) : (
                            <span>
                              {leaderBandCount} leader / {memberBandCount} member
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/admin/team-plans/${teamPlan.teamPlanId}`}
                            className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
