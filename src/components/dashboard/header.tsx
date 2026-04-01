'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Menu, Bell, X, TrendingUp, Award, CheckCircle2, AlertCircle, Sun, Moon } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';

// ─── Notification type ────────────────────────────────────────────────────────
type Notification = {
  id: string;
  type: 'tier_upgrade' | 'goal_milestone' | 'deal_approved' | 'deal_submitted' | 'competition' | 'broadcast' | 'alert';
  title: string;
  body: string;
  time: string;
  read: boolean;
  url?: string;
};

// ─── Page title map ───────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/plan': 'Business Plan',
  '/dashboard/tracker': 'Daily Tracker',
  '/dashboard/projections': 'Projections',
  '/dashboard/transactions/new': 'Add Transaction',
  '/dashboard/broker': 'Broker Command',
  '/dashboard/admin/agents': 'Agents',
  '/dashboard/admin/agents/new': 'New Agent',
  '/dashboard/admin/transactions': 'Transaction Ledger',
  '/dashboard/admin/transactions/new': 'New Transaction',
  '/dashboard/admin/transactions/edit': 'Edit Transaction',
  '/dashboard/admin/teams': 'Teams',
  '/dashboard/admin/teams/new': 'New Team',
  '/dashboard/admin/team-plans': 'Team Plans',
  '/dashboard/admin/competitions': 'Competition Center',
  '/dashboard/admin/leaderboard': 'Leaderboard Settings',
  '/dashboard/admin/branding': 'Branding',
  '/dashboard/admin/staff-users': 'Staff & Users',
  '/dashboard/admin/tc': 'TC Queue',
  '/dashboard/admin/tc-profiles': 'TC Profiles',
  '/dashboard/admin/recruiting': 'Recruiting & Dev',
  '/dashboard/admin/import': 'Import Transactions',
  '/dashboard/admin/import-activities': 'Import Activities',
  '/dashboard/admin/new-activity': 'New Activity',
  '/dashboard/admin/keaty-cup': 'Keaty Cup',
  '/leaderboard': 'Leaderboard TV',
  '/new-activity': 'Activity Board TV',
};

function usePageTitle() {
  const pathname = usePathname();
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match for dynamic routes (e.g. /dashboard/admin/agents/[id])
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key + '/')) return PAGE_TITLES[key];
  }
  return 'Smart Broker USA';
}

// ─── Notification icon ────────────────────────────────────────────────────────
const notifIcon = (type: Notification['type']) => {
  if (type === 'tier_upgrade') return <Award className="h-4 w-4 text-amber-500" />;
  if (type === 'goal_milestone') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (type === 'deal_approved' || type === 'deal_submitted') return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
  if (type === 'competition') return <Award className="h-4 w-4 text-purple-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
};

// ─── Relative time formatter ──────────────────────────────────────────────────
function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Dark mode toggle ─────────────────────────────────────────────────────────
function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full"
      onClick={toggle}
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

// ─── Main Header ──────────────────────────────────────────────────────────────
export function Header() {
  const { toggleSidebar } = useSidebar();
  const { user } = useUser();
  const router = useRouter();
  const pageTitle = usePageTitle();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Fetch real notifications from API ──────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items: Notification[] = (data.notifications || []).map((n: any) => ({
          id: n.id,
          type: n.type || 'alert',
          title: n.title,
          body: n.body,
          time: n.createdAt ? relativeTime(n.createdAt) : '',
          read: !!n.read,
          url: n.url,
        }));
        setNotifications(items);
      }
    } catch (err) {
      console.warn('[Header] Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [user]);

  // Fetch on open (if not yet fetched)
  useEffect(() => {
    if (notifOpen && !fetched) {
      fetchNotifications();
    }
  }, [notifOpen, fetched, fetchNotifications]);

  // Re-fetch every 60 seconds while dropdown is open
  useEffect(() => {
    if (!notifOpen) return;
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [notifOpen, fetchNotifications]);

  // ── Click outside to close ─────────────────────────────────────────────────
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  // ── Escape key to close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [notifOpen]);

  // ── Mark single notification read ─────────────────────────────────────────
  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark_read', ids: [id] }),
      });
    } catch { /* non-fatal */ }
  };

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
    } catch { /* non-fatal */ }
  };

  // ── Handle notification click ──────────────────────────────────────────────
  const handleNotifClick = (n: Notification) => {
    markRead(n.id);
    setNotifOpen(false);
    if (n.url) router.push(n.url);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      {/* ── Mobile sidebar toggle ──────────────────────────────────────────── */}
      <Button
        variant="outline"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle navigation menu</span>
      </Button>

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-foreground truncate hidden sm:block">
          {pageTitle}
        </h1>
      </div>

      {/* ── Right controls ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* ── Command Palette hint ──────────────────────────────────────── */}
        <button
          className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/50"
          onClick={() => {
            // Trigger the command palette keyboard shortcut
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
            document.dispatchEvent(event);
          }}
          aria-label="Open command palette"
        >
          <span>Search</span>
          <kbd className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium">
            <span>⌘</span><span>K</span>
          </kbd>
        </button>
        <DarkModeToggle />

        {/* ── Notification Bell ─────────────────────────────────────────── */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            onClick={() => setNotifOpen(prev => !prev)}
            aria-label="Notifications"
            aria-expanded={notifOpen}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* ── Dropdown panel ──────────────────────────────────────────── */}
          {notifOpen && (
            <div
              role="dialog"
              aria-label="Notifications panel"
              className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] sm:w-80 rounded-xl border bg-background shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
            >
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
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="max-h-72 overflow-y-auto divide-y">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-4 w-4 rounded-full mt-0.5 flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer focus:outline-none focus:bg-muted/40',
                        !n.read && 'bg-blue-50/60 dark:bg-blue-950/20'
                      )}
                      onClick={() => handleNotifClick(n)}
                      onKeyDown={e => e.key === 'Enter' && handleNotifClick(n)}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {notifIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-semibold leading-tight', !n.read ? 'text-foreground' : 'text-muted-foreground')}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                        {n.time && <p className="text-[10px] text-muted-foreground/70 mt-1">{n.time}</p>}
                      </div>
                      {!n.read && (
                        <div className="flex-shrink-0 mt-1.5">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {!loading && notifications.length > 0 && (
                <div className="border-t px-4 py-2.5 bg-muted/20">
                  <button
                    onClick={() => { setNotifOpen(false); router.push('/dashboard'); }}
                    className="text-xs text-primary hover:underline font-medium w-full text-center"
                  >
                    View all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <UserNav />
      </div>
    </header>
  );
}
