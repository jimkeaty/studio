'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { useIsStaff } from '@/hooks/useIsStaff';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Bell,
  Building,
  CalendarDays,
  ClipboardList,
  ClipboardPen,
  Gamepad2,
  Swords,
  LayoutGrid,
  Newspaper,
  Palette,
  Plus,
  Settings,
  Target,
  TrendingUp,
  Trophy,
  Users,
  UserPlus,
  FolderKanban,
  GitBranchPlus,
  Receipt,
  Upload,
  UsersRound,
  Wrench,
  Puzzle,
  ExternalLink,
  MapPin,
  GraduationCap,
  HelpCircle,
  BookUser,
  Home,
  Info,
  Monitor,
  Wifi,
  Tv,
  Zap,
  History,
  GitMerge,
  type LucideIcon,
} from 'lucide-react';
import { useAgentPlugins } from '@/hooks/useAgentPlugins';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Map plugin iconName strings to actual Lucide components
const PLUGIN_ICON_MAP: Record<string, LucideIcon> = {
  CalendarDays,
  TrendingUp,
  BarChart3,
  Target,
  GraduationCap,
};
import { useImpersonation } from '@/contexts/ImpersonationContext';

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────────────
const mobileTabItems = [
  { href: '/dashboard',                   label: 'Home',        icon: LayoutGrid },
  { href: '/dashboard/tracker',           label: 'Tracker',     icon: ClipboardPen },
  { href: '/dashboard/transactions/new',  label: 'Add Deal',    icon: Plus },
  { href: '/dashboard/competitions',label: 'Compete',     icon: Swords },
  { href: '/leaderboard',                 label: 'Board',       icon: BarChart3 },
];

export function MobileBottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex sm:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {mobileTabItems.map((item) => {
        const isActive = item.href === '/dashboard'
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isAddDeal = item.href === '/dashboard/transactions/new';
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              isAddDeal ? 'relative -mt-3' : '',
              isActive && !isAddDeal ? 'text-primary' : !isAddDeal ? 'text-muted-foreground hover:text-foreground' : '',
            ].join(' ')}
          >
            {isAddDeal ? (
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg -mt-1">
                <item.icon className="h-5 w-5" />
              </span>
            ) : (
              <item.icon className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
            )}
            <span className={isAddDeal ? 'text-primary font-semibold mt-0.5' : ''}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type BrandingData = {
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  animatedLogoUrl: string | null;
  useAnimatedLogo: boolean;
  primaryColor: string | null;
  pwaIconUrl: string | null;
};

// Shown to all users (agent + admin) — core nav
const agentMenuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/plan', label: 'Business Plan', icon: Target },
  { href: '/dashboard/tracker', label: 'Daily Tracker', icon: ClipboardPen },
  { href: '/dashboard/projections', label: 'Projections', icon: TrendingUp },
  { href: '/dashboard/transactions/new', label: 'Add Transaction', icon: Plus },
  { href: '/dashboard/contacts', label: 'Contacts Book', icon: BookUser },
  { href: '/dashboard/open-house', label: 'Submit Open House', icon: Home },
  { href: '/dashboard/training', label: 'Training & Help', icon: GraduationCap },
];

// Shown to all users — community & entertainment
const communityMenuItems = [
  { href: '/dashboard/competitions', label: 'Competition Center', icon: Swords },
  { href: '/dashboard/tv-mode', label: 'TV Mode', icon: Tv },
];

// Settings items shown to non-admin users only (admins get these inside their Settings group)
const agentSettingsItems = [
  { href: '/dashboard/settings/notifications', label: 'Notification Settings', icon: Bell },
];

