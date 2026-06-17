'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, TrendingUp, Trophy, Zap, ExternalLink } from 'lucide-react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { useUser, useAuth } from '@/firebase';

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

/**
 * Reliably detect iOS PWA standalone mode.
 *
 * navigator.standalone is the ONLY reliable signal on iOS Safari.
 * window.matchMedia('(display-mode: standalone)') is NOT reliable on iOS —
 * it can return true inside regular Safari on some iOS versions.
 *
 * We use navigator.standalone exclusively for iOS detection.
 * For Android/Desktop we fall back to matchMedia.
 */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari sets navigator.standalone = true only when launched from home screen
  if ((window.navigator as any).standalone === true) return true;
  // Android Chrome / Desktop fallback
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const { user, loading: userLoading } = useUser();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [branding, setBranding] = useState<{
    companyName?: string;
    tagline?: string;
    logoUrl?: string | null;
    animatedLogoUrl?: string | null;
    useAnimatedLogo?: boolean;
  } | null>(null);

  // Poll for auth state when in PWA mode — the user may sign in via Safari
  // and then return to the PWA. We poll every 2 seconds to pick up the session.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsPreview(hostname.endsWith('.cloudworkstations.dev'));
    setAppUrl(window.location.origin);
    setIsPWA(detectStandalone());
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
      // Clear any polling interval
      if (pollRef.current) clearInterval(pollRef.current);
      router.replace('/dashboard');
    }
  }, [user, userLoading, router]);

  // When in PWA mode and not signed in, poll auth state every 2s.
  // This catches the case where the user signed in via Safari and returned.
  useEffect(() => {
    if (!isPWA || userLoading || user) return;

    pollRef.current = setInterval(() => {
      // auth.currentUser is updated by Firebase SDK automatically when
      // localStorage changes (which happens when Safari signs in).
      // Force a re-check by reloading the current user.
      auth.currentUser?.reload().catch(() => {});
      // The onAuthStateChanged in client-provider will fire if user changed.
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isPWA, userLoading, user, auth]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
      setIsSigningIn(false);
    } catch (error: any) {
      const code = error?.code ?? '';

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setIsSigningIn(false);
        return;
      }

      if (code === 'auth/popup-blocked') {
        // This should not happen in regular Safari — only in PWA mode.
        // If it does, show a helpful message but do NOT show the PWA card
        // (that would be confusing in regular Safari).
        setErrorMsg('Sign-in popup was blocked. If you are using the home screen app, tap "Open in Safari to Sign In" below.');
        setIsSigningIn(false);
        return;
      }

      console.error('Sign-in error:', error);
      setErrorMsg(error?.message ?? 'Failed to sign in. Please try again.');
      setIsSigningIn(false);
    }
  };

  /**
   * Open the app URL in real Safari.
   *
   * From within a PWA on iOS, <a target="_blank"> opens in a Safari View Controller
   * (in-app browser) — NOT in real Safari. That means the session is isolated
   * and cannot be shared back to the PWA.
   *
   * The only way to open real Safari from a PWA is:
   *   window.location.href = url
   * This navigates the PWA itself to the URL, which iOS then opens in Safari
   * because the URL is the same as the PWA's scope — Safari takes over.
   *
   * We append ?pwa=1 so Safari knows to redirect back to the PWA after sign-in.
   */
  const openInSafari = () => {
    // Navigate the current window to the app URL — iOS will open this in Safari
    // because it matches the PWA's registered scope.
    window.location.href = `${appUrl}/?from=pwa`;
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
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />

      <div
        className="relative z-10 flex min-h-full flex-col items-center justify-center overflow-y-auto px-4 py-6"
        style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      >
        <div className="flex w-full max-w-md flex-col items-center gap-8">

          {/* Logo / Brand */}
          <div className="flex flex-col items-center gap-3 text-center">
            {activeLogo ? (
              <img src={activeLogo} alt={companyName} className="h-16 w-auto object-contain" />
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

            {isPWA ? (
              /* ── iOS PWA mode: show Open in Safari flow ── */
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
                  <p className="text-sm font-semibold text-blue-900 mb-1">One-time setup required</p>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Tap the button below to sign in through Safari.
                    After signing in, come back to this app — you will go straight to your dashboard.
                  </p>
                </div>

                <Button
                  onClick={openInSafari}
                  className="w-full h-12 text-base font-semibold gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ExternalLink className="h-5 w-5" />
                  Sign In with Google
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  This only needs to be done once. After that, the app opens directly to your dashboard.
                </p>
              </div>
            ) : (
              /* ── Regular browser: normal Google sign-in ── */
              <>
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
              </>
            )}
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

          {/* Dev tools */}
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
