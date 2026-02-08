'use client';

import { useState } from 'react';
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
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<React.ReactNode | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setBusy(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      // User signed in successfully.
      console.log('Google popup login success:', result.user.email);
      router.replace('/dashboard');
    } catch (err: any) {
      console.error('Sign-in click error:', err);

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
              <li>Select project: <strong className="font-mono">{projectId}</strong>.</li>
              <li>Navigate to: <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong>.</li>
              <li>Click <strong>Add domain</strong> and enter this exact value:</li>
            </ol>
            <pre className="mt-1 w-full overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              {currentHost}
            </pre>
            <p className="text-xs text-muted-foreground pt-2">It may take a few minutes for the change to take effect after adding the domain.</p>
          </div>
        );
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMsg('Pop-up was blocked by the browser. Please allow pop-ups for this site and try again.');
      } else {
        setErrorMsg(String(err?.message || 'An unexpected error occurred.'));
      }
      setBusy(false);
    }
  };

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
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait
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
