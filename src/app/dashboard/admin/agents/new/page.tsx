'use client';
export const dynamic = 'force-dynamic';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import AgentProfileForm from '@/components/admin/agents/AgentProfileForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewAgentPage() {
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
        <h1 className="text-2xl font-semibold">New Agent</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create a new agent profile and commission setup.
        </p>
      </div>
      <AgentProfileForm />
    </main>
  );
}
