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
  _usedByTeams?: { teamId: string; teamName: string; teamStatus: string }[];
  _totalAgents?: number;
  _isDuplicate?: boolean;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

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
        setAuthToken(token);
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

  async function handleDelete(teamPlanId: string) {
    if (!authToken) return;
    setDeletingId(teamPlanId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/team-plans/${teamPlanId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to delete team plan.');
      }
      setTeamPlans((prev) => prev.filter((p) => p.teamPlanId !== teamPlanId));
      setConfirmDeleteId(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete team plan.');
    } finally {
      setDeletingId(null);
    }
  }

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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Used By Team</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Agents</th>
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
                      <tr key={teamPlan.teamPlanId} className={`border-t hover:bg-gray-50 ${teamPlan._isDuplicate ? 'bg-amber-50' : ''}`}>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {teamPlan.planName || teamPlan.teamPlanId}
                            {teamPlan._isDuplicate && (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                ⚠ Duplicate
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {teamPlan.teamId || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={teamPlan.status} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {teamPlan._usedByTeams && teamPlan._usedByTeams.length > 0 ? (
                            <div className="space-y-1">
                              {teamPlan._usedByTeams.map((t) => (
                                <div key={t.teamId} className="flex items-center gap-1">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${t.teamStatus === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                  <span className="font-medium text-gray-800">{t.teamName}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Not used by any team</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {teamPlan._usedByTeams && teamPlan._usedByTeams.length > 0 ? (
                            <span className="font-semibold">{teamPlan._totalAgents ?? 0}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
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
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/admin/team-plans/${teamPlan.teamPlanId}`}
                              className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              Edit
                            </Link>
                            {confirmDeleteId === teamPlan.teamPlanId ? (
                              <span className="flex items-center gap-1">
                                <span className="text-xs text-gray-600">Delete?</span>
                                <button
                                  onClick={() => handleDelete(teamPlan.teamPlanId)}
                                  disabled={deletingId === teamPlan.teamPlanId}
                                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {deletingId === teamPlan.teamPlanId ? 'Deleting...' : 'Yes, Delete'}
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                                  className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => { setConfirmDeleteId(teamPlan.teamPlanId); setDeleteError(null); }}
                                disabled={!!(teamPlan._usedByTeams && teamPlan._usedByTeams.length > 0)}
                                title={teamPlan._usedByTeams && teamPlan._usedByTeams.length > 0 ? 'Cannot delete: plan is in use by a team' : 'Delete this plan'}
                                className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          {confirmDeleteId === teamPlan.teamPlanId && deleteError && (
                            <p className="mt-1 text-xs text-red-600">{deleteError}</p>
                          )}
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
