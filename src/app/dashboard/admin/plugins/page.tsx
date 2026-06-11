'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Puzzle, CheckCircle2, AlertTriangle, Users, Building2, ExternalLink } from 'lucide-react';
import { PLUGIN_REGISTRY, type PluginDefinition } from '@/lib/plugins/registry';
import { Input } from '@/components/ui/input';

interface AgentProfile {
  docId: string;
  agentId: string;
  displayName: string;
  email: string | null;
  status: string;
  enabledPlugins: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity',
  marketing: 'Marketing',
  analytics: 'Analytics',
  training: 'Training',
  other: 'Other',
};

export default function PluginManagerPage() {
  const { user } = useUser();

  // Company-wide plugin state
  const [companyPlugins, setCompanyPlugins] = useState<string[]>([]);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyResult, setCompanyResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Agent list
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');

  // Per-agent save state
  const [agentSaving, setAgentSaving] = useState<Record<string, boolean>>({});
  const [agentResult, setAgentResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [agentPlugins, setAgentPlugins] = useState<Record<string, string[]>>({});

  const getToken = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }, [user]);

  // Load company plugins
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/company-plugins', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setCompanyPlugins(data.allAgentsPlugins ?? []);
      } catch {
        // ignore
      } finally {
        setCompanyLoading(false);
      }
    })();
  }, [user, getToken]);

  // Load agents
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/admin/agent-profiles', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) {
          const list: AgentProfile[] = (data.agents ?? [])
            .filter((a: any) => a.status === 'active')
            .map((a: any) => ({
              docId: a.agentId ?? a.id ?? '',
              agentId: a.agentId ?? '',
              displayName: a.displayName ?? '',
              email: a.email ?? null,
              status: a.status ?? 'active',
              enabledPlugins: a.enabledPlugins ?? [],
            }));
          setAgents(list);
          // Seed local plugin state from profile data
          const initial: Record<string, string[]> = {};
          list.forEach((a) => { initial[a.agentId] = [...a.enabledPlugins]; });
          setAgentPlugins(initial);
        }
      } catch {
        // ignore
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, [user, getToken]);

  async function saveCompanyPlugins() {
    setCompanySaving(true);
    setCompanyResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/company-plugins', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allAgentsPlugins: companyPlugins }),
      });
      const data = await res.json();
      setCompanyResult({ ok: data.ok, message: data.ok ? 'Company-wide plugins saved.' : (data.error ?? 'Failed to save.') });
    } catch (err: any) {
      setCompanyResult({ ok: false, message: err?.message ?? 'Unknown error' });
    } finally {
      setCompanySaving(false);
    }
  }

  async function saveAgentPlugins(agentId: string) {
    setAgentSaving((s) => ({ ...s, [agentId]: true }));
    setAgentResult((r) => ({ ...r, [agentId]: { ok: true, message: '' } }));
    try {
      const token = await getToken();
      const plugins = agentPlugins[agentId] ?? [];
      const res = await fetch(`/api/admin/agent-profiles/${agentId}/plugins`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledPlugins: plugins }),
      });
      const data = await res.json();
      setAgentResult((r) => ({
        ...r,
        [agentId]: { ok: data.ok, message: data.ok ? 'Saved.' : (data.error ?? 'Failed.') },
      }));
    } catch (err: any) {
      setAgentResult((r) => ({ ...r, [agentId]: { ok: false, message: err?.message ?? 'Error' } }));
    } finally {
      setAgentSaving((s) => ({ ...s, [agentId]: false }));
    }
  }

  function toggleCompanyPlugin(id: string, on: boolean) {
    setCompanyPlugins((prev) => on ? [...prev, id] : prev.filter((p) => p !== id));
    setCompanyResult(null);
  }

  function toggleAgentPlugin(agentId: string, pluginId: string, on: boolean) {
    setAgentPlugins((prev) => {
      const current = prev[agentId] ?? [];
      return {
        ...prev,
        [agentId]: on ? [...current, pluginId] : current.filter((p) => p !== pluginId),
      };
    });
    setAgentResult((r) => ({ ...r, [agentId]: { ok: true, message: '' } }));
  }

  const filteredAgents = agents.filter((a) =>
    a.displayName.toLowerCase().includes(agentFilter.toLowerCase()) ||
    (a.email ?? '').toLowerCase().includes(agentFilter.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Puzzle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Plugin Manager</h1>
          <p className="text-sm text-muted-foreground">
            Control which Smart Broker apps and features are available to your agents.
          </p>
        </div>
      </div>

      {/* Company-wide plugins */}
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-base">Company-Wide Plugins</CardTitle>
              <CardDescription>
                Plugins enabled here are available to <strong>all active agents</strong> regardless of their individual profile settings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {companyLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {PLUGIN_REGISTRY.map((plugin) => (
                <div key={plugin.id} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{plugin.name}</span>
                      {plugin.badge && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
                          {plugin.badge}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {CATEGORY_LABELS[plugin.category] ?? plugin.category}
                      </Badge>
                      {plugin.defaultEnabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-green-300 text-green-700">
                          Default On
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
                    {plugin.href && (
                      <a
                        href={plugin.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
                      >
                        <ExternalLink className="h-3 w-3" /> Preview
                      </a>
                    )}
                  </div>
                  <Switch
                    checked={companyPlugins.includes(plugin.id) || !!plugin.defaultEnabled}
                    disabled={!!plugin.defaultEnabled}
                    onCheckedChange={(on) => toggleCompanyPlugin(plugin.id, on)}
                  />
                </div>
              ))}
            </div>
          )}

          {companyResult && (
            <Alert variant={companyResult.ok ? 'default' : 'destructive'} className={companyResult.ok ? 'border-green-200 bg-green-50' : ''}>
              {companyResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertDescription className={companyResult.ok ? 'text-green-700' : ''}>{companyResult.message}</AlertDescription>
            </Alert>
          )}

          <Button onClick={saveCompanyPlugins} disabled={companySaving} className="mt-2">
            {companySaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Company-Wide Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Per-agent plugins */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Per-Agent Plugin Access</CardTitle>
              <CardDescription>
                Override plugin access for individual agents. Useful for granting early access or restricting specific agents.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Filter agents by name or email…"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="max-w-sm"
          />

          {agentsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
            </div>
          ) : filteredAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active agents found.</p>
          ) : (
            <div className="space-y-4">
              {filteredAgents.map((agent) => {
                const localPlugins = agentPlugins[agent.agentId] ?? [];
                const saving = agentSaving[agent.agentId] ?? false;
                const result = agentResult[agent.agentId];
                return (
                  <div key={agent.agentId} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{agent.displayName}</p>
                        {agent.email && <p className="text-xs text-muted-foreground">{agent.email}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveAgentPlugins(agent.agentId)}
                        disabled={saving}
                      >
                        {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : 'Save'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PLUGIN_REGISTRY.map((plugin) => {
                        const isOn = localPlugins.includes(plugin.id) || !!plugin.defaultEnabled;
                        return (
                          <div key={plugin.id} className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{plugin.name}</span>
                              {plugin.defaultEnabled && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-green-300 text-green-700 shrink-0">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <Switch
                              checked={isOn}
                              disabled={!!plugin.defaultEnabled}
                              onCheckedChange={(on) => toggleAgentPlugin(agent.agentId, plugin.id, on)}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {result?.message && (
                      <p className={`text-xs ${result.ok ? 'text-green-600' : 'text-destructive'}`}>
                        {result.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
