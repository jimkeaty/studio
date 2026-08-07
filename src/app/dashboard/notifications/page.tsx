'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  url?: string;
  createdAt?: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  tc_new_submission: 'bg-blue-100 text-blue-800',
  tc_approved: 'bg-green-100 text-green-800',
  tc_rejected: 'bg-red-100 text-red-800',
  staff_queue_new: 'bg-purple-100 text-purple-800',
  agent_tx_updated: 'bg-amber-100 text-amber-800',
  system: 'bg-gray-100 text-gray-700',
};

export default function NotificationsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(
          (data.notifications || []).map((n: any) => ({
            id: n.id,
            type: n.type || 'system',
            title: n.title || 'Notification',
            body: n.body || '',
            time: n.createdAt ? relativeTime(n.createdAt) : '',
            read: !!n.read,
            url: n.url,
            createdAt: n.createdAt,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAllRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

  const markRead = async (id: string) => {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'mark_read', notificationIds: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleClick = async (n: Notif) => {
    if (!n.read) await markRead(n.id);
    if (n.url && n.url !== '/dashboard') router.push(n.url);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const paginated = notifications.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(notifications.length / PER_PAGE);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAll} className="gap-2">
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notifications yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y border rounded-lg overflow-hidden bg-card">
            {paginated.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/40 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
              >
                <div className="mt-0.5 shrink-0">
                  {!n.read && <span className="block h-2 w-2 rounded-full bg-blue-500 mt-1" />}
                  {n.read && <span className="block h-2 w-2 rounded-full bg-transparent mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-snug ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {n.title}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{n.time}</span>
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className={`text-xs px-1.5 py-0 ${TYPE_COLORS[n.type] || 'bg-gray-100 text-gray-700'}`}>
                      {n.type.replace(/_/g, ' ')}
                    </Badge>
                    {n.url && n.url !== '/dashboard' && (
                      <span className="text-xs text-primary flex items-center gap-0.5">
                        <ExternalLink className="h-3 w-3" /> View
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
