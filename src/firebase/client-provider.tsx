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

    // Register the custom service worker (replaces the old Workbox-generated one).
    // The new sw.js clears all old Workbox caches and never intercepts '/' or auth routes.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }

    // Note: getRedirectResult() is NOT called here because we use signInWithPopup
    // exclusively. Firebase App Hosting does not serve the /__/auth/handler route
    // required by signInWithRedirect, so redirect-based sign-in is not used.
  }, [auth]);

  // Only block on hydration mismatch prevention (mounted).
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
