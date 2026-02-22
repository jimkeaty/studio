'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { BarChart3, Building, Edit, LayoutGrid, Settings, Target, Users, TrendingUp, Newspaper } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '../ui/card';

const agentMenuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/plan', label: 'Business Plan', icon: Target },
  { href: '/dashboard/tracker', label: 'Daily Tracker', icon: Edit },
  { href: '/dashboard/projections', label: 'Projections', icon: TrendingUp },
];

const brokerMenuItems = [{ href: '/dashboard/broker', label: 'Broker Command', icon: Users }];

const adminMenuItems = [
    { href: '/dashboard/admin/leaderboard', label: 'Leaderboard Config', icon: Settings },
    { href: '/dashboard/admin/new-activity', label: 'Activity Board Config', icon: Settings },
];

const tvModeItems = [
    { href: '/leaderboard', label: 'Leaderboard TV Mode', icon: BarChart3 },
    { href: '/new-activity', label: 'New Activity TV Mode', icon: Newspaper },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex h-16 items-center gap-3 px-4">
          <Building className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">Smart Broker USA</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
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
        <SidebarSeparator className="my-2" />
        <SidebarMenu>
          {brokerMenuItems.map((item) => (
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
        <SidebarSeparator className="my-2" />
        <SidebarMenu>
            <p className="px-2 text-xs font-semibold text-muted-foreground/80">Admin</p>
          {adminMenuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
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
         <SidebarSeparator className="my-2" />
        <SidebarMenu>
             <p className="px-2 text-xs font-semibold text-muted-foreground/80">TV Modes</p>
          {tvModeItems.map((item) => (
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
