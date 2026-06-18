'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, TrendingUp, Trophy, Zap, Mail, CheckCircle, ArrowLeft } from 'lucide-react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
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
 * Detect iOS PWA standalone mode.
 * navigator.standalone is the ONLY reliable signal on iOS Safari.
 * It is true ONLY when launched from the home screen icon.
 */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as any).standalone === true) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

type OtpStep = 'email' | 'code' | 'verifying';

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const { user, loading: userLoading } = useUser();

  // Google sign-in state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // OTP state (PWA mode)
  const [otpStep, setOtpStep] = useState<OtpStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Environment detection
  const [isPreview, setIsPreview] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  // Branding
  const [branding, setBranding] = useState<{
    companyName?: string;
    tagline?: string;
    logoUrl?: string | null;
    animatedLogoUrl?: string | null;
    useAnimatedLogo?: boolean;
  } | null>(null);

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsPreview(hostname.endsWith('.cloudworkstations.dev'));
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
      router.replace('/dashboard');
    }
  }, [user, userLoading, router]);

  // Focus code input when moving to code step
  useEffect(() => {
    if (otpStep === 'code') {
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }, [otpStep]);

  // ── Google sign-in (regular browser only) ─────────────────────────────────
  const handleGoogleSignIn = async () => {
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
      console.error('Sign-in error:', error);
      setErrorMsg(error?.message ?? 'Failed to sign in. Please try again.');
      setIsSigningIn(false);
    }
  };

  // ── OTP: Step 1 — send code ────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSendingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setOtpError(data.error ?? 'Failed to send code. Please try again.');
        setIsSendingOtp(false);
        return;
      }
      setSessionToken(data.sessionToken ?? null);
      setOtpStep('code');
      setIsSendingOtp(false);
    } catch {
      setOtpError('Network error. Please check your connection and try again.');
      setIsSendingOtp(false);
    }
  };

  // ── OTP: Step 2 — verify code and sign in directly in this window ──────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setOtpStep('verifying');
    setOtpError(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otpCode.trim(), sessionToken }),
      });
      const data = await res.json();
      if (!data.ok) {
        setOtpError(data.error ?? 'Incorrect code. Please try again.');
        setOtpStep('code');
        setOtpCode('');
        return;
      }
      // Sign in with the custom token — this happens IN the PWA context, no redirect
      await setPersistence(auth, browserLocalPersistence);
      await signInWithCustomToken(auth, data.customToken);
      // onAuthStateChanged fires → useUser updates → useEffect above redirects to /dashboard
    } catch {
      setOtpError('Verification failed. Please try again.');
      setOtpStep('code');
      setOtpCode('');
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

            {isPWA ? (
              /* ── iOS PWA: 6-digit OTP — everything happens in this window ── */
              <>
                {otpStep === 'email' && (
                  <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
                    {otpError && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{otpError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="email" className="text-sm font-medium text-foreground">
                        Work email address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@keatyrealestate.com"
                        required
                        autoComplete="email"
                        autoCapitalize="none"
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isSendingOtp || !email.trim()}
                      className="w-full h-12 text-base font-semibold gap-2"
                    >
                      {isSendingOtp ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Mail className="h-5 w-5" />
                      )}
                      {isSendingOtp ? 'Sending code…' : 'Send Sign-In Code'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      We will email you a 6-digit code. No password needed.
                    </p>
                  </form>
                )}

                {(otpStep === 'code' || otpStep === 'verifying') && (
                  <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() => { setOtpStep('email'); setOtpCode(''); setOtpError(null); }}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Back"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <p className="text-sm text-muted-foreground">
                        Code sent to <strong className="text-foreground">{email}</strong>
                      </p>
                    </div>
                    {otpError && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{otpError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="otp" className="text-sm font-medium text-foreground">
                        Enter your 6-digit code
                      </label>
                      <input
                        id="otp"
                        ref={codeInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        required
                        autoComplete="one-time-code"
                        disabled={otpStep === 'verifying'}
                        className="w-full rounded-lg border bg-background px-3 py-3 text-center text-2xl font-mono font-bold tracking-[0.5em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={otpCode.length !== 6 || otpStep === 'verifying'}
                      className="w-full h-12 text-base font-semibold gap-2"
                    >
                      {otpStep === 'verifying' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-5 w-5" />
                      )}
                      {otpStep === 'verifying' ? 'Signing in…' : 'Sign In'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setOtpStep('email'); setOtpCode(''); setOtpError(null); }}
                      className="text-center text-xs text-muted-foreground underline underline-offset-2"
                    >
                      Resend code or use a different email
                    </button>
                  </form>
                )}
              </>
            ) : (
              /* ── Regular browser: Google sign-in ── */
              <>
                {errorMsg && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Sign-in Error</AlertTitle>
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleGoogleSignIn}
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
