'use client';
export const dynamic = 'force-dynamic';
import { use, useState } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import AgentProfileEditor from '@/components/admin/agents/AgentProfileEditor';
import { CoachingNotesWidget } from '@/components/dashboard/agent/CoachingNotesWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Mail, RefreshCw } from 'lucide-react';

type AgentPageProps = {
  params: Promise<{ agentId: string }>;
};

export default function AgentDetailPage({ params }: AgentPageProps) {
  const { agentId } = use(params);
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  // ── Hooks MUST be called before any conditional returns ───────────────────
  const [rebuildStatus, setRebuildStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [rebuildMsg, setRebuildMsg] = useState('');

  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [inviteMsg, setInviteMsg] = useState('');

  async function handleRebuildRollup() {
    if (!user) return;
    setRebuildStatus('loading');
    setRebuildMsg('');
    try {
      const token = await user.getIdToken();
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

  async function handleSendInvite() {
    if (!user) return;
    setInviteStatus('loading');
    setInviteMsg('');
    try {
      const token = await user.getIdToken();
      // Use the bulk-invite API targeting just this agent's profile ID
      const res = await fetch(`/api/admin/bulk-invite-agents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // We pass the agentId as a profile filter — the API will look up the email
        body: JSON.stringify({ profileIds: [agentId] }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invite failed');

      const result = data.results?.[0];
      if (!result) throw new Error('No result returned');

      if (result.status === 'invited') {
        setInviteStatus('done');
        setInviteMsg(`Invite sent to ${result.email}`);
      } else if (result.status === 'already_exists') {
        setInviteStatus('done');
        setInviteMsg(`${result.email} already has an account — they can sign in with Google now`);
      } else if (result.status === 'skipped_no_email') {
        setInviteStatus('error');
        setInviteMsg('No email address on this profile — add an email first');
      } else {
        setInviteStatus('error');
        setInviteMsg(result.error || `Status: ${result.status}`);
      }
    } catch (err: any) {
      setInviteStatus('error');
      setInviteMsg(err.message || 'Invite failed');
    }
  }

  // ── Early returns (after all hooks) ──────────────────────────────────────
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agent Profile</h1>
          <p className="mt-2 text-sm text-gray-600">Editing agent: {agentId}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Send Invite button */}
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendInvite}
              disabled={inviteStatus === 'loading'}
              className="flex items-center gap-2"
              title="Creates a Firebase Auth account for this agent (if they don't have one) and sends them a welcome / password-reset email. Agents using Google Sign-In can log in immediately without needing an invite."
            >
              <Mail className="h-4 w-4" />
              {inviteStatus === 'loading' ? 'Sending...' : 'Send Invite Email'}
            </Button>
            {inviteMsg && (
              <p className={`text-xs max-w-xs text-right ${inviteStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {inviteMsg}
              </p>
            )}
          </div>

          {/* Rebuild Rollup button */}
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRebuildRollup}
              disabled={rebuildStatus === 'loading'}
              className="flex items-center gap-2"
              title="Rebuilds this agent's YTD rollup from their transaction history. Use if their commission tier is showing incorrectly."
            >
              <RefreshCw className="h-4 w-4" />
              {rebuildStatus === 'loading' ? 'Rebuilding...' : 'Rebuild YTD Rollup'}
            </Button>
            {rebuildMsg && (
              <p className={`text-xs ${rebuildStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {rebuildMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info banner for Google Sign-In agents */}
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Google Sign-In agents</strong> (e.g. @gmail.com or Google Workspace accounts like @keatyrealestate.com)
        can log in immediately after their profile is created — no invite email needed.
        Just share the app URL: <span className="font-mono">smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app</span>
        <br />
        Use <strong>Send Invite Email</strong> for agents who will use email + password instead of Google.
      </div>

      <AgentProfileEditor agentId={agentId} />
      <div className="mt-6">
        <CoachingNotesWidget agentId={agentId} />
      </div>
    </main>
  );
}
