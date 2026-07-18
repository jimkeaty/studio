/**
 * Smart Broker Plugin Registry
 *
 * Each entry defines a plugin/app that can be enabled for agents or company plans.
 * Plugins are gated by the `enabledPlugins` array on the agent's profile document
 * OR by the company-level `companyPlugins` Firestore document (for plan-level access).
 *
 * To add a new plugin:
 *  1. Add an entry here with a unique `id`
 *  2. Create the page at `src/app/dashboard/apps/[id]/page.tsx`
 *  3. The sidebar and permission hook will pick it up automatically
 */

export type PluginCategory = 'productivity' | 'marketing' | 'analytics' | 'training' | 'other';

export interface PluginDefinition {
  /** Unique stable identifier — used as the key in Firestore and URL slug */
  id: string;
  /** Display name shown in the nav and admin UI */
  name: string;
  /** Short description shown in the admin plugin manager */
  description: string;
  /** Lucide icon name (string) — resolved dynamically in the nav */
  iconName: string;
  /** Category for grouping in the admin plugin manager */
  category: PluginCategory;
  /** Route inside the dashboard — defaults to /dashboard/apps/[id] */
  href?: string;
  /** If true, opens in a new tab instead of an iframe embed */
  externalUrl?: string;
  /** Badge label shown next to the nav item (e.g. "New", "Beta") */
  badge?: string;
  /** If true, all agents get this plugin regardless of profile settings (company-wide default) */
  defaultEnabled?: boolean;
}

export const PLUGIN_REGISTRY: PluginDefinition[] = [
  {
    id: 'smart-planner',
    name: 'Smart Planner',
    description: 'AI-powered business planning tool that helps agents build, track, and optimize their annual production plan.',
    iconName: 'CalendarDays',
    category: 'productivity',
    externalUrl: 'https://smartplaner-deurais3.manus.space',
    badge: 'New',
    defaultEnabled: true, // All Keaty agents get this
  },
  {
    id: 'smart-preq',
    name: 'Smart Prequalification',
    description: 'Streamlined buyer prequalification tool — collect client financial info, generate prequalification summaries, and share results with agents instantly.',
    iconName: 'ClipboardCheck',
    category: 'productivity',
    externalUrl: 'https://smartpreq-kxereu6h.manus.space',
    badge: 'New',
    defaultEnabled: true, // All Keaty agents get this
  },
  {
    id: 'smart-offer',
    name: 'Smart Offer',
    description: 'Streamlined offer intake tool — agents submit buyer offers with all required details, track offer status, and receive instant notifications.',
    iconName: 'FileSignature',
    category: 'productivity',
    badge: 'New',
    defaultEnabled: true, // All Keaty agents get this
  },
  // Future plugins can be added here:
  // {
  //   id: 'market-pulse',
  //   name: 'Market Pulse',
  //   description: 'Real-time market analytics and neighborhood trend reports.',
  //   iconName: 'TrendingUp',
  //   category: 'analytics',
  //   href: '/dashboard/apps/market-pulse',
  // },
];

/** Quick lookup map by plugin id */
export const PLUGIN_MAP = Object.fromEntries(
  PLUGIN_REGISTRY.map((p) => [p.id, p])
) as Record<string, PluginDefinition>;
