'use client';
export const dynamic = 'force-dynamic';
import { use } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import AgentProfileEditor from '@/components/admin/agents/AgentProfileEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type AgentPageProps = {
  params: Promise<{ agentId: string }>;
};

export default function AgentDetailPage({ params }: AgentPageProps) {
  const { agentId } = use(params);
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  if (userLoading || adminLoading) {
    return (
      <main className="p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md text-center">
          <CardHeader><CardTitle>Authentication Required</CardTitle></CardHeader>
          <CardContent><p>Please sign in to access this page.</p></CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md text-center">
          <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
          <CardContent>
            <p>Agent profile management is available to staff only.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Agent Profile</h1>
        <p className="mt-2 text-sm text-gray-600">Editing agent: {agentId}</p>
      </div>
      <AgentProfileEditor agentId={agentId} />
    </main>
  );
}
