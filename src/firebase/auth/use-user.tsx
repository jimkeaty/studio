'use client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useAuth } from '../provider';
import { authReadyPromise } from '../client-provider';

/**
 * useUser — subscribes to Firebase auth state and returns { user, loading }.
 *
 * IMPORTANT: This hook does NOT call getRedirectResult() itself.
 * getRedirectResult() is called exactly once, in FirebaseClientProvider,
 * and exposes a shared `authReadyPromise` that resolves when it settles.
 *
 * This hook waits for authReadyPromise before ever setting loading=false.
 * This prevents the redirect-loop race condition where onAuthStateChanged
 * fires with user=null before Firebase has finished processing the OAuth
 * redirect credential, causing the dashboard guard to redirect to login.
 *
 * Because authReadyPromise is a module-level singleton, it doesn't matter
 * how many components call useUser() simultaneously — they all share the
 * same promise and none of them will set loading=false prematurely.
 */
export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes.
    // We register immediately (not after authReadyPromise) so we catch
    // the auth state change that getRedirectResult produces.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      // Only mark loading=false after getRedirectResult has settled.
      // authReadyPromise resolves in FirebaseClientProvider once
      // getRedirectResult() completes (success or error).
      authReadyPromise.then(() => {
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [auth]);

  return { user, loading };
}
