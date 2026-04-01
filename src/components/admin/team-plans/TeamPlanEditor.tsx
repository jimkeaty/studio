'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import TeamPlanForm, {
  type TeamPlanFormValues,
} from '@/components/admin/team-plans/TeamPlanForm';
import { getFirebaseAuth } from '@/lib/firebase';

type TeamPlanEditorProps = {
  teamPlanId: string;
};

export default function TeamPlanEditor({
  teamPlanId,
}: TeamPlanEditorProps) {
  const [initialValues, setInitialValues] =
    useState<Partial<TeamPlanFormValues> | null>(null);
  const [isLeaderless, setIsLeaderless] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load this team plan.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch(`/api/admin/team-plans/${teamPlanId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load team plan.');
        }

        if (!isMounted) return;

        const teamPlan = result.teamPlan || {};

        // Fetch the parent team to determine structureType
        let parentTeamIsLeaderless = false;
        if (teamPlan.teamId) {
          try {
            const teamRes = await fetch(`/api/admin/teams/${teamPlan.teamId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const teamData = await teamRes.json();
            if (teamData?.ok && teamData?.team?.structureType === 'no_leader') {
              parentTeamIsLeaderless = true;
            }
          } catch {
            // non-fatal — fall back to showing leader bands
          }
        }

        if (isMounted) setIsLeaderless(parentTeamIsLeaderless);

        const commissionModelType: 'tiered' | 'fixed' =
          teamPlan.commissionModelType === 'fixed' ? 'fixed' : 'tiered';
        const fixedSplit = teamPlan.fixedSplit || null;

        setInitialValues({
          teamId: teamPlan.teamId || '',
          planName: teamPlan.planName || '',
          status: teamPlan.status || 'active',
          commissionModelType,
          fixedAgentPercent: fixedSplit?.agentPercent ?? 70,
          fixedCompanyPercent: fixedSplit?.companyPercent ?? 30,
          thresholdMetric: teamPlan.thresholdMetric || 'companyDollar',
          thresholdMarkers: Array.isArray(teamPlan.thresholdMarkers)
            ? teamPlan.thresholdMarkers
            : [0],
          structureModel: teamPlan.structureModel || 'leaderFirst',
          leaderStructureBands: Array.isArray(teamPlan.leaderStructureBands)
            ? teamPlan.leaderStructureBands
            : [],
          memberDefaultBands: Array.isArray(teamPlan.memberDefaultBands)
            ? teamPlan.memberDefaultBands
            : [],
          notes: teamPlan.notes || '',
        });
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load team plan.');
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
  }, [teamPlanId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">Loading team plan...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  return (
    <TeamPlanForm
      teamPlanId={teamPlanId}
      initialValues={initialValues || {}}
      submitLabel="Update Team Plan"
      isLeaderless={isLeaderless}
    />
  );
}
