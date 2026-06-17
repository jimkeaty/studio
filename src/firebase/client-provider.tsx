'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
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

    // Process Google redirect sign-in result in the background.
    // This is a no-op if the user did not arrive via signInWithRedirect.
    //
    // IMPORTANT: We do NOT block rendering on this promise. Blocking caused a
    // blank white screen on first-time mobile users because getRedirectResult()
    // can take several seconds on slow connections, and if it throws (e.g. due
    // to authDomain mismatch), the app never rendered at all.
    //
    // Instead: the login page renders immediately. If a redirect result exists,
    // onAuthStateChanged fires once it resolves and automatically redirects the
    // user to /dashboard. If there is no redirect result (popup flow or fresh
    // visit), this is a fast no-op.
    getRedirectResult(auth)
      .then((result) => {
        if (result && process.env.NODE_ENV === 'development') {
          console.log('[Auth] Redirect result processed:', result.user?.email);
        }
      })
      .catch((error) => {
        // Non-fatal: log only. A failed redirect result just means the user
        // needs to sign in again. The login page is already visible.
        console.warn('[Auth] getRedirectResult error (non-fatal):', error?.code, error?.message);
      });
  }, [auth]);

  // Only block on hydration mismatch prevention (mounted).
  // Do NOT block on redirect result — the login page must render immediately
  // so first-time users on mobile see the sign-in button right away.
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
