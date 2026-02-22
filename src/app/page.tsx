'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Building, Loader2, AlertTriangle } from 'lucide-react';

import { GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" {...props}>
        <g fill="none" fillRule="evenodd">
            <path fill="#4285F4" d="M17.64 9.2045c0-.6364-.0568-1.2727-.1705-1.8182H9v3.4545h4.8409c-.2159.9773-.625 1.875-1.5341 2.5682v2.3182h2.8864c1.6818-1.5568 2.6591-3.75 2.6591-6.5227z"/>
            <path fill="#34A853" d="M9 18c2.4545 0 4.5114-.8068 6.0227-2.1818l-2.8864-2.3182c-.8068.5455-1.8409.8636-3.1363.8636-2.4205 0-4.4659-1.625-5.1932-3.8182H.9773v2.375C2.4886 16.9205 5.4545 18 9 18z"/>
            <path fill="#FBBC05" d="M3.8068 10.7727c-.1818-.5454-.2841-1.125-.2841-1.7272s.1023-1.1818.2841-1.7273V5.0909H.9773C.6023 6.2841.3864 7.5455.3864 8.9545s.2159 2.6705.5909 3.8636l2.8295-2.0454z"/>
            <path fill="#EA4335" d="M9 3.5455c1.3295 0 2.5114.4545 3.4432 1.3523l2.5568-2.5569C13.5114 1.1364 11.4545.3182 9 .3182c-3.5455 0-6.5114 2.0795-8.0227 4.8636L3.8068 7.5c.7273-2.1932 2.7727-3.9545 5.1932-3.9545z"/>
        </g>
    </svg>
);


export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // This single listener handles both initial state check and post-redirect state.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in, redirect to the dashboard.
        router.replace('/dashboard');
      } else {
        // No user is signed in. It's now safe to show the login form.
        setIsLoading(false);
      }
    });

    // We also process the redirect result on component mount. 
    // If successful, onAuthStateChanged above will be triggered with the user.
    getRedirectResult(auth)
      .catch((error) => {
        console.error("Redirect sign-in error:", error);
        setErrorMsg(error.message || 'Failed to sign in after redirect.');
        // If there's an error, we should still stop loading to show the error message.
        setIsLoading(false);
      });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);

    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider).catch(error => {
        console.error("signInWithRedirect error:", error);
        setErrorMsg(error.message || "Could not start the sign-in process.");
        setIsSigningIn(false);
    });
  };
  
  if (isLoading) {
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
                    Redirecting to Google...
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
      </div>
    </div>
  );
}
