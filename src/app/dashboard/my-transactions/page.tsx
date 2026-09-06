'use client';
export const dynamic = 'force-dynamic';

import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { AgentTransactionsSection } from '@/components/dashboard/AgentTransactionsSection';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';

/**
 * This route intentionally renders the same ledger component as the dashboard
 * rather than maintaining a weaker, second transaction lookup. The shared
 * component reads the canonical transaction pipeline, which expands direct
 * Firebase UID, agent-profile document ID, stored agent ID, linked user ID,
 * email, and View as Agent aliases before querying `transactions`.
 */
export default function MyTransactionsPage() {
  const { user, loading: userLoading } = useUser();
  const { effectiveUid, isImpersonating, impersonatedAgent, impersonationReady } = useEffectiveUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  if (userLoading || adminLoading || !impersonationReady) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!user || !effectiveUid) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Not Logged In</AlertTitle>
        <AlertDescription>Please log in to view your transactions.</AlertDescription>
      </Alert>
    );
  }

  return (
    <AgentTransactionsSection
      agentId={effectiveUid}
      viewAs={isImpersonating ? impersonatedAgent?.uid : undefined}
      isAdminViewer={isAdmin && !isImpersonating}
    />
  );
}
