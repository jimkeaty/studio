'use client';

import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Header } from '@/components/dashboard/header';
import { SidebarNav, MobileBottomTabBar } from '@/components/dashboard/sidebar-nav';
import { ImpersonationProvider, useImpersonation } from '@/contexts/ImpersonationContext';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Button } from '@/components/ui/button';
import { UserX } from 'lucide-react';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { PushNotificationPrompt } from '@/components/dashboard/push-notification-prompt';

function ImpersonationBanner() {
  const { isImpersonating, agent, stopImpersonation } = useImpersonation();
  if (!isImpersonating || !agent) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-amber-950">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserX className="h-4 w-4 shrink-0" />
        <span>
          Viewing portal as <strong>{agent.name}</strong> — changes you make will affect this agent&apos;s data.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-800 bg-amber-50 text-amber-950 hover:bg-amber-100 shrink-0"
        onClick={stopImpersonation}
      >
        Exit
      </Button>
    </div>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/40">
        <SidebarNav />
        <div className="flex flex-1 flex-col">
          <Header />
          <ImpersonationBanner />
          {/* Push notification opt-in prompt — shown once, dismissible */}
          <PushNotificationPrompt />
          <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8 max-w-full overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
      {/* Mobile bottom tab bar — only visible on small screens */}
      <MobileBottomTabBar />
      {/* Command Palette — ⌘K / Ctrl+K */}
      <CommandPalette />
    </SidebarProvider>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { isAdmin } = useIsAdminLike();
  const getToken = user ? () => user.getIdToken() : undefined;

  return (
    <ImpersonationProvider isAdmin={isAdmin} getToken={getToken}>
      <DashboardShell>{children}</DashboardShell>
    </ImpersonationProvider>
  );
}
