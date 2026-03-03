'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type AdminAgent = {
  agentId: string;
  agentName: string;
};

async function authedFetch(user: any, url: string, init?: RequestInit) {
  const token = await user.getIdToken(true);
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
}

export function AdminAgentLinker({ className = '' }: { className?: string }) {
  const { user } = useUser();

  const [agentsYear, setAgentsYear] = useState<number>(2025);
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState<boolean>(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [linking, setLinking] = useState<boolean>(false);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadAgents = async () => {
      if (!user) return;

      setAgentsLoading(true);
      setAgentsError(null);
      setLinkSuccess(null);

      try {
        const res = await authedFetch(user, `/api/admin/agents?year=${agentsYear}`);
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load agents (${res.status})`);
        }

        const list: AdminAgent[] = (json.agents || []).map((a: any) => ({
          agentId: String(a.agentId),
          agentName: String(a.agentName || a.agentId),
        }));

        list.sort((a, b) => a.agentName.localeCompare(b.agentName));
        setAgents(list);

        if (!selectedAgentId && list.length) setSelectedAgentId(list[0].agentId);
      } catch (e: any) {
        setAgents([]);
        setAgentsError(e?.message || 'Failed to load agents');
      } finally {
        setAgentsLoading(false);
      }
    };

    loadAgents();
    // intentionally not including selectedAgentId to avoid reloading loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, agentsYear]);

  const handleLink = async () => {
    if (!user) return;

    if (!selectedAgentId) {
      setAgentsError('Please select an agent first.');
      return;
    }

    setLinking(true);
    setAgentsError(null);
    setLinkSuccess(null);

    try {
      const res = await authedFetch(user, `/api/admin/link-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to link agent (${res.status})`);
      }

      setLinkSuccess(`Linked your account to agentId: ${selectedAgentId}`);
      window.location.href = '/dashboard';
    } catch (e: any) {
      setAgentsError(e?.message || 'Failed to link agent');
    } finally {
      setLinking(false);
    }
  };

  // If not signed in, don’t render (avoids weirdness during auth init)
  if (!user) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Admin: Link Your Account to an Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="w-full md:w-40">
            <Select value={String(agentsYear)} onValueChange={(v) => setAgentsYear(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId} disabled={agentsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={agentsLoading ? 'Loading agents…' : 'Select an agent'} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.agentId} value={a.agentId}>
                    {a.agentName} ({a.agentId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleLink} disabled={agentsLoading || linking || !selectedAgentId}>
            {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Link Agent
          </Button>
        </div>

        {agentsError ? (
          <Alert variant="destructive">
            <AlertTitle>Admin Tools Error</AlertTitle>
            <AlertDescription>{agentsError}</AlertDescription>
          </Alert>
        ) : null}

        {linkSuccess ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{linkSuccess}</AlertDescription>
          </Alert>
        ) : null}

        <div className="text-xs text-muted-foreground">
          This list is pulled from agent rollups for the selected year (start with 2025).
        </div>
      </CardContent>
    </Card>
  );
}
