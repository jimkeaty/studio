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
    name: 'Smart Offer Intake',
    description: 'External offer intake workspace. It remains a separate app and maintains its own access session until a verified SSO bridge is available.',
    iconName: 'FileSignature',
    category: 'productivity',
    externalUrl: 'https://smartoffer-nkbfcax4.manus.space',
    badge: 'Suite App',
    defaultEnabled: false,
  },
  {
    id: 'smart-project-management',
    name: 'Smart Project Management',
    description: 'Project execution workspace for tasks, owners, deadlines, files, and follow-through. Enable per tenant or company plan; the external app maintains its own Manus OAuth session.',
    iconName: 'FolderKanban',
    category: 'productivity',
    externalUrl: 'https://jimcommands-k9phwrqh.manus.space',
    badge: 'Suite App',
    // Access is configured through companyPlugins or enabledPlugins rather than
    // being hard-coded as a default benefit in the product architecture.
    defaultEnabled: false,
  },
  {
    id: 'smart-inspections',
    name: 'Smart Inspections',
    description: 'External inspection analysis workspace. Smart Broker retains the transaction-linked review workflow.',
    iconName: 'ClipboardCheck',
    category: 'productivity',
    externalUrl: 'https://smartinspct-8sbkppda.manus.space',
    badge: 'Suite App',
    defaultEnabled: false,
  },
  {
    id: 'smart-forms',
    name: 'Smart Forms',
    description: 'Existing form-first signing workspace. Smart Broker provides contextual launch and transaction-level completed-form references; Smart Forms retains templates, signatures, and executed files.',
    iconName: 'FileSignature',
    category: 'productivity',
    href: '/dashboard/smart-forms',
    defaultEnabled: false,
  },
  {
    id: 'smart-property-roi',
    name: 'Smart Property ROI',
    description: 'Central rollout placeholder for a future property investment analysis module.',
    iconName: 'TrendingUp',
    category: 'analytics',
    defaultEnabled: false,
  },
];

/** Quick lookup map by plugin id */
export const PLUGIN_MAP = Object.fromEntries(
  PLUGIN_REGISTRY.map((p) => [p.id, p])
) as Record<string, PluginDefinition>;
