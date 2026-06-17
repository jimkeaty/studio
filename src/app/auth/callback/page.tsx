'use client';
/**
 * /auth/callback
 *
 * This page handles the Firebase email sign-in link (magic link) callback.
 * When an agent taps the "Sign In to Dashboard" link in their email, they
 * land here. We complete the sign-in using isSignInWithEmailLink +
 * signInWithEmailLink, then redirect to the dashboard.
 *
 * This works perfectly in iOS PWA standalone mode because:
 *  - No popup needed
 *  - No third-party cookies needed
 *  - The link opens in Safari (email links always open in Safari on iOS)
 *  - Firebase stores the session in localStorage which is shared with the PWA
 *  - Agent can then open the home screen icon and go straight to dashboard
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSignInWithEmailLink, signInWithEmailLink, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const auth = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const completeSignIn = async () => {
      try {
        const href = window.location.href;

        // Verify this is actually a sign-in link
        if (!isSignInWithEmailLink(auth, href)) {
          setStatus('error');
          setErrorMsg('This link is not valid or has already been used. Please request a new sign-in link.');
          return;
        }

        // Get the email — stored in localStorage when the magic link was requested
        let email = window.localStorage.getItem('emailForSignIn');

        if (!email) {
          // Email not found in localStorage — this can happen if the agent opens
          // the link on a different device than where they requested it.
          // Ask them to enter their email.
          email = window.prompt('Please enter your email address to complete sign-in:');
          if (!email) {
            setStatus('error');
            setErrorMsg('Email address required to complete sign-in.');
            return;
          }
        }

        // Complete the sign-in
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailLink(auth, email, href);

        // Clean up
        window.localStorage.removeItem('emailForSignIn');

        setStatus('success');

        // Redirect to dashboard after a brief success flash
        setTimeout(() => {
          router.replace('/dashboard');
        }, 1200);
      } catch (err: any) {
        console.error('[auth/callback] sign-in error:', err);
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

        {/* Logo */}
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
