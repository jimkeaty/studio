'use client';

import { useEffect, useState } from 'react';
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

    async function loadAgent() {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          throw new Error('You must be signed in to load this agent profile.');
        }

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
          compType: agent.compType || 'standard',
          defaultSplitPlanId: agent.defaultSplitPlanId || 'cgl_standard',
          hasCustomSplitOverride: Boolean(agent.hasCustomSplitOverride),
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
    }

    loadAgent();

    return () => {
      isMounted = false;
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
