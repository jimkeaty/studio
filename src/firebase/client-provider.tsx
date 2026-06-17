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

    // Process Google redirect sign-in result (fallback path).
    //
    // signInWithPopup is tried first. If Safari blocks the popup (e.g. when the
    // page is opened from iMessage), we fall back to signInWithRedirect which
    // navigates to smart-broker-usa.firebaseapp.com/__/auth/handler and then
    // redirects back here. getRedirectResult() picks up that result.
    //
    // This is a no-op when the user signed in via popup or is on a fresh visit.
    // We do NOT block rendering on this promise — the login page renders
    // immediately and onAuthStateChanged handles the redirect automatically.
    getRedirectResult(auth)
      .then((result) => {
        if (result && process.env.NODE_ENV === 'development') {
          console.log('[Auth] Redirect result processed:', result.user?.email);
        }
      })
      .catch((error) => {
        // Non-fatal: a failed redirect result just means the user needs to
        // sign in again. The login page is already visible.
        console.warn('[Auth] getRedirectResult error (non-fatal):', error?.code, error?.message);
      });
  }, [auth]);

  // Only block on hydration mismatch prevention (mounted).
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
