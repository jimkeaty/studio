'use client';
export const dynamic = 'force-dynamic';
import { use, useState } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import AgentProfileEditor from '@/components/admin/agents/AgentProfileEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

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

  const [rebuildStatus, setRebuildStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [rebuildMsg, setRebuildMsg] = useState('');

  async function handleRebuildRollup() {
    setRebuildStatus('loading');
    setRebuildMsg('');
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/admin/agent-profiles/${agentId}/rebuild-rollup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Rebuild failed');
      setRebuildStatus('done');
      setRebuildMsg(`Rollup rebuilt for years: ${data.rebuilt.join(', ')}`);
    } catch (err: any) {
      setRebuildStatus('error');
      setRebuildMsg(err.message || 'Rebuild failed');
    }
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agent Profile</h1>
          <p className="mt-2 text-sm text-gray-600">Editing agent: {agentId}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRebuildRollup}
            disabled={rebuildStatus === 'loading'}
            title="Rebuilds this agent's YTD rollup from their transaction history. Use if their commission tier is showing incorrectly."
          >
            {rebuildStatus === 'loading' ? 'Rebuilding...' : 'Rebuild YTD Rollup'}
          </Button>
          {rebuildMsg && (
            <p className={`text-xs ${rebuildStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {rebuildMsg}
            </p>
          )}
        </div>
      </div>
      <AgentProfileEditor agentId={agentId} />
    </main>
  );
}
