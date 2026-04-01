'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * PushNotificationPrompt
 *
 * Shows a dismissible banner asking the user to enable push notifications.
 * - Only appears if permission is 'default' (not yet asked)
 * - Dismissed state is stored in localStorage so it doesn't reappear
 * - Does NOT appear if permission is already 'granted' or 'denied'
 */
export function PushNotificationPrompt() {
  const { permission, requestPermission, isRegistering } = usePushNotifications();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user has already dismissed this prompt
    const wasDismissed = localStorage.getItem('push-prompt-dismissed') === 'true';
    if (!wasDismissed && permission === 'default') {
      // Show after a short delay so it doesn't interrupt page load
      const timer = setTimeout(() => setDismissed(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [permission]);

  const handleEnable = async () => {
    setLoading(true);
    const granted = await requestPermission();
    setLoading(false);
    if (granted) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('push-prompt-dismissed', 'true');
    setDismissed(true);
  };

  // Don't show if already granted, denied, unsupported, or dismissed
  if (dismissed || permission !== 'default') return null;

  return (
    <div className="mx-4 mt-3 sm:mx-0 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-800 dark:bg-blue-950/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
        <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          Stay on top of your deals
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
          Get notified when deals are approved, you hit a new tier, or reach a goal milestone.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleEnable}
            disabled={loading || isRegistering}
          >
            {loading || isRegistering ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Enabling…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Bell className="h-3 w-3" />
                Enable Notifications
              </span>
            )}
          </Button>
          <button
            onClick={handleDismiss}
            className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 underline"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * PushNotificationStatus
 *
 * Small status indicator for the user menu / settings showing current permission state.
 */
export function PushNotificationStatus() {
  const { permission, requestPermission, isRegistering } = usePushNotifications();

  if (permission === 'unsupported') return null;

  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <Bell className="h-3.5 w-3.5" />
        <span>Push notifications enabled</span>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BellOff className="h-3.5 w-3.5" />
        <span>Notifications blocked — enable in browser settings</span>
      </div>
    );
  }

  return (
    <button
      onClick={requestPermission}
      disabled={isRegistering}
      className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
    >
      <Bell className="h-3.5 w-3.5" />
      <span>{isRegistering ? 'Enabling…' : 'Enable push notifications'}</span>
    </button>
  );
}
