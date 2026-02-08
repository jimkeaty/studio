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
import { AlertTriangle, Building, Loader2 } from 'lucide-react';

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true);
  const [errorMsg, setErrorMsg] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // User successfully signed in.
          console.log('Google redirect login success:', result.user.email);
          router.replace('/dashboard');
        } else {
          // No redirect result, so the user has just landed on the page.
          setIsCheckingRedirect(false);
        }
      } catch (err: any) {
        // This is where errors from the redirect flow will be caught.
        console.error('Redirect result error:', err);
        if (err.code === 'auth/unauthorized-domain') {
          const currentHost = window.location.hostname;
          const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

          setErrorMsg(
            <div className="space-y-2 text-left">
              <p>
                Your app's domain is not authorized. This is a standard Firebase security step.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Go to the <a href="https://console.firebase.google.com/" className="underline" target="_blank" rel="noopener noreferrer">Firebase Console</a>.</li>
                <li>Select project: <strong className="font-mono">{projectId || 'smart-broker-usa'}</strong>.</li>
                <li>Navigate to: <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong>.</li>
                <li>Click <strong>Add domain</strong> and enter this exact value:</li>
              </ol>
              <pre className="mt-1 w-full overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
                {currentHost}
              </pre>
              <p className="text-xs text-muted-foreground pt-2">It may take a few minutes for the change to take effect after adding the domain.</p>
            </div>
          );
        } else {
          setErrorMsg(String(err?.message || 'An unexpected error occurred during sign-in.'));
        }
        setIsCheckingRedirect(false);
      }
    };

    checkRedirect();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsSigningIn(true);
    const provider = new GoogleAuthProvider();
    
    // Errors are handled by getRedirectResult on page load after redirect.
    await signInWithRedirect(auth, provider);
  };
  
  if (isCheckingRedirect) {
    return (
       <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking authentication status...</p>
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
              Sign in with Google to access your dashboard.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            <Button
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
                'Sign in with Google'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
