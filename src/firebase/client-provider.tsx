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

    // Register the custom service worker.
    // The sw.js clears all old Workbox caches and never intercepts '/' or auth routes.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }

    // Process Google redirect sign-in result.
    //
    // On mobile / PWA, handleSignIn uses signInWithRedirect which navigates
    // the page to Google and then redirects back here.  getRedirectResult()
    // picks up the credential from that redirect and fires onAuthStateChanged,
    // which causes the login page to redirect to /dashboard automatically.
    //
    // This is a fast no-op when the user signed in via popup or on a fresh visit.
    //
    // We do NOT block rendering on this promise — the login page renders
    // immediately so the user sees the sign-in button right away.
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
  // Do NOT block on redirect result — the login page must render immediately.
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
