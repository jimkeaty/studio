'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import AgentProfileForm, {
  type AgentProfileFormValues,
} from '@/components/admin/agents/AgentProfileForm';
import { getFirebaseAuth } from '@/lib/firebase';

type AgentProfileEditorProps = {
  agentId: string;
};

export default function AgentProfileEditor({
  agentId,
}: AgentProfileEditorProps) {
  const [initialValues, setInitialValues] =
    useState<Partial<AgentProfileFormValues> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;

      if (!currentUser) {
        setErrorMessage('You must be signed in to load this agent profile.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');

        const token = await currentUser.getIdToken();

        const response = await fetch(`/api/admin/agent-profiles/${agentId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Failed to load agent profile.');
        }

        if (!isMounted) return;

        const agent = result.agent || {};

        setInitialValues({
          firstName: agent.firstName || '',
          lastName: agent.lastName || '',
          displayName: agent.displayName || '',
          email: agent.email || '',
          office: agent.office || '',
          status: agent.status || 'active',
          startDate: agent.startDate || '',
          agentType: agent.agentType || 'independent',
          progressionMetric: 'companyDollar',
          primaryTeamId: agent.primaryTeamId || '',
          teamRole: agent.teamRole || null,
          defaultPlanType: agent.defaultPlanType || 'individual',
          defaultPlanId: agent.defaultPlanId || '',
          teamMemberCompMode: agent.teamMemberCompMode || 'teamDefault',
          teamMemberOverrideBands: Array.isArray(agent.teamMemberOverrideBands)
            ? agent.teamMemberOverrideBands
            : [],
          referringAgentId: agent.referringAgentId || '',
          referringAgentDisplayNameSnapshot:
            agent.referringAgentDisplayNameSnapshot || '',
          tiers: Array.isArray(agent.tiers) ? agent.tiers : [],
          notes: agent.notes || '',
        });
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load agent profile.');
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
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">Loading agent profile...</p>
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
    <AgentProfileForm
      agentId={agentId}
      initialValues={initialValues || {}}
      submitLabel="Update Agent"
    />
  );
}
