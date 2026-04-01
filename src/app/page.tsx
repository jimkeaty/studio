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

  useEffect(() => {
    const currentHostname = window.location.hostname;
    setIsPreview(currentHostname.endsWith('.cloudworkstations.dev'));
  }, []);

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
      const isCloudworkstations = hostname.endsWith('.cloudworkstations.dev');
      if (isCloudworkstations) {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithRedirect(auth, provider);
        return;
      }
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
      setIsSigningIn(false);
    } catch (error: any) {
      console.error('Sign-in initiation error:', error);
      setErrorMsg(error?.message ?? 'Failed to sign in');
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

  if (userLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: Brand story ───────────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950 text-white">
        {/* Logo */}
        <div>
          <div className="text-3xl font-black tracking-tight">
            Smart Broker <span className="text-blue-400">USA</span>
          </div>
          <div className="mt-8 text-2xl font-bold leading-snug text-white/90 max-w-sm">
            The command center for top-producing real estate agents.
          </div>
          <p className="mt-4 text-white/60 text-sm leading-relaxed max-w-xs">
            Track every deal, every commission, and every milestone — all in one place designed for closers.
          </p>
        </div>

        {/* Social proof stats */}
        <div className="space-y-4">
          {BRAND_STATS.map(({ icon: Icon, value, label, color }) => (
            <div key={value} className="flex items-center gap-4 py-4 border-b border-white/10">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <div className="text-xl font-black">{value}</div>
                <div className="text-sm text-white/60">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-white/30">
          © {new Date().getFullYear()} Smart Broker USA. All rights reserved.
        </div>
      </div>

      {/* ── Right panel: Sign-in ──────────────────────────────────────────── */}
      <div className="flex flex-1 lg:max-w-md flex-col justify-center px-8 py-12 bg-background">
        {/* Mobile logo (only shown on small screens) */}
        <div className="lg:hidden mb-8 text-center">
          <div className="text-2xl font-black tracking-tight text-foreground">
            Smart Broker <span className="text-primary">USA</span>
          </div>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-1">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to your Smart Broker dashboard</p>

          {errorMsg && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sign-in Error</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {isPreview ? (
            <Alert className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Preview Mode</AlertTitle>
              <AlertDescription>
                Authentication is disabled in this preview environment.
                <Button asChild className="w-full mt-4">
                  <a href="https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app" target="_blank" rel="noopener noreferrer">
                    Open Live App
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all duration-200 font-semibold text-foreground text-base disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Continue with Google
                  </>
                )}
              </button>

              {process.env.NODE_ENV !== 'production' && (
                <Button variant="secondary" className="w-full mt-3" onClick={copyIdToken} disabled={isSigningIn}>
                  Copy ID Token (debug)
                </Button>
              )}
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
