'use client';
/**
 * FirebaseClientProvider — the ONLY auth file that matters.
 *
 * DESIGN PRINCIPLE: Keep it as simple as possible.
 *
 * Everything lives here:
 *  - Firebase app + auth initialization
 *  - getRedirectResult() called ONCE (singleton, never duplicated)
 *  - onAuthStateChanged subscription
 *  - AuthContext with { user, loading, auth }
 *
 * Components call useAuthContext() directly — no useUser hook, no
 * intermediate providers, no promise chains, no refs.
 *
 * HOW THE LOOP IS PREVENTED:
 *  - `loading` starts as true
 *  - We call getRedirectResult() first, then subscribe to onAuthStateChanged
 *  - onAuthStateChanged fires AFTER getRedirectResult resolves (Firebase
 *    guarantees this ordering when called in the same tick)
 *  - We only set loading=false inside onAuthStateChanged
 *  - The dashboard guard only redirects when loading===false && user===null
 *  - Result: the guard never sees a false null
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase';
import type { FirebaseApp } from 'firebase/app';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

// ── Context ───────────────────────────────────────────────────────────────────

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  auth: Auth;
  app: FirebaseApp;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside FirebaseClientProvider');
  return ctx;
}

// Convenience aliases so existing code that calls useAuth() / useUser() still works
export function useAuth(): Auth {
  return useAuthContext().auth;
}

export function useUser(): { user: User | null; loading: boolean } {
  const { user, loading } = useAuthContext();
  return { user, loading };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const app = useMemo(() => getFirebaseApp(), []);
  const auth = useMemo(() => getFirebaseAuth(), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    // THE KEY: call getRedirectResult() first, then subscribe.
    // Firebase processes the redirect credential synchronously before
    // onAuthStateChanged fires — so by the time our callback runs,
    // auth.currentUser is already the signed-in user.
    getRedirectResult(auth)
      .catch((err) => {
        // Non-fatal — a failed redirect just means sign in again
        console.warn('[Auth] getRedirectResult:', err?.code);
      })
      .finally(() => {
        // Now subscribe. At this point Firebase has processed any redirect
        // credential, so the first onAuthStateChanged call will have the
        // correct user (not null).
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser);
          setLoading(false);
        });

        // Store unsub for cleanup — we can't return it from .finally()
        // so we use a module-level variable trick
        _unsub = unsub;
      });

    return () => {
      if (_unsub) { _unsub(); _unsub = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't render on server — avoids hydration mismatch
  if (!mounted) return null;

  return (
    <AuthContext.Provider value={{ user, loading, auth, app }}>
      <FirebaseErrorListener>{children}</FirebaseErrorListener>
    </AuthContext.Provider>
  );
}

// Module-level cleanup ref (avoids needing useRef for the unsubscribe)
let _unsub: (() => void) | null = null;
