'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Building, Loader2, AlertTriangle } from 'lucide-react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" {...props}>
      <g fill="none" fillRule="evenodd">
        <path
          fill="#4285F4"
          d="M17.64 9.2045c0-.6364-.0568-1.2727-.1705-1.8182H9v3.4545h4.8409c-.2159.9773-.625 1.875-1.5341 2.5682v2.3182h2.8864c1.6818-1.5568 2.6591-3.75 2.6591-6.5227z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.4545 0 4.5114-.8068 6.0227-2.1818l-2.8864-2.3182c-.8068.5455-1.8409.8636-3.1363.8636-2.4205 0-4.4659-1.625-5.1932-3.8182H.9773v2.375C2.4886 16.9205 5.4545 18 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.8068 10.7727c-.1818-.5454-.2841-1.125-.2841-1.7272s.1023-1.1818.2841-1.7273V5.0909H.9773C.6023 6.2841.3864 7.5455.3864 8.9545s.2159 2.6705.5909 3.8636l2.8295-2.0454z"
        />
        <path
          fill="#EA4335"
          d="M9 3.5455c1.3295 0 2.5114.4545 3.4432 1.3523l2.5568-2.5569C13.5114 1.1364 11.4545.3182 9 .3182c-3.5455 0-6.5114 2.0795-8.0227 4.8636L3.8068 7.5c.7273-2.1932 2.7727-3.9545 5.1932-3.9545z"
        />
      </g>
    </svg>
);


export default function Home() {
    const router = useRouter();
    const [authReady, setAuthReady] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const authCheckRef = useRef(false);

    // New state for environment detection
    const [isPreview, setIsPreview] = useState(false);
    
    useEffect(() => {
        // This effect runs only on the client, so `window` is safe.
        const currentHostname = window.location.hostname;
        const isCloudworkstations = currentHostname.endsWith('.cloudworkstations.dev');

        // Treat ONLY Studio embedded preview as "preview" (usually port 9000 or embedded param).
        const isStudioEmbedded = window.location.search.includes('embedded=');
        const isPreviewEnv = isCloudworkstations && (window.location.port === '9000' || isStudioEmbedded);

        setIsPreview(isPreviewEnv);

        const authTimeout = window.setTimeout(() => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Auth Guard] Failsafe timer fired. Forcing authReady=true');
          }
          setAuthReady(true);
        }, 2500);

        if (process.env.NODE_ENV === 'development') {
            console.log(`[Auth Guard] Hostname: ${currentHostname}, Is Preview: ${isPreviewEnv}`);
        }
        
        if (authCheckRef.current) {
            return;
        }
        authCheckRef.current = true;

        if (process.env.NODE_ENV === 'development') {
            console.log('[Auth Guard] Starting auth checks...');
        }
        
        getRedirectResult(auth)
            .then((result) => {
                if (result) {
                    if (process.env.NODE_ENV === 'development') {
                        console.log('[Auth Guard] getRedirectResult SUCCESS:', { uid: result.user.uid });
                    }
                }
            })
            .catch((error) => {
                console.error("[Auth Guard] getRedirectResult ERROR:", error);
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Auth Guard] getRedirectResult ERROR details:', { code: error.code, message: error.message });
                }
                setErrorMsg(error.message || 'Failed to complete sign-in after redirect.');
            });

        const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
            window.clearTimeout(authTimeout);
            if (process.env.NODE_ENV === 'development') {
                console.log('[Auth Guard] onAuthStateChanged fired. User:', user?.uid ?? 'null');
            }

            if (user) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Auth Guard] User is signed in, redirecting to /dashboard');
                }
                router.replace('/dashboard');
            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Auth Guard] No user found. Setting authReady=true');
                }
                setAuthReady(true);
            }
        });

        return () => {
            if (process.env.NODE_ENV === 'development') {
                console.log('[Auth Guard] Cleaning up onAuthStateChanged listener.');
            }
            window.clearTimeout(authTimeout);
            unsubscribe();
        };
    }, [router]);


    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        setErrorMsg(null);
        const provider = new GoogleAuthProvider();

        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInWithPopup(auth, provider);
        } catch (error: any) {
            console.error("Google Sign-In Error:", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                setErrorMsg(error.message || "Could not complete the sign-in process.");
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    if (!authReady) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Authenticating...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Building className="h-12 w-12 text-primary" />
                </div>
                
                {isPreview ? (
                     <Card>
                        <CardHeader className="text-center">
                            <CardTitle className="text-2xl font-bold">
                                Preview Environment
                            </CardTitle>
                            <CardDescription>
                                Authentication is disabled in this preview window.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                             <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Action Required</AlertTitle>
                                <AlertDescription>
                                    To sign in and test the application, please use the live production URL.
                                </AlertDescription>
                            </Alert>
                            <Button asChild className="w-full mt-4">
                                <a href="https://smart-broker-usa.web.app" target="_blank" rel="noopener noreferrer">
                                    Open Production App
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader className="text-center">
                            <CardTitle className="text-2xl font-bold">
                                Welcome to Smart Broker USA
                            </CardTitle>
                            <CardDescription>
                                Sign in to access your dashboard.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {errorMsg && (
                                <Alert variant="destructive" className="mb-4">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Sign-in Error</AlertTitle>
                                    <AlertDescription>{errorMsg}</AlertDescription>
                                </Alert>
                            )}
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleGoogleSignIn}
                                disabled={isSigningIn}
                            >
                                {isSigningIn ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Please wait...
                                    </>
                                ) : (
                                    <>
                                        <GoogleIcon className="mr-2 h-5 w-5" />
                                        Sign in with Google
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
