'use client';
import { useUser } from '@/firebase';
import { useImpersonation } from '@/contexts/ImpersonationContext';
/**
 * Returns the "effective" user context — merges real Firebase auth with
 * impersonation state so every agent page can use a single hook.
 *
 * - When not impersonating: effectiveUid === user.uid
 * - When impersonating:     effectiveUid === impersonated agent's UID
 *
 * impersonationReady: true once the sessionStorage restore attempt has completed.
 * Always wait for impersonationReady before making API calls that depend on viewAs,
 * otherwise you may fire the API with the wrong UID before impersonation is restored.
 */
export function useEffectiveUser() {
  const { user, loading } = useUser();
  const { agent, isImpersonating, impersonationReady, startImpersonation, stopImpersonation } = useImpersonation();
  const effectiveUid = isImpersonating && agent ? agent.uid : (user?.uid ?? null);
  const effectiveName = isImpersonating && agent ? agent.name : (user?.displayName ?? user?.email ?? null);
  return {
    user,
    loading,
    effectiveUid,
    effectiveName,
    isImpersonating,
    impersonationReady,
    impersonatedAgent: agent,
    startImpersonation,
    stopImpersonation,
  };
}
