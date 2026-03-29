'use client';

import { useUser } from '@/firebase';
import { useImpersonation } from '@/contexts/ImpersonationContext';

/**
 * Returns the "effective" user context — merges real Firebase auth with
 * impersonation state so every agent page can use a single hook.
 *
 * - When not impersonating: effectiveUid === user.uid
 * - When impersonating:     effectiveUid === impersonated agent's UID
 */
export function useEffectiveUser() {
  const { user, loading } = useUser();
  const { agent, isImpersonating, startImpersonation, stopImpersonation } = useImpersonation();

  const effectiveUid = isImpersonating && agent ? agent.uid : (user?.uid ?? null);
  const effectiveName = isImpersonating && agent ? agent.name : (user?.displayName ?? user?.email ?? null);

  return {
    user,
    loading,
    effectiveUid,
    effectiveName,
    isImpersonating,
    impersonatedAgent: agent,
    startImpersonation,
    stopImpersonation,
  };
}
