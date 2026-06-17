'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Create app/auth once on the client
  const app = useMemo(() => getFirebaseApp(), []);
  const auth = useMemo(() => getFirebaseAuth(), []);

  useEffect(() => {
    setMounted(true);

    // Register the custom service worker.
    // The sw.js clears all old Workbox caches and never intercepts '/' or auth routes.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }

    // NOTE: getRedirectResult() is intentionally NOT called here.
    // It is called inside useUser() (src/firebase/auth/use-user.tsx) where it
    // can gate the loading flag and prevent the redirect-loop race condition.
    // Calling it in two places simultaneously causes the second call to receive
    // null, defeating the fix.
  }, [auth]);

  // Only block on hydration mismatch prevention (mounted).
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
