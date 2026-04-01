'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
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
  Building,
  ClipboardList,
  ClipboardPen,
  Gamepad2,
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
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '../ui/card';
import { useImpersonation } from '@/contexts/ImpersonationContext';

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────────────
const mobileTabItems = [
  { href: '/dashboard',                   label: 'Home',        icon: LayoutGrid },
  { href: '/dashboard/tracker',           label: 'Tracker',     icon: ClipboardPen },
  { href: '/dashboard/transactions/new',  label: 'Add Deal',    icon: Plus },
  { href: '/dashboard/plan',              label: 'Plan',        icon: Target },
  { href: '/dashboard/admin/competitions',label: 'Compete',     icon: Trophy },
];

export function MobileBottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex sm:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
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
              isAddDeal
                ? 'relative -mt-3'
                : '',
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
};

// Shown to all users (agent + admin)
const agentMenuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/plan', label: 'Business Plan', icon: Target },
  { href: '/dashboard/tracker', label: 'Daily Tracker', icon: ClipboardPen },
  { href: '/dashboard/projections', label: 'Projections', icon: TrendingUp },
  { href: '/dashboard/transactions/new', label: 'Add Transaction', icon: Plus },
];

// Shown to all users — community & entertainment
const communityMenuItems = [
  { href: '/dashboard/admin/competitions', label: 'Competition Center', icon: Gamepad2 },
];

const tvModeMenuItems = [
  { href: '/leaderboard', label: 'Leaderboard TV', icon: BarChart3 },
  { href: '/new-activity', label: 'Activity Board TV', icon: Newspaper },
];

const adminMenuItems = [
  { href: '/dashboard/broker', label: 'Broker Command', icon: Users },
  { href: '/dashboard/admin/recruiting', label: 'Recruiting & Dev', icon: UserPlus },
  { href: '/dashboard/admin/tc', label: 'TC Queue', icon: ClipboardList },
  { href: '/dashboard/admin/agents', label: 'Agents', icon: Users },
  { href: '/dashboard/admin/agents/new', label: 'New Agent', icon: UserPlus },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: FolderKanban },
  { href: '/dashboard/admin/team-plans', label: 'Team Plans', icon: GitBranchPlus },
  { href: '/dashboard/admin/transactions', label: 'Transaction Ledger', icon: Receipt },
  { href: '/dashboard/admin/import', label: 'Bulk Import', icon: Upload },
  { href: '/dashboard/admin/import-activities', label: 'Activity Import', icon: Upload },
  { href: '/dashboard/admin/competitions', label: 'Competition Center', icon: Gamepad2 },
  { href: '/dashboard/admin/leaderboard', label: 'Leaderboard Config', icon: Settings },
  { href: '/dashboard/admin/new-activity', label: 'Activity Board Config', icon: Settings },
  { href: '/dashboard/admin/branding', label: 'Branding', icon: Palette },
  { href: '/dashboard/admin/staff-users', label: 'Staff Users', icon: UsersRound },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const { isAdmin: showAdminMenu } = useIsAdminLike();
  const { isImpersonating } = useImpersonation();
  const [branding, setBranding] = useState<BrandingData | null>(null);

  const visibleAgentItems = agentMenuItems;

  // Fetch branding settings (public endpoint, no auth needed)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/branding')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.ok) setBranding(data.branding);
      })
      .catch(() => {}); // Silently fail, fallback to defaults
    return () => { cancelled = true; };
  }, []);

  const companyName = branding?.companyName || 'Smart Broker USA';
  const tagline = branding?.tagline;
  const activeLogo =
    branding?.useAnimatedLogo && branding?.animatedLogoUrl
      ? branding.animatedLogoUrl
      : branding?.logoUrl;

  return (
    <Sidebar className="border-r bg-slate-900 dark:bg-slate-950 text-slate-100">
      <SidebarHeader className="border-b border-slate-700/60">
        <div className="flex h-16 items-center gap-3 px-4">
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
        <SidebarMenu>
          {visibleAgentItems.map((item) => (
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
          {tvModeMenuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} target="_blank">
                <SidebarMenuButton
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

        {!isImpersonating && showAdminMenu && (
          <>
            <SidebarSeparator className="my-2" />

            <SidebarMenu>
              <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
              {adminMenuItems.map((item) => (
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
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-slate-700/60">
        <Card className="bg-slate-800 border-slate-700">
          <CardTitle className="p-3 pb-0 text-base font-semibold text-white">Need help?</CardTitle>
          <CardDescription className="p-3 pt-0 text-sm text-slate-400">
            Contact support for assistance with your account.
          </CardDescription>
          <div className="p-3 pt-0">
            <Button size="sm" className="w-full bg-slate-700 hover:bg-slate-600 text-white border-slate-600">Contact Support</Button>
          </div>
        </Card>
      </SidebarFooter>
    </Sidebar>
  );
}