// ── Grouped admin menu sections ───────────────────────────────────────────────
const adminMenuGroups = [
  {
    label: 'Command',
    items: [
      { href: '/dashboard/broker', label: 'Broker Command', icon: Users },
      { href: '/dashboard/admin/recruiting', label: 'Recruiting & Dev', icon: UserPlus },
      { href: '/dashboard/admin/broker-business-plan', label: 'Broker Business Plan', icon: Target },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/admin/agents', label: 'Agents', icon: Users },
      { href: '/dashboard/admin/teams', label: 'Teams', icon: FolderKanban },
      { href: '/dashboard/admin/team-plans', label: 'Team Plans', icon: GitBranchPlus },
      { href: '/dashboard/admin/staff-users', label: 'Staff & Users', icon: UsersRound },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { href: '/dashboard/admin/tc', label: 'TC Queue', icon: ClipboardList },
      { href: '/dashboard/admin/staff-queue', label: 'Staff Queue', icon: MapPin },
      { href: '/dashboard/admin/transactions', label: 'Transaction Ledger', icon: Receipt },
      { href: '/dashboard/admin/import', label: 'Bulk Import', icon: Upload },
      { href: '/dashboard/admin/import-activities', label: 'Activity Import', icon: Upload },
      { href: '/dashboard/admin/import-mls', label: 'MLS Data Import', icon: Upload },
      { href: '/dashboard/admin/import-history', label: 'Import History', icon: History },
      { href: '/dashboard/contacts', label: 'Contacts Book', icon: BookUser },
    ],
  },
  {
    label: 'Engage',
    items: [
      { href: '/dashboard/admin/competitions', label: 'Competition Center', icon: Gamepad2 },
      { href: '/dashboard/admin/leaderboard', label: 'Leaderboard Config', icon: Settings },
      { href: '/dashboard/admin/new-activity', label: 'Activity Board Config', icon: Settings },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/admin/branding', label: 'Branding', icon: Palette },
      { href: '/dashboard/admin/open-house-settings', label: 'Open House Settings', icon: Home },
      { href: '/dashboard/settings/notifications', label: 'Notification Settings', icon: Bell },
    ],
  },
  {
    label: 'Training',
    items: [
      { href: '/dashboard/training', label: 'Training & Help Center', icon: GraduationCap },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/dashboard/admin/tools', label: 'Admin Tools', icon: Wrench },
      { href: '/dashboard/admin/plugins', label: 'Plugin Manager', icon: Puzzle },
    ],
  },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const { isAdmin: showAdminMenu } = useIsAdminLike();
  const { isStaff } = useIsStaff();
  const isTcOnly = isStaff && !showAdminMenu; // tc role only — no full admin menu
  const { isImpersonating } = useImpersonation();
  const { plugins: agentPlugins } = useAgentPlugins();
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [showTvHelp, setShowTvHelp] = useState(false);

  // Fetch branding settings (public endpoint, no auth needed)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/branding')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.ok) setBranding(data.branding);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const companyName = branding?.companyName || 'Smart Broker USA';
  const tagline = branding?.tagline;
  // Priority: animated logo (if enabled) → static logo → PWA/home screen icon
  const activeLogo =
    branding?.useAnimatedLogo && branding?.animatedLogoUrl
      ? branding.animatedLogoUrl
      : branding?.logoUrl || branding?.pwaIconUrl || null;

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b border-slate-700/60">
        <div
          className="flex items-center gap-3 px-4"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            minHeight: 'calc(4rem + env(safe-area-inset-top, 0px))',
          }}
        >
          {activeLogo ? (
            <img
              src={activeLogo}
              alt={companyName}
              className="h-8 w-8 object-contain rounded"
            />
          ) : (
            <Building className="h-8 w-8 text-primary" />
          )}
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight leading-tight text-white">
              {companyName}
            </span>
            {tagline && (
              <span className="text-xs text-slate-400 leading-tight">
                {tagline}
              </span>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        {/* Core agent nav — visible to all */}
        <SidebarMenu>
          {agentMenuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  className="justify-start"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        {/* Community — visible to all users */}
        <SidebarSeparator className="my-2" />
        <SidebarMenu>
          <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Community</p>
          {communityMenuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  tooltip={item.label}
                  className="justify-start"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}

        </SidebarMenu>

        {/* Settings — shown to non-admin users only (admins get it in their Settings group) */}
        {!showAdminMenu && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarMenu>
              <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Settings</p>
              {agentSettingsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                      tooltip={item.label}
                      className="justify-start"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        )}

        {/* Apps / Plugins — shown to all users based on their enabled plugins */}
        {agentPlugins.length > 0 && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarMenu>
              <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Apps</p>
              {agentPlugins.map((plugin) => {
                const IconComponent = PLUGIN_ICON_MAP[plugin.iconName] ?? LayoutGrid;
                const isExternal = !!plugin.externalUrl;
                const href = isExternal
                  ? plugin.externalUrl!
                  : (plugin.href ?? `/dashboard/apps/${plugin.id}`);
                const isActive = !isExternal &&
                  (pathname === (plugin.href ?? `/dashboard/apps/${plugin.id}`) ||
                   pathname.startsWith(`${plugin.href ?? `/dashboard/apps/${plugin.id}`}/`));
                const buttonContent = (
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={plugin.name}
                    className="justify-start"
                  >
                    <IconComponent className="h-4 w-4" />
                    <span className="flex-1">{plugin.name}</span>
                    {isExternal && (
                      <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                    )}
                    {plugin.badge && (
                      <Badge
                        variant="secondary"
                        className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20"
                      >
                        {plugin.badge}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                );
                return (
                  <SidebarMenuItem key={plugin.id}>
                    {isExternal ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {buttonContent}
                      </a>
                    ) : (
                      <Link href={href}>
                        {buttonContent}
                      </Link>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </>
        )}

        {/* TC-only: View Agent Dashboard shortcut (TC users don't see the full admin menu) */}
        {!isImpersonating && isTcOnly && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarMenu>
              <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent Access</p>
              <SidebarMenuItem>
                <Link href="/dashboard/admin/agents">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/dashboard/admin/agents')}
                    tooltip="View Agent Dashboard"
                    className="justify-start"
                  >
                    <Users className="h-4 w-4" />
                    <span>View Agent Dashboard</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
        {/* Admin sections */}
        {!isImpersonating && showAdminMenu && (
          <>
            <SidebarSeparator className="my-2" />
            {adminMenuGroups.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="px-2 pt-2 pb-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{group.label}</p>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <Link href={item.href}>
                        <SidebarMenuButton
                          isActive={
                            item.href === '/dashboard/broker'
                              ? pathname === item.href
                              : pathname === item.href || pathname.startsWith(`${item.href}/`)
                          }
                          tooltip={item.label}
                          className="justify-start"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}
          </>
        )}
      </SidebarContent>

      {/* Compact footer — just a support link, no tall card */}
      <SidebarFooter className="p-2 border-t border-slate-700/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Setup Wizard — re-launch the onboarding wizard"
              className="justify-start text-primary hover:text-primary/80 font-semibold"
              onClick={() => {
                // Clear onboarding flag so the wizard re-launches on next page load
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('smart-broker:relaunch-onboarding'));
                }
              }}
            >
              <Zap className="h-4 w-4" />
              <span>Setup Wizard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Contact Support"
              className="justify-start text-slate-400 hover:text-white"
              onClick={() => window.open('mailto:support@smartbrokerusa.com', '_blank')}
            >
              <HelpCircle className="h-4 w-4" />
              <span>Contact Support</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* TV Display Instructions Dialog */}
      <Dialog open={showTvHelp} onOpenChange={setShowTvHelp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              How to Display on a TV
            </DialogTitle>
            <DialogDescription>
              The Activity Board TV is a full-screen, no-scroll display designed for office TVs. It auto-refreshes every 5 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3 p-3 rounded-lg bg-muted">
              <Monitor className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Option 1 — Chromecast / Google TV (easiest)</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open Chrome on a laptop or phone on the same WiFi as your TV</li>
                  <li>Click &ldquo;Activity Board TV&rdquo; to open it in a new tab</li>
                  <li>Click the <strong>⋮ menu → Cast → Cast tab</strong></li>
                  <li>Select your Chromecast or Google TV device</li>
                </ol>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg bg-muted">
              <Tv className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Option 2 — Smart TV built-in browser</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open your TV&rsquo;s browser app (Samsung, LG, Sony all have one)</li>
                  <li>Navigate to the URL below</li>
                  <li>Press the TV&rsquo;s fullscreen button to fill the screen</li>
                </ol>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg bg-muted">
              <Wifi className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Option 3 — Amazon Fire Stick / Roku</p>
                <p className="text-muted-foreground">Install the <strong>Silk Browser</strong> (Fire Stick) or <strong>web browser channel</strong> (Roku), navigate to the URL, and go fullscreen.</p>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="font-semibold text-primary mb-1">Activity Board TV URL</p>
              <code className="text-xs break-all text-muted-foreground">
                https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app/new-activity
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                💡 <strong>Tip:</strong> Bookmark this URL on the TV browser so you can open it with one click each morning. It stays live all day automatically.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
