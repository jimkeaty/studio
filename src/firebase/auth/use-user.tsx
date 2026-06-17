'use client';
import { onAuthStateChanged, getRedirectResult, type User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../provider';

/**
 * useUser — subscribes to Firebase auth state and returns { user, loading }.
 *
 * THE REDIRECT RACE PROBLEM (and why this fix is required):
 *
 * When a mobile user signs in via signInWithRedirect, Firebase navigates the
 * page to Google and then redirects back. On return, Firebase needs a moment to
 * call getRedirectResult() and restore the session before onAuthStateChanged
 * fires with the signed-in user.
 *
 * Without this fix, the sequence is:
 *   1. Page loads after redirect return
 *   2. onAuthStateChanged fires immediately with null (session not yet restored)
 *   3. loading → false, user → null
 *   4. Dashboard layout sees !user → router.replace('/') → back to login page
 *   5. getRedirectResult() finally resolves with the user — but we're already gone
 *
 * THE FIX:
 * We call getRedirectResult() first and keep loading=true until it settles.
 * onAuthStateChanged is registered in parallel but we only allow it to set
 * loading=false after the redirect result promise has resolved. This ensures
 * the first auth state we expose to the app is the correct post-redirect state.
 */
export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Track whether getRedirectResult has finished so onAuthStateChanged
  // knows it is safe to mark loading as done.
  const redirectSettled = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    // Start getRedirectResult immediately. This is a fast no-op when the user
    // signed in via popup or on a fresh page visit (resolves with null).
    const redirectPromise = getRedirectResult(auth)
      .then((result) => {
        if (result?.user && process.env.NODE_ENV === 'development') {
          console.log('[useUser] Redirect result processed:', result.user.email);
        }
      })
      .catch((err) => {
        // Non-fatal — a failed redirect result just means the user needs to
        // sign in again. Log it and continue.
        console.warn('[useUser] getRedirectResult error (non-fatal):', err?.code, err?.message);
      })
      .finally(() => {
        redirectSettled.current = true;
      });

    // Subscribe to auth state changes in parallel.
    // We intentionally do NOT await redirectPromise before subscribing —
    // onAuthStateChanged must be registered immediately so it catches the
    // auth state that getRedirectResult produces.
    unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      if (redirectSettled.current) {
        // Redirect result already resolved — safe to mark loading done.
        setLoading(false);
      } else {
        // Redirect result still in flight — wait for it before marking done
        // so the dashboard guard doesn't see a false null-user state.
        redirectPromise.finally(() => {
          setLoading(false);
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [auth]);

  return { user, loading };
}
