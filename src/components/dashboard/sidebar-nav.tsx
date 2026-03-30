'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
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
  UserCog,
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '../ui/card';
import { useImpersonation } from '@/contexts/ImpersonationContext';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

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
  { href: '/dashboard/admin/keaty-cup', label: 'Keaty Cup', icon: Trophy },
];

const tvModeMenuItems = [
  { href: '/leaderboard', label: 'Leaderboard TV', icon: BarChart3 },
  { href: '/new-activity', label: 'Activity Board TV', icon: Newspaper },
];

const adminMenuItems = [
  { href: '/dashboard/broker', label: 'Broker Command', icon: Users },
  { href: '/dashboard/admin/recruiting', label: 'Recruiting & Dev', icon: UserPlus },
  { href: '/dashboard/admin/tc', label: 'TC Queue', icon: ClipboardList },
  { href: '/dashboard/admin/tc-profiles', label: 'TC Profiles', icon: UserCog },
  { href: '/dashboard/admin/agents', label: 'Agents', icon: Users },
  { href: '/dashboard/admin/agents/new', label: 'New Agent', icon: UserPlus },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: FolderKanban },
  { href: '/dashboard/admin/team-plans', label: 'Team Plans', icon: GitBranchPlus },
  { href: '/dashboard/admin/transactions', label: 'Transaction Ledger', icon: Receipt },
  { href: '/dashboard/admin/import', label: 'Bulk Import', icon: Upload },
  { href: '/dashboard/admin/import-activities', label: 'Activity Import', icon: Upload },
  { href: '/dashboard/admin/competitions', label: 'Competition Center', icon: Gamepad2 },
  { href: '/dashboard/admin/keaty-cup', label: 'Keaty Cup', icon: Trophy },
  { href: '/dashboard/admin/leaderboard', label: 'Leaderboard Config', icon: Settings },
  { href: '/dashboard/admin/new-activity', label: 'Activity Board Config', icon: Settings },
  { href: '/dashboard/admin/branding', label: 'Branding', icon: Palette },
  { href: '/dashboard/admin/staff-users', label: 'Staff Users', icon: Users2 },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.uid === ADMIN_UID;
  const [isStaffAdmin, setIsStaffAdmin] = useState(false);
  useEffect(() => {
    if (!user || user.uid === ADMIN_UID) return;
    let cancelled = false;
    user.getIdToken().then((token) => {
      fetch('/api/admin/staff-users', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.ok) setIsStaffAdmin(true); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [user]);
  const showAdminMenu = isAdmin || isStaffAdmin;
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
    <Sidebar className="border-r">
      <SidebarHeader className="border-b">
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
            <span className="text-lg font-semibold tracking-tight leading-tight">
              {companyName}
            </span>
            {tagline && (
              <span className="text-xs text-muted-foreground leading-tight">
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
          <p className="px-2 text-xs font-semibold text-muted-foreground/80">Community</p>
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
              <p className="px-2 text-xs font-semibold text-muted-foreground/80">Admin</p>
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

      <SidebarFooter className="p-2">
        <Card className="bg-accent/50 dark:bg-accent/20 border-0">
          <CardTitle className="p-3 pb-0 text-base font-semibold">Need help?</CardTitle>
          <CardDescription className="p-3 pt-0 text-sm">
            Contact support for assistance with your account.
          </CardDescription>
          <div className="p-3 pt-0">
            <Button size="sm" className="w-full">Contact Support</Button>
          </div>
        </Card>
      </SidebarFooter>
    </Sidebar>
  );
}
