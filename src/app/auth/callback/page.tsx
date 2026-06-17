'use client';
/**
 * /auth/callback
 *
 * Handles the Firebase email sign-in link (magic link) callback.
 *
 * IMPORTANT: useSearchParams() in Next.js App Router requires a <Suspense>
 * boundary — without it the page renders blank on production builds.
 * We split into an outer shell (with Suspense) and an inner component.
 *
 * Email is read from the URL query param (?email=...) — NOT from localStorage,
 * because iOS PWA and Safari have SEPARATE localStorage contexts.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────
function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const completeSignIn = async () => {
      try {
        const href = window.location.href;

        if (!isSignInWithEmailLink(auth, href)) {
          setStatus('error');
          setErrorMsg('This link is not valid or has already been used. Please request a new sign-in link.');
          return;
        }

        // Email is embedded in the URL by the send-magic-link API
        const email = searchParams.get('email');
        if (!email) {
          setStatus('error');
          setErrorMsg('Sign-in link is missing the email address. Please request a new link.');
          return;
        }

        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailLink(auth, email, href);

        setStatus('success');
        setTimeout(() => router.replace('/dashboard'), 1200);
      } catch (err: any) {
        console.error('[auth/callback] error:', err);
        const code = err?.code ?? '';
        if (code === 'auth/invalid-action-code') {
          setErrorMsg('This sign-in link has expired or already been used. Please request a new one.');
        } else if (code === 'auth/user-disabled') {
          setErrorMsg('Your account has been disabled. Please contact your administrator.');
        } else {
          setErrorMsg(err?.message ?? 'Sign-in failed. Please request a new link.');
        }
        setStatus('error');
      }
    };

    completeSignIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold shadow-lg">
          K
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="text-lg font-semibold text-foreground">Signing you in…</p>
              <p className="text-sm text-muted-foreground mt-1">Just a moment</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold text-foreground">Signed in!</p>
              <p className="text-sm text-muted-foreground mt-1">Taking you to your dashboard…</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div>
              <p className="text-lg font-semibold text-foreground">Sign-in failed</p>
              <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>
            </div>
            <button
              onClick={() => router.replace('/')}
              className="mt-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Outer shell with Suspense boundary (required by Next.js App Router) ───────
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
