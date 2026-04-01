'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, Bell, X, TrendingUp, Award, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { cn } from '@/lib/utils';

// ─── Notification types ───────────────────────────────────────────────────────
type Notification = {
  id: string;
  type: 'tier_upgrade' | 'goal_milestone' | 'deal_approved' | 'competition' | 'alert';
  title: string;
  body: string;
  time: string;
  read: boolean;
};

// Static sample notifications — in production these would come from Firestore
const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'tier_upgrade',
    title: 'Tier Upgrade Unlocked!',
    body: 'You\'ve crossed the threshold for your next commission tier. Your split just improved.',
    time: 'Today',
    read: false,
  },
  {
    id: '2',
    type: 'goal_milestone',
    title: '75% of Annual Goal Reached',
    body: 'You\'re 75% of the way to your annual income goal. Keep pushing!',
    time: 'Yesterday',
    read: false,
  },
  {
    id: '3',
    type: 'deal_approved',
    title: 'Transaction Approved',
    body: '123 Main St has been reviewed and approved by your TC.',
    time: '2 days ago',
    read: true,
  },
];

const notifIcon = (type: Notification['type']) => {
  if (type === 'tier_upgrade') return <Award className="h-4 w-4 text-amber-500" />;
  if (type === 'goal_milestone') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (type === 'deal_approved') return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
  if (type === 'competition') return <Award className="h-4 w-4 text-purple-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
};

export function Header() {
  const { toggleSidebar } = useSidebar();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(SAMPLE_NOTIFICATIONS);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        variant="outline"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle navigation menu</span>
      </Button>

      <div className="flex w-full items-center justify-end gap-3">
        {/* ── Notification Bell ─────────────────────────────────────── */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            onClick={() => setNotifOpen(prev => !prev)}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {unreadCount}
              </span>
            )}
          </Button>

          {/* Dropdown panel */}
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border bg-background shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <span className="text-sm font-semibold">Notifications</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* List */}
              <div className="max-h-72 overflow-y-auto divide-y">
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
                ) : notifications.map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer',
                      !n.read && 'bg-blue-50/60 dark:bg-blue-950/20'
                    )}
                    onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {notifIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-semibold leading-tight', !n.read ? 'text-foreground' : 'text-muted-foreground')}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{n.time}</p>
                    </div>
                    {!n.read && (
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <UserNav />
      </div>
    </header>
  );
}
