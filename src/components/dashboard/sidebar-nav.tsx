'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { BarChart3, Building, Edit, LayoutGrid, Settings, Target, Users } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '../ui/card';

const agentMenuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/plan', label: 'Business Plan', icon: Target },
  { href: '/dashboard/tracker', label: 'Daily Tracker', icon: Edit },
];

const brokerMenuItems = [{ href: '/dashboard/broker', label: 'Broker Command', icon: Users }];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader className="border-b">
        <div className="flex h-16 items-center gap-3 px-4">
          <Building className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">BrokerView</span>
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
    </>
  );
}
