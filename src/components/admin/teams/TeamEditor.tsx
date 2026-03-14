'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import TeamForm, {
  type TeamFormValues,
} from '@/components/admin/teams/TeamForm';
import { getFirebaseAuth } from '@/lib/firebase';

type TeamEditorProps = {
  teamId: string;
};

export default function TeamEditor({ teamId }: TeamEditorProps) {
  const [initialValues, setInitialValues] =
    useState<Partial<TeamFormValues> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load this team.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch(`/api/admin/teams/${teamId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load team.');
        }

        if (!isMounted) return;

        const team = result.team || {};

        setInitialValues({
          teamName: team.teamName || '',
          leaderAgentId: team.leaderAgentId || '',
          teamPlanId: team.teamPlanId || '',
          status: team.status || 'active',
          office: team.office || '',
          notes: team.notes || '',
        });
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load team.');
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
  }, [teamId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">Loading team...</p>
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
    <TeamForm
      teamId={teamId}
      initialValues={initialValues || {}}
      submitLabel="Update Team"
    />
  );
}
