'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, TrendingUp, Trophy, Zap } from 'lucide-react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { useUser } from '@/firebase';
import { useAuth } from '@/firebase/provider';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 18 18" {...props}>
    <g fill="none" fillRule="evenodd">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6364-.0568-1.2727-.1705-1.8182H9v3.4545h4.8409c-.2159.9773-.625 1.875-1.5341 2.5682v2.3182h2.8864c1.6818-1.5568 2.6591-3.75 2.6591-6.5227z" />
      <path fill="#34A853" d="M9 18c2.4545 0 4.5114-.8068 6.0227-2.1818l-2.8864-2.3182c-.8068.5455-1.8409.8636-3.1363.8636-2.4205 0-4.4659-1.625-5.1932-3.8182H.9773v2.375C2.4886 16.9205 5.4545 18 9 18z" />
      <path fill="#FBBC05" d="M3.8068 10.7727c-.1818-.5454-.2841-1.125-.2841-1.7272s.1023-1.1818.2841-1.7273V5.0909H.9773C.6023 6.2841.3864 7.5455.3864 8.9545s.2159 2.6705.5909 3.8636l2.8295-2.0454z" />
      <path fill="#EA4335" d="M9 3.5455c1.3295 0 2.5114.4545 3.4432 1.3523l2.5568-2.5569C13.5114 1.1364 11.4545.3182 9 .3182c-3.5455 0-6.5114 2.0795-8.0227 4.8636L3.8068 7.5c.7273-2.1932 2.7727-3.9545 5.1932-3.9545z" />
    </g>
  </svg>
);

