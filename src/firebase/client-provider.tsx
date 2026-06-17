'use client';
/**
 * FirebaseClientProvider — the ONLY auth file that matters.
 *
 * DESIGN PRINCIPLE: Maximum simplicity. No redirect flow.
 *
 * We use signInWithPopup exclusively (no signInWithRedirect).
 * This means:
 *  - No getRedirectResult() needed
 *  - No race conditions between getRedirectResult and onAuthStateChanged
 *  - No third-party cookie dependency (redirect flow requires them;
 *    Safari 16.1+, Firefox 109+, Chrome 115+ all block them by default)
 *
 * Auth state flow:
 *  1. loading=true on mount
 *  2. onAuthStateChanged fires once with current user (or null)
 *  3. loading=false — dashboard guard now has the real answer
 *  4. If user is null → login page shows
 *  5. User clicks "Continue with Google" → signInWithPopup
 *  6. Popup closes → onAuthStateChanged fires again with signed-in user
 *  7. login page useEffect sees user → router.replace('/dashboard')
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

    // Register service worker for PWA / push notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    // Subscribe to auth state. Since we use signInWithPopup exclusively,
    // the first call will correctly reflect the current auth state with no
    // race conditions. loading stays true until this fires.
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsub();
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
