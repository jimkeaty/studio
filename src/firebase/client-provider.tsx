'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

/**
 * FirebaseClientProvider
 *
 * This is the ONLY place in the app that calls getRedirectResult().
 *
 * WHY THIS MATTERS — The Redirect Race Condition:
 *
 * When a user signs in via signInWithRedirect (mobile Safari), Firebase
 * navigates to Google and then redirects back to the app. On return:
 *
 *   1. The page loads fresh.
 *   2. onAuthStateChanged fires almost immediately with user=null
 *      (Firebase hasn't finished processing the redirect credential yet).
 *   3. If any component sees loading=false + user=null, it redirects to '/'.
 *   4. getRedirectResult() finally resolves with the real user — too late.
 *
 * THE FIX — authReady singleton:
 *
 * We call getRedirectResult() exactly ONCE here, in the provider.
 * We expose `authReady: Promise<void>` through context so that useUser()
 * can wait for it before ever setting loading=false.
 *
 * Because getRedirectResult() is called in the provider (not in useUser),
 * it doesn't matter how many components call useUser() simultaneously —
 * they all share the same single promise. Firebase's getRedirectResult()
 * is only called once, so it always gets the real credential.
 *
 * WHY WE DON'T BLOCK RENDERING:
 *
 * We do NOT return null while waiting. The login page renders immediately
 * with the spinner (because userLoading=true). The spinner disappears only
 * after authReady resolves AND onAuthStateChanged fires. On fast connections
 * this is imperceptible. On slow connections the user sees the spinner
 * briefly, which is correct — we're genuinely waiting for auth.
 */

// Module-level singleton so the promise is created exactly once per page load,
// even if React StrictMode double-invokes effects.
let _authReadyResolve: (() => void) | null = null;
const _authReadyPromise: Promise<void> = new Promise((resolve) => {
  _authReadyResolve = resolve;
});

export { _authReadyPromise as authReadyPromise };

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Create app/auth once on the client
  const app = useMemo(() => getFirebaseApp(), []);
  const auth = useMemo(() => getFirebaseAuth(), []);

  // Track whether we've already called getRedirectResult to prevent double-calls
  // in React StrictMode (which double-invokes effects in development).
  const redirectCalledRef = useRef(false);

  useEffect(() => {
    setMounted(true);

    // Register the custom service worker.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }

    // SINGLETON: call getRedirectResult exactly once per page load.
    // This must live here (not in useUser) because useUser is called by
    // many components simultaneously. If each called getRedirectResult(),
    // only the first would get the real credential — the rest would get null,
    // causing some hooks to see user=null and trigger a redirect to login.
    if (!redirectCalledRef.current) {
      redirectCalledRef.current = true;

      getRedirectResult(auth)
        .then((result) => {
          if (result?.user && process.env.NODE_ENV === 'development') {
            console.log('[Auth] Redirect result processed:', result.user.email);
          }
        })
        .catch((err) => {
          // Non-fatal — log and continue. A failed redirect result just means
          // the user needs to sign in again. The login page is already visible.
          console.warn('[Auth] getRedirectResult error (non-fatal):', err?.code, err?.message);
        })
        .finally(() => {
          // Signal to all useUser() instances that it is now safe to set loading=false.
          if (_authReadyResolve) {
            _authReadyResolve();
            _authReadyResolve = null;
          }
        });
    }
  }, [auth]);

  // Only block on hydration mismatch prevention (mounted).
  // Do NOT block on authReady — the login page must render immediately
  // with the spinner so the user sees something while auth resolves.
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