const BRAND_STATS = [
  { icon: Trophy, value: '$2.4M+', label: 'Average team GCI tracked annually', color: 'text-amber-400' },
  { icon: TrendingUp, value: '847+', label: 'Transactions closed and tracked', color: 'text-emerald-400' },
  { icon: Zap, value: '94%', label: 'Agents who hit their annual goal', color: 'text-blue-400' },
];

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const { user, loading: userLoading } = useUser();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [branding, setBranding] = useState<{
    companyName?: string;
    tagline?: string;
    logoUrl?: string | null;
    animatedLogoUrl?: string | null;
    useAnimatedLogo?: boolean;
  } | null>(null);

  useEffect(() => {
    const currentHostname = window.location.hostname;
    setIsPreview(currentHostname.endsWith('.cloudworkstations.dev'));
  }, []);

  useEffect(() => {
    fetch('/api/branding')
      .then(r => r.json())
      .then(d => { if (d.ok && d.branding) setBranding(d.branding); })
      .catch(() => {});
  }, []);

  // Redirect to dashboard once signed in
  useEffect(() => {
    if (!userLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, userLoading, router]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

      // ── Cloudworkstations preview: always redirect with session persistence ──
      if (hostname.endsWith('.cloudworkstations.dev')) {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithRedirect(auth, provider);
        return;
      }

      await setPersistence(auth, browserLocalPersistence);

      // ── Sign-in strategy ────────────────────────────────────────────────────
      //
      // CRITICAL: When running as a PWA (standalone mode, added to home screen),
      // signInWithRedirect MUST NOT be used. When the app is in standalone mode,
      // iOS intercepts the redirect return URL and opens it in regular Safari
      // instead of back in the PWA — so the user ends up signed in inside Safari
      // but the PWA session never receives the credential and shows login again.
      //
      // PWA standalone: always use signInWithPopup.
      //   - The popup opens on top of the PWA, the user signs in, the popup
      //     closes, and onAuthStateChanged fires inside the PWA. No redirect.
      //
      // Mobile Safari (NOT standalone): use signInWithRedirect.
      //   - Popups from iMessage links / cold taps are blocked by iOS.
      //   - Redirect works fine in regular Safari because the return URL opens
      //     back in the same Safari tab.
      //
      // Desktop: try signInWithPopup first (better UX), redirect as fallback.
      //
      const isPWA =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      const isMobileSafari =
        /iPhone|iPad|iPod/i.test(window.navigator.userAgent) && !isPWA;

      if (isPWA) {
        // Standalone PWA: popup only — redirect breaks the PWA session on iOS
        try {
          await signInWithPopup(auth, provider);
          setIsSigningIn(false);
        } catch (popupError: any) {
          const code = popupError?.code ?? '';
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
            setIsSigningIn(false);
            return;
          }
          // If popup is somehow blocked in PWA mode, show a helpful message
          if (code === 'auth/popup-blocked') {
            setErrorMsg('Popup was blocked. Please open this app in Safari and sign in there first, then re-add it to your home screen.');
            setIsSigningIn(false);
            return;
          }
          throw popupError;
        }
        return;
      }

      if (isMobileSafari) {
        // Mobile Safari (not standalone): redirect is most reliable
        // The return URL opens back in the same Safari tab
        await signInWithRedirect(auth, provider);
        // Page navigates away — no need to setIsSigningIn(false)
        return;
      }

      // Desktop / Android: popup first, redirect fallback
      try {
        await signInWithPopup(auth, provider);
        setIsSigningIn(false);
      } catch (popupError: any) {
        const code = popupError?.code ?? '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setIsSigningIn(false);
          return;
        }
        if (code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (error: any) {
      console.error('Sign-in error:', error);
      setErrorMsg(error?.message ?? 'Failed to sign in. Please try again.');
      setIsSigningIn(false);
    }
  };

  const copyIdToken = async () => {
    try {
      const u = auth.currentUser;
      if (!u) { setErrorMsg('No signed-in user found yet.'); return; }
      const token = await u.getIdToken(true);
      await navigator.clipboard.writeText(token);
      alert('✅ ID token copied to clipboard.');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to copy ID token');
    }
  };

  // Determine which logo URL to use
  const activeLogo = branding?.useAnimatedLogo && branding?.animatedLogoUrl
    ? branding.animatedLogoUrl
    : branding?.logoUrl ?? null;
  const companyName = branding?.companyName || 'Keaty Real Estate';

  if (userLoading || user) {
    return (
      <div
        className="flex bg-background"
        style={{
          minHeight: '100dvh',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    /*
     * Outer wrapper: full screen, no overflow hidden so the gradient bleeds
     * edge-to-edge. Safe-area insets are applied HERE so the available space
     * for centering is already inside the safe area — not on the scroll
     * container — which is what makes justify-center work correctly on iPhone.
     */
    <div
      className="relative bg-background"
      style={{
        minHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />

      {/*
        Scrollable inner container.
        min-height fills the remaining space AFTER the safe-area padding above,
        so justify-center centres content within the visible area only.
        overflow-y-auto lets content scroll on very small screens (iPhone SE).
      */}
      <div
        className="relative z-10 flex min-h-full flex-col items-center justify-center overflow-y-auto px-4 py-6"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          {activeLogo ? (
            <img
              src={activeLogo}
              alt={companyName}
              className="h-16 w-auto object-contain"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold shadow-lg">
              {companyName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{companyName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {branding?.tagline || 'Sign in to your dashboard'}
            </p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your {companyName} dashboard
            </p>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sign-in Error</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full h-12 text-base font-medium gap-3"
            variant="outline"
          >
            {isSigningIn ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {isSigningIn ? 'Signing in…' : 'Continue with Google'}
          </Button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By signing in you agree to our{' '}
            <a href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a>.
          </p>
        </div>

        {/* Brand stats */}
        <div className="grid w-full grid-cols-3 gap-3">
          {BRAND_STATS.map(({ icon: Icon, value, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-xl border bg-card/60 p-3 text-center">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-sm font-bold text-foreground">{value}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Dev tools — only shown on preview/cloudworkstations */}
        {isPreview && (
          <div className="w-full rounded-xl border border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">Dev tools (preview only)</p>
            <Button size="sm" variant="ghost" onClick={copyIdToken} className="text-xs">
              Copy ID Token
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
