'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { PLUGIN_REGISTRY, type PluginDefinition } from '@/lib/plugins/registry';

/**
 * Resolves which plugins are enabled for the currently viewed agent.
 *
 * Resolution order (first match wins):
 *  1. If the agent profile has `enabledPlugins: string[]`, use that list.
 *  2. If the company-level `companyPlugins` doc has `allAgentsPlugins: string[]`, merge it in.
 *  3. Any plugin with `defaultEnabled: true` is always included.
 *
 * Admins always see ALL plugins (so they can preview/test them).
 */
export function useAgentPlugins(): {
  plugins: PluginDefinition[];
  loading: boolean;
  hasPlugin: (id: string) => boolean;
} {
  const { user } = useUser();
  const { isImpersonating, agent: impersonatedAgent } = useImpersonation();
  const [plugins, setPlugins] = useState<PluginDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        const token = await user!.getIdToken();
        // Fetch the current agent's profile (includes role + enabledPlugins)
        const viewAs = isImpersonating && impersonatedAgent ? impersonatedAgent.uid : undefined;
        const url = viewAs
          ? `/api/agent/profile?viewAs=${encodeURIComponent(viewAs)}`
          : '/api/agent/profile';

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (cancelled) return;

        const role: string = data?.profile?.role ?? 'agent';
        const isAdmin = role === 'admin' || role === 'broker' || role === 'owner';

        // Admins always get every plugin
        if (isAdmin && !isImpersonating) {
          setPlugins(PLUGIN_REGISTRY);
          setLoading(false);
          return;
        }

        // Agent-level enabled list from profile
        const profilePlugins: string[] = data?.profile?.enabledPlugins ?? [];

        // Company-level enabled list
        let companyPlugins: string[] = [];
        try {
          const compRes = await fetch('/api/company-plugins', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const compData = await compRes.json();
          if (compData?.ok) companyPlugins = compData.allAgentsPlugins ?? [];
        } catch {
          // company plugins endpoint may not exist yet — safe to ignore
        }

        // Build the final enabled set
        const enabledIds = new Set<string>([
          ...profilePlugins,
          ...companyPlugins,
          ...PLUGIN_REGISTRY.filter((p) => p.defaultEnabled).map((p) => p.id),
        ]);

        const resolved = PLUGIN_REGISTRY.filter((p) => enabledIds.has(p.id));
        setPlugins(resolved);
      } catch {
        // On error, fall back to defaultEnabled plugins only
        setPlugins(PLUGIN_REGISTRY.filter((p) => p.defaultEnabled));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [user, isImpersonating, impersonatedAgent]);

  return {
    plugins,
    loading,
    hasPlugin: (id: string) => plugins.some((p) => p.id === id),
  };
}
