'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // redirectChecked: true once getRedirectResult() has resolved.
  // Prevents the login page from flashing while Firebase processes the
  // OAuth redirect result on mobile Chrome (where the redirect takes a
  // moment to resolve after Google sends the user back to the app).
  const [redirectChecked, setRedirectChecked] = useState(false);

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

    // Process Google redirect sign-in result.
    // This is a no-op if the user did not arrive via signInWithRedirect.
    // MUST await before allowing the login page to render its sign-in button,
    // otherwise onAuthStateChanged fires with user=null during the brief window
    // before Firebase processes the redirect credential — causing a redirect loop.
    getRedirectResult(auth)
      .then((result) => {
        if (result && process.env.NODE_ENV === 'development') {
          console.log('Firebase redirect result processed successfully:', result.user?.email);
        }
      })
      .catch((error) => {
        console.error('Error processing Firebase redirect result:', error);
      })
      .finally(() => {
        setRedirectChecked(true);
      });
  }, [auth]);

  // Prevent hydration mismatch by ensuring server + first client render match.
  // Also block rendering until getRedirectResult() has resolved to prevent
  // the login page from appearing briefly before the redirect auth completes.
  if (!mounted || !redirectChecked) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
